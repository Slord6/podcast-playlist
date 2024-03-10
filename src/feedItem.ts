
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

    constructor(title: string, url: URL, pubdate: string) {
        this._title = title;
        this._url = url;
        this._pubdate = pubdate;
    }

    public toString(): string {
        return `${this.title}(Published: ${this.pubdate})(${this.url.toString()})`;
    }

    public static fromJSON(json: string) {
        const rawItem = JSON.parse(json);
        return new FeedItem(rawItem._title, new URL(rawItem._url), rawItem._pubdate);
    }
}