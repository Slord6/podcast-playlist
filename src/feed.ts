

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

    constructor(name: string, url: URL, webPage: URL, imageUrl: URL) {
        this._name = name;
        this._url = url;
        this._webPage = webPage;
        this._imageUrl = imageUrl;
    }

    public toString(): string {
        return `${this._name}(${this.url})`;
    }
}