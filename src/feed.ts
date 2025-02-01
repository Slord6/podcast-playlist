import { FeedItem } from "./feedItem";


export class Feed {
    private _name: string;
    public get name(): string {
        return this._name;
    }
    public set name(value: string) {
        this._name = value;
    }
    private _url: URL;
    public get url(): URL {
        return this._url;
    }
    public set url(value: URL) {
        this._url = value;
    }
    private _webPage: URL;
    public get webPage(): URL {
        return this._webPage;
    }
    public set webPage(value: URL) {
        this._webPage = value;
    }
    private _imageUrl: URL;
    public get imageUrl(): URL {
        return this._imageUrl;
    }
    public set imageUrl(value: URL) {
        this._imageUrl = value;
    }
    private _items: FeedItem[];
    public get items(): FeedItem[] {
        return this._items;
    }
    public set items(value: FeedItem[]) {
        this._items = value;
    }


    constructor(name: string, url: URL, webPage: URL, imageUrl: URL, items: FeedItem[] = []) {
        this._name = name;
        this._url = url;
        this._webPage = webPage;
        this._imageUrl = imageUrl;
        this._items = items;
    }

    public toString(): string {
        return `${this._name}(${this.url.toString()}):
        ${this.items.map((item: FeedItem, index: number) => `[${index}]: ${item.toString()}`).join("\n")}`;
    }

    public static fromJSON(json: string): Feed {
        const rawFeed = JSON.parse(json);
        const items = rawFeed._items.map((item: any) => FeedItem.fromJSON(JSON.stringify(item)));
        return new Feed(rawFeed._name, new URL(rawFeed._url), new URL(rawFeed._webPage), new URL(rawFeed._imageUrl), items);
    }
}