import { Downloader } from "../downloader";
import { Feed } from "../feed";
import { FeedItem } from "../feedItem";
import { History } from "../ingestion/history";
import { RSSFeedImporter } from "../ingestion/rssFeedImporter";
import { Logger } from "../logger";
import { PlayheadFeed } from "../playlist/playheadFeed";
import { CacheConfig } from "./cacheConfig";
import * as fs from "fs";
import * as nodepath from "path";
import { ICommonTagsResult, loadMusicMetadata } from 'music-metadata';
import { createReadStream } from 'node:fs';
import path from "node:path";
import { Metadata } from "./metadata";
import { it } from "node:test";
import { prependListener } from "node:process";

const CONFIG_FILE_NAME: string = `cache.json`;

export class Cache {
    private static _logger = Logger.GetNamedLogger("CACHE");
    private _workingDir: string;
    private _configPath: string;
    private _cacheConfig: CacheConfig;

    public get cacheDirectory(): string {
        return this._workingDir;
    }

    constructor(workingDir: string) {
        this._workingDir = workingDir;
        if (!fs.existsSync(workingDir)) {
            fs.mkdirSync(workingDir, { recursive: true });
        }

        this._configPath = `${workingDir}/${CONFIG_FILE_NAME}`;

        if (fs.existsSync(this._configPath)) {
            this._cacheConfig = CacheConfig.fromJSON(fs.readFileSync(this._configPath).toString());
        } else {
            this._cacheConfig = CacheConfig.empty();
        }
    }

    public copy(feedItem: FeedItem, newDir: string): Promise<void> {
        if (!this._cacheConfig.cachedContains(feedItem)) {
            throw new Error("Tried to copy a feed item that isn't in the cache");
        }
        const downloader: Downloader = new Downloader(feedItem, this);
        // We apply metadata at copy time, to ensure that imported files have
        // tags applied if necessary
        return Metadata.applyMetadata(downloader).then(() => {
            downloader.getPath().then(cachePath => {
                const newPath = `${newDir}/${nodepath.basename(cachePath)}`;
                Cache._logger(`Copying ${cachePath} to ${newPath}`, "Verbose");
                fs.copyFileSync(cachePath, newPath);
            });
        })
    }

    private determineArtist(common: ICommonTagsResult, feeds: Feed[]): Feed | null {
        const artist = common.artist || common.albumartist || common.album;

        if (artist === undefined) return null;

        const matchFeeds = feeds.filter((feed) => feed.name.toLowerCase().trim() === artist.toLowerCase().trim());
        if (matchFeeds.length !== 1) {
            return null;
        } else {
            return matchFeeds[0];
        }
    }

    private determineFeedItem(common: ICommonTagsResult, feeds: Feed[]): FeedItem | null {
        const title = common.title;
        if (title === undefined) return null;

        for (let i = 0; i < feeds.length; i++) {
            const feed = feeds[i];

            const matchItems = feed.items.filter(i => i.title.toLowerCase().trim() === title.toLowerCase().trim());
            if (matchItems.length !== 1) {
                continue;
            } else {
                Cache._logger(`Item match! ${title}: ${matchItems[0].title}, ${matchItems[0].author}`, "VeryVerbose");
                return matchItems[0];
            }
        }
        return null;
    }

