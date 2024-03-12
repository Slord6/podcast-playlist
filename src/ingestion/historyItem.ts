

export class HistoryItem {
    private _name: string;
    public get name(): string {
        return this._name;
    }
    public set name(value: string) {
        this._name = value;
    }
    private _url: URL | null;
    public get url(): URL | null {
        return this._url;
    }
    public set url(value: URL | null) {
        this._url = value;
    }
    private _date: Date;
    public get date(): Date {
        return this._date;
    }
    public set date(value: Date) {
        this._date = value;
    }

    constructor(row: any) {
        this._name = row.name;
        this._url = row.url ? new URL(row.url) : null;
        this._date = new Date(row.playbackDate);
    }

    public toString() {
        console.log(`${this._name}(${this._url?.toString()}) listened to on ${this._date.toLocaleString()}`);
    }
}