import { FeedItem } from "./feedItem";
import * as fs from "fs";
import * as stream from "stream";
import { MimeTypes } from "./mimeTypes";
import { Cache } from "./cache/cache";
import { Logger } from "./logger";
import { Metadata } from "./cache/metadata"
const { finished } = require('node:stream/promises');

export type LocalDownload = { item: FeedItem, path: string };

export class Downloader {
    private static _logger = Logger.GetNamedLogger("DOWNLOADER");
    private static _userAgent: string = `PodcastPlaylist/1.0 (${process.platform} ${process.arch})`;
    private _source: FeedItem;
    public get source(): FeedItem {
        return this._source;
    }
    private _feedItem: FeedItem;
    private _extension: string | null;
    public set extension(value: string) {
        this._extension = value;
    }
    private _cache: Cache;

    constructor(feedItem: FeedItem, cache: Cache) {
        this._source = feedItem;
        const podcastDirName: string = Downloader.toSafeFileName(feedItem.author);
        this._feedItem = new FeedItem(feedItem.title, new URL(`file://${cache.cacheDirectory}/${podcastDirName}/${Downloader.toSafeFileName(feedItem.title)}`), feedItem.pubdate, feedItem.author, feedItem.type, feedItem.mediaType);
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
    public getExtension(): Promise<string> {
        if (this._extension !== null) return new Promise<string>((r) => r(this._extension!));

        if (this._feedItem.mediaType !== null) {
            const ext = MimeTypes.getAudioExtension(this._feedItem.mediaType);
            if (ext !== "bin") {
                this._extension = ext;
                Downloader._logger(`Using media type from feed item: ${this._extension}`, "VeryVerbose");
                return new Promise<string>((r) => r(this._extension!));
            }
        }

        return fetch(this._source.url, {
            method: "HEAD",
            redirect: "follow",
            credentials: "include",
            headers: {
                "User-Agent": Downloader._userAgent
            }
        }).then(response => {
            Downloader._logger(`Source URL for file: ${response.url}`, "VeryVerbose");

            const mimeBasedExt = MimeTypes.getAudioExtension(response.headers.get("content-type"));
            if (mimeBasedExt !== "bin") {
                this._extension = mimeBasedExt;
                return mimeBasedExt;
            }

            throw new Error(`Invalid MIME type ${mimeBasedExt} for episode ${this._feedItem.title} (${this._feedItem.author})`);
        }).catch((err) => {
            Downloader._logger(`Could not resolve extension for ${this._feedItem.title}`);
            Downloader._logger(`Extension promise failure: (${err}) - ${this.source.url}`, "VeryVerbose");
            throw err;
        });
    }

    /**
     * Does the file currently exist in the cache?
    */
    public exists(): Promise<boolean> {
        return this.getPath().then(path => fs.existsSync(path));
    }

    /**
     * Get the local path for the FeedItem file
     * @returns The path that the FeedItem this Downloader is handling is/would be downloaded to
     */
    public getPath(): Promise<string> {
        const extensionPromise = this.getExtension();
        return extensionPromise.then(extension => {
            const path = `${this._feedItem.url.host}/${this._feedItem.url.pathname}.${extension}`;
            return path;
        });
    }

    public async download(): Promise<LocalDownload> {
        return this.getPath().then((path) => {
            Downloader._logger(`Path resolved: (${path})`, "VeryVerbose");
            if (this._cache.cached(this._feedItem)) {
                Downloader._logger(`File already cached, skipping download (${this._feedItem.title})`);
                return { item: this.source, path } as LocalDownload;
            } else {
                Downloader._logger(`Downloading ${this.source.title} (${this.source.author})...`);
                Downloader._logger(`${this._source} ---> ${path}`, "Verbose");

                return fetch(this._source.url,
                    {
                        redirect: "follow",
                        credentials: "include",
                        headers: {
                            "User-Agent": Downloader._userAgent
                        }
                    }).then(response => {
                        const webStream = stream.Readable.fromWeb(response.body as any).on("error", (err) => {
                            console.error(`(DOWNLOADER) Failed to download ${this.source.title}`);
                            Downloader._logger(err.name, "Info");
                            Downloader._logger(err.message, "Verbose");
                        });

                        const piped = webStream.pipe(fs.createWriteStream(path));
                        Downloader._logger(`Pipe connected: ${this._source} ---> ${path}`, "VeryVerbose");
                        if (response.redirected) {
                            Downloader._logger(`Source URL was redirected to: ${response.url}`, "VeryVerbose");
                        } else {
                            Downloader._logger(`Source URL for file: ${response.url}`, "VeryVerbose");
                        }

                        return Promise.all([finished(webStream), finished(piped)]).then(async () => {
                            Downloader._logger(`Download complete (${this.source.title})`);

                            this._cache.markCachedUnsafe(this._feedItem);
                            this._cache.save();
                            await Metadata.applyMetadata(this).catch(() => {
                                Downloader._logger(`Could not apply metadata to ${this.source.title}`);
                            });

                            return { item: this.source, path }
                        });
                    })
                    .catch((err) => {
                        const msg = `Failed to download ${this.source.title} (${this.source.author})`;
                        console.error(`(DOWNLOADER) ${msg}`);
                        Downloader._logger(err.name, "Verbose");
                        Downloader._logger(err.message, "VeryVerbose");
                        Downloader._logger(err.stack ?? "<no trace>", "VeryVerbose");
                        throw err;
                    });
            }
        });
    }
}