import { FeedItem } from "./feedItem";
import * as fs from "fs";
import * as stream from "stream";
import { MimeTypes } from "./mimeTypes";

export class Downloader {
    private _source: URL;
    private _feedItem: FeedItem;

    constructor(feedItem: FeedItem, workingDir: string) {
        this._source = feedItem.url;
        this._feedItem = new FeedItem(feedItem.title, new URL(`file://${workingDir}/${Downloader.toSafeFileName(feedItem.title)}`), feedItem.pubdate, feedItem.author);
        if (!fs.existsSync(workingDir)) {
            fs.mkdirSync(workingDir, { recursive: true });
        }
    }

    public static toSafeFileName(unsafe: string): string {
        return (unsafe.replace(/[ &\/\\#,+()$~%.'":*?<>{}\|]/g, ""));
    }

    /**
     * Get the extension for the podcast based on the 
     * @returns Promise to extension string
     */
    private getExtension(): Promise<string> {
        return fetch(this._source, {
            method: "HEAD",
            redirect: "follow"
        }).then(response => {
            return MimeTypes.getAudioExtension(response.headers.get("content-type"))
        });
    }

    public async download(): Promise<FeedItem> {
        return new Promise((resolve) => {
            const extensionPromise = this.getExtension();
            extensionPromise.then(extension => {
                if(extension === "bin") {
                    console.warn(`(DOWNLOADER) Could not determine extension from mime-type, will use 'bin'`);
                }
                const path = `${this._feedItem.url.host}/${this._feedItem.url.pathname}.${extension}`;
                console.log(`(DOWNLOADER) Downloading ${this._feedItem.title} from ${this._source} to ${path}...`);
                if (fs.existsSync(path)) {
                    console.log(`(DOWNLOADER) File already exists, skipping (${this._feedItem.title})`);
                    return resolve(this._feedItem);
                } else {
                    fetch(this._source).then(response => {
                        return stream.Readable.fromWeb(response.body as any).pipe(fs.createWriteStream(path));
                    }).then((ws) => {
                        ws.on("close", () => resolve(this._feedItem));
                    })
                }
            });
        });
    }
}