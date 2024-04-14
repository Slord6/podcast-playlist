import { Downloader } from "../downloader";
import { Feed } from "../feed";
import { FeedItem } from "../feedItem";
import { History } from "../ingestion/history";
import { RSSFeedImporter } from "../ingestion/rssFeedImporter";
import { PlayheadFeed } from "../playlist/playheadFeed";
import { CacheConfig } from "./cacheConfig";
import * as fs from "fs";
import * as nodepath from "path";

const CONFIG_FILE_NAME: string = `cache.json`;

export class Cache {
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
        if(!this._cacheConfig.cachedContains(feedItem)) {
            throw new Error("Tried to copy a feed item that isn't in the cache");
        }
        // TODO: Having to create the downloader here seems a bit off?
        const downloader: Downloader = new Downloader(feedItem, this);
        return downloader.getPath().then(cachePath => {
            const newPath = `${newDir}/${nodepath.basename(cachePath)}`;
            console.log(`(CACHE) Copying ${cachePath} to ${newPath}`);
            fs.copyFileSync(cachePath, newPath);
        })
    }

    /**
     * Doing this without downloading a file can result in
     * the cache becoming out of sync - be careful!
     */
    public markCachedUnsafe(item: FeedItem): void {
        this._cacheConfig.addToCache(item);
    }

    public cacheFeed(feed: Feed, latest: boolean, forced: boolean): Promise<void> {
        console.log(`(CACHE) Caching feed: ${feed.name}`);
        let downloadSequence: Promise<FeedItem | void> = Promise.resolve();
        if(latest) {
            const latest: FeedItem = new PlayheadFeed(feed, new History([]), () => true).latest;
            if(!this.cachedOrSkipped(latest) || forced) {
                const itemDownloader = new Downloader(latest, this);
                downloadSequence = downloadSequence.then(() => {
                    return itemDownloader.download().then(() => {
                        this._cacheConfig.addToCache(latest);
                        console.log(`(CACHE) ${latest.title} cached`);
                    })
                });
            } else {
                console.log(`${latest.title} is already cached or skipped, not downloading`);
            }
        } else {
            feed.items.forEach(item => {
                if(!forced && this.cachedOrSkipped(item)) { 
                    console.log(`${item.title} is already cached or skipped, not downloading`);
                    return;
                }
                console.log(`(CACHE) Caching ${item.title}...`);
                const itemDownloader = new Downloader(item, this);
                downloadSequence = downloadSequence.then(() => {
                    return itemDownloader.download().then(() => {
                        this._cacheConfig.addToCache(item);
                        console.log(`(CACHE) ${item.title} cached`);
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
        console.log(`(CACHE) Skipping all items in ${feed.name}`);
        let count = 0;
        feed.items.forEach(item => {
            if(this.cachedOrSkipped(item)) return;
            count ++;
            this._cacheConfig.addToSkip(item);
        });
        console.log(`(CACHE) ${count} items skipped (of ${feed.items.length} in the feed)`);
    }

    public skipItem(item: FeedItem) {
        if(this.cachedOrSkipped(item)) return;
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
            console.log(`(CACHE) Fetching ${feeds.length} feeds...`);
            feeds.forEach(feed => {
                const rssImport = new RSSFeedImporter(new URL(feed.url)).toFeed().then(newFeed => {
                    if (newFeed !== null) {
                        this.registerFeed(newFeed);
                        console.log(`(CACHE) ${newFeed.name} updated`);
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
            fs.mkdirSync(dirName, {recursive: true});
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
        console.log("(CACHE) Saving to disk...", this._configPath);
        fs.writeFileSync(this._configPath, JSON.stringify(this._cacheConfig, null, '\t'));
        console.log("(CACHE) Saved.");
    }
}