    public async import(dirPath: string, recursive: boolean, ignoreArtist: boolean): Promise<void> {
        this.loadFeeds().then(async (feeds: Feed[]) => {
            try {
                const files = await fs.promises.readdir(dirPath);

                if (files.length > 0) {
                    Cache._logger(`Checking files in ${dirPath}`);
                }

                for (const fileName of files) {
                    const filePath = nodepath.join(dirPath, fileName);

                    const stat = await fs.promises.stat(filePath);

                    // Dynamic load the music-metadata ESM module
                    const { parseStream } = await loadMusicMetadata();
                    if (stat.isFile()) {
                        try {
                            const audioStream = createReadStream(filePath);

                            const metadata = await parseStream(audioStream).catch(() => {
                                Cache._logger(`Failed to read ${filePath}`);
                                return null;
                            });
                            if (metadata == undefined) continue;
                            const common = metadata.common;
                            Cache._logger(`${filePath}: ${[common.title, common.artist, common.artists, common.album]}`, "VeryVerbose");

                            const artist = this.determineArtist(common, feeds);
                            if (artist === null && !ignoreArtist) {
                                Cache._logger(`Could not find artist matches for ${filePath}, skipping`, "Verbose");
                                continue;
                            }
                            const searchFeeds = (artist !== null && !ignoreArtist) ? [artist] : feeds;
                            Cache._logger(`Found artist: ${artist?.name}. Matching against: ${searchFeeds.length} feeds (ignore artist: ${ignoreArtist}).`, "VeryVerbose");
                            const item = this.determineFeedItem(common, searchFeeds);
                            if (item === null) {
                                Cache._logger(`Could not match ${filePath} to a feed item (searched ${searchFeeds.length} feeds)`, "Verbose");
                                continue;
                            }
                            Cache._logger(`Matched ${item.title} to feed item authored by ${item.author}`, "Info");

                            const downloader = new Downloader(item, this);
                            downloader.extension = path.extname(filePath);
                            const destinationPath = await downloader.getPath();
                            if (!fs.existsSync(destinationPath)) {
                                Cache._logger(`Copying ${item.title} (${filePath}) - to ${destinationPath}`, "Verbose");
                                fs.copyFileSync(filePath, destinationPath);
                                this._cacheConfig.addToCache(item);
                                this.save();
                            } else {
                                Cache._logger(`Did not copy ${item.title} (${filePath}). Already a file in the cache at ${destinationPath}`, "Verbose");
                            }

                        } catch (error) {
                            console.error('Error parsing metadata:', (error as any));
                        }
                    }
                    else if (stat.isDirectory()) {
                        if (recursive) {
                            this.import(filePath, recursive, ignoreArtist).then((res) => {
                            });
                        }
                    }
                }
            }
            catch (e) {
                console.error("(CACHE) Importing failed. Cache files may be in invalid state", e);
            }
        });

    }

    /**
     * Doing this without downloading a file can result in
     * the cache becoming out of sync - be careful!
     */
    public markCachedUnsafe(item: FeedItem): void {
        this._cacheConfig.addToCache(item);
    }

    public cacheFeed(feed: Feed, latest: boolean, forced: boolean, episodeRegex?: string): Promise<void> {
        Cache._logger(`Caching feed: ${feed.name}`);
        let downloadSequence: Promise<FeedItem | void> = Promise.resolve();
        if (latest) {
            const latest: FeedItem = new PlayheadFeed(feed, new History([]), () => true).latest;
            if (!this.cachedOrSkipped(latest) || forced) {
                const itemDownloader = new Downloader(latest, this);
                downloadSequence = downloadSequence.then(() => {
                    return itemDownloader.download().then(() => {
                        this._cacheConfig.addToCache(latest);
                        Cache._logger(`${latest.title} cached`);
                    })
                });
            } else {
                Cache._logger(`${latest.title} is already cached or skipped, not downloading`);
            }
        } else {
            // Reverse so we do oldest -> newest
            feed.items.reverse().forEach(item => {
                if (!forced && this.cachedOrSkipped(item)) {
                    Cache._logger(`${item.title} is already cached or skipped, not downloading`);
                    return;
                }
                if (episodeRegex) {
                    const reg = new RegExp(episodeRegex);
                    if (!reg.test(item.title)) {
                        Cache._logger(`${item.title} does not match regex filter, not downloading`, "Verbose");
                        return;
                    }
                }
                Cache._logger(`Caching ${item.title}...`, "Verbose");
                const itemDownloader = new Downloader(item, this);
                downloadSequence = downloadSequence.then(() => {
                    return itemDownloader.download().then(() => {
                        this._cacheConfig.addToCache(item);
                        Cache._logger(`${item.title} cached`);
                    })
                });
            });
        }

        return downloadSequence.then(() => { });
    }

    public skipAll(): Promise<void> {
        return this.loadFeeds().then(feeds => {
            feeds.forEach(this.skip.bind(this));
        });
    }

    /**
     * Mark feed as cached, regardless of if we have the file or not
     */
    public skip(feed: Feed) {
        Cache._logger(`Skipping all items in ${feed.name}`);
        let count = 0;
        feed.items.forEach(item => {
            if (this.cachedOrSkipped(item)) return;
            count++;
            this._cacheConfig.addToSkip(item);
        });
        Cache._logger(`${count} items skipped (of ${feed.items.length} in the feed)`);
    }

    public skipItem(item: FeedItem) {
        if (this.cachedOrSkipped(item)) return;
        this._cacheConfig.addToSkip(item);
    }

