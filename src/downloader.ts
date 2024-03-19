import { FeedItem } from "./feedItem";
import * as fs from "fs";
import * as stream from "stream";

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

    public async download(): Promise<FeedItem> {
        return new Promise((resolve) => {
            console.log(`(DOWNLOADER) Downloading ${this._feedItem.title} from ${this._source}...`);
            const path = `${this._feedItem.url.host}/${this._feedItem.url.pathname}`;
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
    }
}