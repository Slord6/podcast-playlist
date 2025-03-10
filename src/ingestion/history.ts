import { FeedItem } from '../feedItem';
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
        return this.queryByName(name, true).length > 0;
    }
    
    public listenedToByUrl(url: URL): boolean {
        const urlString = url.toString();
        return this.items.filter(item => item.episodeURL?.toString() === urlString).length > 0;
    }

    public listenedToByFeedItem(feedItem: FeedItem): boolean {
        //TODO: Add test on author + name
        return this.listenedToByUrl(feedItem.url) || this.listenedToByName(feedItem.title);
    }

    public queryByName(name: string, strict: boolean = false): HistoryItem[] {
        return this.items.filter(item => {
            if(strict) {
                return item.episodeName.trim() === name.trim()
            } else {
                const epName = item.episodeName.toLowerCase();
                const qName = name.toLowerCase();
                return epName.includes(qName) || qName.includes(epName);
            }
        });
    }

    public merge(other: History): History {
        // TODO: handle duplicates
        return new History([...this.items, ...other.items]);
    }

    public toString(): string {
        return `History (${this.items.length} items):\n${this.items.map(i => i.toString()).join("\n")}`;
    }

    public static fromJSON(json: string): History {
        const raw: {_items: any[]} = JSON.parse(json);
        return new History(
            raw._items.map(histItem => HistoryItem.fromJSON(JSON.stringify(histItem)))
        );
    }
}