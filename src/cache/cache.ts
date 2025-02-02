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
import { IAudioMetadata, ICommonTagsResult, loadMusicMetadata } from 'music-metadata';
import { createReadStream } from 'node:fs';
import path from "node:path";

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
        // TODO: Having to create the downloader here seems a bit off?
        const downloader: Downloader = new Downloader(feedItem, this);
        return downloader.getPath().then(cachePath => {
            const newPath = `${newDir}/${nodepath.basename(cachePath)}`;
            Cache._logger(`Copying ${cachePath} to ${newPath}`, "Verbose");
            fs.copyFileSync(cachePath, newPath);
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

    public cacheFeed(feed: Feed, latest: boolean, forced: boolean): Promise<void> {
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
            feed.items.forEach(item => {
                if (!forced && this.cachedOrSkipped(item)) {
                    Cache._logger(`${item.title} is already cached or skipped, not downloading`);
                    return;
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
    public refresh(): Promise<any> {
        // load all 
        return this.loadFeeds().then(feeds => {
            let imports: Promise<any>[] = [];
            Cache._logger(`Fetching ${feeds.length} feeds...`);
            let counter = 0;
            feeds.forEach(feed => {
                const rssImport = new RSSFeedImporter(new URL(feed.url)).toFeed().then(newFeed => {
                    counter++;
                    const percent = Math.round((counter / feeds.length) * 100);
                    if (newFeed !== null) {
                        this.registerFeed(newFeed);
                        Cache._logger(`(${percent}%) ${newFeed.name} updated`);
                    } else {
                        console.warn(`(CACHE) RSS source ${feed.url} failed`);
                    }
                });
                imports.push(rssImport);
            });
            return Promise.allSettled(imports);
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
    public registerFeed(feed: Feed) {
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

    public save() {
        Cache._logger(`Saving at ${this._configPath}`, "Verbose");
        fs.writeFileSync(this._configPath, JSON.stringify(this._cacheConfig, null, '\t'));
        Cache._logger("Saved.");
    }
}