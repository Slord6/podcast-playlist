import { FeedItem } from "./feedItem";
import * as fs from "fs";
import * as stream from "stream";
import { MimeTypes } from "./mimeTypes";
import { Cache } from "./cache/cache";
import { Logger } from "./logger";

export class Downloader {
    private static _logger = Logger.GetNamedLogger("DOWNLOADER");
    private _source: FeedItem;
    private _feedItem: FeedItem;
    private _extension: string | null;
    public set extension(value: string) {
        this._extension = value;
    }
    private _cache: Cache;

    constructor(feedItem: FeedItem, cache: Cache) {
        this._source = feedItem;
        const podcastDirName: string = Downloader.toSafeFileName(feedItem.author);
        this._feedItem = new FeedItem(feedItem.title, new URL(`file://${cache.cacheDirectory}/${podcastDirName}/${Downloader.toSafeFileName(feedItem.title)}`), feedItem.pubdate, feedItem.author, feedItem.type);
        this._extension = null;
        this._cache = cache;
    }

    public static toSafeFileName(unsafe: string): string {
        return (unsafe.replace(/[& \/\\#,+()$~%.'":*?<>{}\|]/g, "").replace(/%20/, "\ "));
    }

    /**
     * Get the extension for the podcast based on the 
     * @returns Promise to extension string
     */
    private getExtension(): Promise<string> {
        if (this._extension !== null) return new Promise<string>((r) => r(this._extension!));

        return fetch(this._source.url, {
            method: "HEAD",
            redirect: "follow"
        }).then(response => {
            const mimeBasedExt = MimeTypes.getAudioExtension(response.headers.get("content-type"));
            if (mimeBasedExt !== "bin") return mimeBasedExt;

            const sourceParts = this._source.toString().split(".");
            const possExt = sourceParts[sourceParts.length - 1].toLowerCase();
            if (MimeTypes.isExtension(possExt)) return possExt;

            return mimeBasedExt;
        }).catch((err) => {
            Downloader._logger(`Could not resolve extension for ${this._feedItem.title}. File will use a '.unknown' extension`);
            return `.unknown`;
        });
    }

    /**
     * Does the file currently exist in the cache?
    */
    public exists(): Promise<boolean> {
        return this.getPath().then(path => fs.existsSync(path));
    }

    public getPath(): Promise<string> {
        const extensionPromise = this.getExtension();
        return extensionPromise.then(extension => {
            const path = `${this._feedItem.url.host}/${this._feedItem.url.pathname}.${extension}`;
            return path;
        });
    }

    public async download(): Promise<{ item: FeedItem, path: string }> {
        return new Promise((resolve) => {
            this.getPath().then((path) => {
                if (this._cache.cached(this._feedItem)) {
                    Downloader._logger(`File already cached, skipping download (${this._feedItem.title})`);
                    resolve({ item: this._source, path });
                } else {
                    Downloader._logger(`Downloading ${this._feedItem.title}...`);
                    Downloader._logger(`${this._source} ---> ${path}`, "Verbose");
                    fetch(this._source.url, {redirect: "follow"}).then(response => {
                        const webStream = stream.Readable.fromWeb(response.body as any).on("error", (err) => {
                            console.error(`(DOWNLOADER) Failed to download ${this._feedItem.title}`);
                            Downloader._logger(err.name, "Verbose");
                            Downloader._logger(err.message, "VeryVerbose");
                            Downloader._logger(err.name, "VeryVerbose");
                        });
                        
                        webStream.pipe(fs.createWriteStream(path));

                        return webStream;
                    }).then((ws) => {
                        ws.on("close", () => {
                            this._cache.markCachedUnsafe(this._feedItem);
                            this._cache.save();
                            resolve({ item: this._source, path });
                        });
                        ws.on("error", (err) => {
                            console.error(`(DOWNLOADER) Failed to download ${this._feedItem.title}`);
                            Downloader._logger(err.name, "Verbose");
                            Downloader._logger(err.message, "VeryVerbose");
                            Downloader._logger(err.stack ?? "<no trace>", "VeryVerbose");
                        });
                    }).catch((err) => {
                        console.error(`(DOWNLOADER) Failed to download ${this._feedItem.title}`);
                        Downloader._logger(err, "VeryVerbose");
                    });
                }
            });
        });
    }
}