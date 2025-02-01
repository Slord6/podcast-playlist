import { Feed } from "./feed";
import { HistoryItem } from "./ingestion/historyItem";

export type EpisodeType = "bonus" | "full" | "trailer";

export class FeedItem {
    private _title: string;
    public get title(): string {
        return this._title;
    }
    public set title(value: string) {
        this._title = value;
    }
    private _url: URL;
    public get url(): URL {
        return this._url;
    }
    public set url(value: URL) {
        this._url = value;
    }
    private _pubdate: string;
    public get pubdate(): string {
        return this._pubdate;
    }
    public set pubdate(value: string) {
        this._pubdate = value;
    }
    public get published(): Date | null {
        try {
            return new Date(Date.parse(this.pubdate));
        } catch {
            return null;
        }
    }
    private _author: string;
    public get author(): string {
        return this._author;
    }
    public set author(value: string) {
        this._author = value;
    }
    private _type: EpisodeType;
    public get type(): EpisodeType {
        return this._type;
    }
    public set type(value: EpisodeType) {
        this._type = value;
    }

    constructor(title: string, url: URL, pubdate: string, author: string, type: EpisodeType) {
        this._title = title;
        this._url = url;
        this._pubdate = pubdate;
        this._author = author;
        this._type = type;
    }

    public toString(): string {
        return `${this.title}(Published: ${this.pubdate})(${this.url.toString()})`;
    }

    public static fromJSON(json: string): FeedItem {
        const rawItem = JSON.parse(json);
        return new FeedItem(rawItem._title, new URL(rawItem._url), rawItem._pubdate, rawItem._author, rawItem._type || "full");
    }

    public static fromHistoryItem(historyItem: HistoryItem, feeds: Feed[]): FeedItem | null {
        const feed: Feed | undefined = feeds.filter(feed => feed.name == historyItem.podcastName)[0];
        if(!feed) return null;
        const feedItem = feed.items.filter(item => item.title == historyItem.episodeName)[0];
        return feedItem ? feedItem : null;
    }
}