    public update(latest: boolean): Promise<any> {
        return this.loadFeeds().then(feeds => {
            return Promise.allSettled(feeds.map(feed => this.cacheFeed(feed, latest, false)));
        });
    }

    /*
    Update the feeds
    */
    public refresh(refreshFeeds?: Feed[]): Promise<any> {
        // load all 
        return this.loadFeeds().then(feeds => {
            if (refreshFeeds) {
                const names = refreshFeeds.map(f => f.name);
                feeds = feeds.filter(feed => names.includes(feed.name));
            }
            let imports: Promise<any>[] = [];
            Cache._logger(`Fetching ${feeds.length} feeds...`);
            const logSink = Logger.ClaimContext();
            let counter = 0;
            feeds.forEach(feed => {
                const rssImport = new RSSFeedImporter(new URL(feed.url)).toFeed().then(newFeed => {
                    counter++;
                    const percent = counter / feeds.length;
                    if (newFeed !== null) {
                        this.writeFeed(newFeed);
                        // clear line
                        logSink(`\x1b[2K\r`);
                        logSink(`${Logger.getProgressAscii(percent)} ${newFeed.name} updated`);
                    } else {
                        console.warn(`(CACHE) RSS source ${feed.url} failed`);
                    }
                });
                imports.push(rssImport);
            });
            return Promise.allSettled(imports).then(x => {
                logSink(`\x1b[2K\r`);
                logSink(`${Logger.getProgressAscii(1)} All feeds updated`);
                Logger.ReleaseContext();
                return x;
            });
        });
    }

    public loadFeeds(): Promise<Feed[]> {
        return fs.promises.readdir(this._workingDir, { withFileTypes: true }).then(dirents => {
            return dirents.filter(dirent => dirent.isDirectory())
        }).then((subdirs: fs.Dirent[]) => {
            const feeds: Feed[] = [];
            subdirs.forEach(subDir => {
                const jsonPath = `${subDir.path}/${subDir.name}/feed.json`;
                if (fs.existsSync(jsonPath)) {
                    const feed = Feed.fromJSON(fs.readFileSync(jsonPath).toString());
                    feeds.push(feed);
                }
            });
            return feeds;
        });
    }

    /**
     * Add the key to the cache & create any directories as needed, and save the feed json
     * @param feed 
     */
    public writeFeed(feed: Feed) {
        this._cacheConfig.addKey(feed.name);
        const dirName = `${this._workingDir}/${Downloader.toSafeFileName(feed.name)}`;
        if (!fs.existsSync(dirName)) {
            fs.mkdirSync(dirName, { recursive: true });
        }
        fs.writeFileSync(`${dirName}/feed.json`, JSON.stringify(feed, null, "\t"))
    }

    public cached(feedItem: FeedItem): boolean {
        return this._cacheConfig.cachedContains(feedItem);
    }

    public skipped(feedItem: FeedItem): boolean {
        return this._cacheConfig.skippedContains(feedItem);
    }

    public cachedOrSkipped(feedItem: FeedItem): boolean {
        return this._cacheConfig.cachedOrSkippedContains(feedItem);
    }

    public summarise(): Promise<string[]> {
        return this.loadFeeds().then((feeds: Feed[]) => {
            let totalSizeMb = 0;
            return Promise.all(feeds.map(async (feed) => {
                let sizeMb = 0;
                for (const feedItem of feed.items) {
                    if (!this.cached(feedItem)) continue;
                    const downloader: Downloader = new Downloader(feedItem, this);
                    await downloader.getPath().then((path) => {
                        const stats = fs.statSync(path);
                        sizeMb += (stats.size / (1000 * 1000));
                    });
                }
                totalSizeMb += sizeMb;
                const cacheCount = this._cacheConfig.getFeedCache(feed.name).length;
                return `${feed.name}:\t${this.sizeToString(sizeMb)}\t ${cacheCount}/${feed.items.length} items`;
            })).then((lines) => {
                lines.push(`Total size: ${this.sizeToString(totalSizeMb)}`);
                return lines;
            });
        });
    }

    private sizeToString(megaBytes: number): string {
        const sizeType = [
            { label: "KB", factor: 1 / 1000 },
            { label: "MB", factor: 1 },
            { label: "GB", factor: 1000 },
            { label: "TB", factor: 1000 * 1000 }
        ].find(size => {
            return megaBytes < size.factor * 1000;
        });
        return sizeType === undefined ? `${(megaBytes / (1000 * 1000)).toFixed(2)} TB` : `${(megaBytes / sizeType.factor).toFixed(2)} ${sizeType.label}`;
    }

