import { HistoryItem } from './historyItem';

export class History {
    private _items: HistoryItem[];
    public get items(): HistoryItem[] {
        return this._items;
    }
    public set items(value: HistoryItem[]) {
        this._items = value;
    }

    constructor(items: HistoryItem[]) {
        this._items = items;
    }

    public listenedToByName(name: string): boolean {
        return this.items.filter(item => item.name === name).length > 0;
    }
    
    public listenedToByUrl(url: URL): boolean {
        const urlString = url.toString();
        return this.items.filter(item => item.url?.toString() === urlString).length > 0;
    }

    public toString(): string {
        return `History (${this.items.length} items):\n${this.items.map(i => i.toString()).join("\n")}`;
    }
}