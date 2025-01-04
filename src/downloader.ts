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
    private _cache: Cache;

    constructor(feedItem: FeedItem, cache: Cache) {
        this._source = feedItem;
        const podcastDirName: string = Downloader.toSafeFileName(feedItem.author);
        this._feedItem = new FeedItem(feedItem.title, new URL(`file://${cache.cacheDirectory}/${podcastDirName}/${Downloader.toSafeFileName(feedItem.title)}`), feedItem.pubdate, feedItem.author);
        this._extension = null;
        this._cache = cache;
    }

    public static toSafeFileName(unsafe: string): string {
        return (unsafe.replace(/[ &\/\\#,+()$~%.'":*?<>{}\|]/g, ""));
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
        });
    }

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

    public async download(): Promise<FeedItem> {
        return new Promise((resolve) => {
            this.getPath().then((path) => {
                Downloader._logger(`Downloading ${this._feedItem.title} from ${this._source} to ${path}...`);
                if (this._cache.cached(this._feedItem)) {
                    Downloader._logger(`File already cached, skipping download (${this._feedItem.title})`, "Verbose");
                    resolve(this._source);
                } else {
                    fetch(this._source.url).then(response => {
                        return stream.Readable.fromWeb(response.body as any).pipe(fs.createWriteStream(path));
                    }).then((ws) => {
                        ws.on("close", () => {
                            this._cache.markCachedUnsafe(this._feedItem);
                            this._cache.save();
                            resolve(this._source);
                        });
                    })
                }
            });
        });
    }
}