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
import { IAudioMetadata, loadMusicMetadata } from 'music-metadata';
import { createReadStream } from 'node:fs';

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

    public async import(dirPath: string, recursive: boolean) {
        this.loadFeeds().then(async (feeds: Feed[]) => {
            try {
                // Get the files as an array
                const files = await fs.promises.readdir(dirPath);

                // Loop them all with the new for...of
                for (const fileName of files) {
                    // Get the full paths
                    const filePath = nodepath.join(dirPath, fileName);

                    // Stat the file to see if we have a file or dir
                    const stat = await fs.promises.stat(filePath);

                    // Dynamic load the music-metadata ESM module
                    const { parseStream } = await loadMusicMetadata();
                    if (stat.isFile()) {
                        try {
                            // Create a readable stream from a file
                            const audioStream = createReadStream(filePath);

                            // Parse the metadata from the stream
                            const metadata = await parseStream(audioStream).catch(() => {
                                Cache._logger(`Failed to read ${filePath}`);
                                return undefined;
                            });
                            if (metadata == undefined) continue;
                            const common = metadata.common;

                            const artist = common.artist || common.albumartist || common.album;
                            const title = common.title;

                            if (artist === undefined || title === undefined) {
                                Cache._logger(`Could not determine source for ${filePath}`, "Verbose");
                                continue;
                            } else {
                                const matchFeeds = feeds.filter((feed) => feed.name.toLowerCase().trim() === artist.toLowerCase().trim());
                                if (matchFeeds.length > 1) {
                                    Cache._logger(`Found too many artist matches for ${filePath} - [${matchFeeds.map(f => f.name).join(",")}]`, "Verbose")
                                } else if (matchFeeds.length === 0) {
                                    Cache._logger(`Found no artist matches for ${filePath}`, "Verbose");
                                } else {
                                    const match = matchFeeds[0]!;
                                    Cache._logger(`Matched ${filePath} - to ${match.name}`, "Verbose");
                                    const matchItems = match.items.filter(i => i.title.toLowerCase().trim() === title.toLowerCase().trim());
                                    if (matchItems.length > 1) {
                                        Cache._logger(`Found too many episode matches for ${filePath} - [${matchItems.map(f => f.title).join(",")}]`, "Verbose")
                                    } else if (matchItems.length === 0) {
                                        Cache._logger(`Found no episode matches for ${filePath}`, "Verbose");
                                    } else {
                                        const match = matchItems[0]!;
                                        Cache._logger(`Matched ${title} - ${artist} - to ${match.title}`, "Info");
                                        const downloader = new Downloader(match, this);
                                        const destinationPath = await downloader.getPath();
                                        if(!fs.existsSync(destinationPath)) {
                                            fs.copyFileSync(filePath, destinationPath);
                                            this._cacheConfig.addToCache(match);
                                            this.save();
                                            Cache._logger(`Copying ${title} (${filePath}) - to ${destinationPath}`, "Verbose");
                                        } else {
                                            Cache._logger(`Did not copy ${title} (${filePath}). Already a file in the cache at ${destinationPath}`, "Verbose");
                                        }
                                    }
                                }
                            }

                        } catch (error) {
                            console.error('Error parsing metadata:', (error as any));
                        }
                    }
                    else if (stat.isDirectory()) {
                        if (recursive) {
                            await this.import(filePath, recursive);
                        }
                    }
                }
            }
            catch (e) {
                // Catch anything bad that happens
                console.error("We've thrown! Whoops!", e);
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