    private async removeCacheItemsWithoutFiles(): Promise<number> {
        const feeds = await this.loadFeeds();
        const items = this._cacheConfig.getCacheCopy();

        let removedCount = 0;
        for (const feedAuthor in items) {
            if (!Object.prototype.hasOwnProperty.call(items, feedAuthor)) continue;
            const cachedItems = items[feedAuthor];
            Cache._logger(`Checking '${feedAuthor}' (${cachedItems.length} cached items)`, "Verbose");

            const feed = feeds.find(f => f.name === feedAuthor);
            if (!feed) {
                Cache._logger(`No feed found for author ${feedAuthor}, skipping clean check`, "Verbose");
                continue;
            }

            for (const key in cachedItems) {
                if (!Object.prototype.hasOwnProperty.call(cachedItems, key)) continue;
                const itemTitle = cachedItems[key];

                const feedItem = feed.items.find(i => i.title === itemTitle);
                if (!feedItem) {
                    const titles = feed.items.map(i => i.title);
                    const found = titles.find(t => {
                        const normalisedT = t.trim().toLowerCase();
                        const normalisedItemTitle = itemTitle.trim().toLowerCase();
                        return normalisedT === normalisedItemTitle || normalisedT.includes(normalisedItemTitle) || normalisedItemTitle.includes(normalisedT);
                    });
                    const closestTitle = found ?? this.minLevenshtein(itemTitle, titles);
                    Cache._logger(`No item in the '${feedAuthor}' feed called '${itemTitle}' was found. It might have been renamed to '${closestTitle}'? If so, the entry (and file) will need to be manually fixed.`, "Info");
                    continue;
                }

                Cache._logger(`\t\t<<${feedItem.title}>>`, "VeryVerbose");
                if (!this.cached(feedItem)) continue;
                Cache._logger(`'${feedItem.title}' is cached, checking it...`, "VeryVerbose");

                const downloader: Downloader = new Downloader(feedItem, this);
                await downloader.getPath().then((path) => {
                    if (!fs.existsSync(path)) {
                        Cache._logger(`\n\n${feed.name}: '${feedItem.title}' (${path}) in cache, but does not exist on disk - removing from cache`);
                        const removed = this._cacheConfig.removeEntry(feedItem);
                        if (!removed) {
                            Cache._logger(`Could not remove entry from cache!`);
                        } else {
                            removedCount++;
                        }
                    }
                });
            }
        }
        return removedCount;
    }

    /**
     * Cleans the cache of items that are not present on disk
     * @returns The number of items removed from the cache
     */
    public async clean(): Promise<number> {
        // TODO: Remove duplicate cache entries too

        return this.removeCacheItemsWithoutFiles().then(removedCount => {
            this.save();
            return removedCount;
        });

    }

    private minLevenshtein(a: string, from: string[]): string {
        let min = { str: "", dist: Number.MAX_SAFE_INTEGER };
        from.forEach(f => {
            const dist = this.levenshtein(a, f);
            if (dist < min.dist) {
                min = { str: f, dist: dist };
            }
        });
        return min.str;
    }

    private levenshtein(a: string, b: string): number {
        // From https://gist.githubusercontent.com/keesey/e09d0af833476385b9ee13b6d26a2b84/raw/6148bc83b2112f4eea99a84409fc909402e0c672/levenshtein.ts
        const an = a ? a.length : 0;
        const bn = b ? b.length : 0;
        if (an === 0) {
            return bn;
        }
        if (bn === 0) {
            return an;
        }
        const matrix = new Array<number[]>(bn + 1);
        for (let i = 0; i <= bn; ++i) {
            let row = matrix[i] = new Array<number>(an + 1);
            row[0] = i;
        }
        const firstRow = matrix[0];
        for (let j = 1; j <= an; ++j) {
            firstRow[j] = j;
        }
        for (let i = 1; i <= bn; ++i) {
            for (let j = 1; j <= an; ++j) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                }
                else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1], // substitution
                        matrix[i][j - 1], // insertion
                        matrix[i - 1][j] // deletion
                    ) + 1;
                }
            }
        }
        return matrix[bn][an];
    };


    public save() {
        Cache._logger(`Saving at ${this._configPath}`, "VeryVerbose");
        fs.writeFileSync(this._configPath, JSON.stringify(this._cacheConfig, null, '\t'));
        Cache._logger("Saved.", "Verbose");
    }
}