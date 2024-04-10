import { Feed } from "../feed";
import { FeedItem } from "../feedItem";
import { History } from "../ingestion/history";


export class PlayheadFeed {
    private _feed: Feed;
    private _history: History;
    private _unplayed: FeedItem[];
    private _playhead: number;
    public get listened(): boolean {
        return this._playhead >= this._unplayed.length;
    }
    public get next(): FeedItem | null {
        if (this.listened) return null;
        return this._unplayed[this._playhead];
    }
    public get nextUnsafe(): FeedItem {
        return this._unplayed[this._playhead];
    }
    private canIncludeFilter: (feedItem: FeedItem) => boolean;


    constructor(feed: Feed, history: History, canIncludeFilter: (feedItem: FeedItem) => boolean) {
        this._feed = feed;
        this._history = history;
        this._unplayed = this._feed.items.filter(i => !this._history.listenedToByFeedItem(i)).sort((a, b) => {
            const dateA = a.published;
            const dateB = b.published;
            if (dateA === null || dateB === null) {
                console.warn(`(PlayheadFeed) Cannot determine episode order of [${a}] and [${b}]`);
                return 0;
            } else {
                return dateA.getTime() - dateB.getTime();
            }
        })
        this._playhead = 0;
        this.canIncludeFilter = canIncludeFilter;
    }

    public skip() {
        do {
            this._playhead++;
        } while (!this.listened && this.canIncludeFilter(this.nextUnsafe));
    }

    public randomUnlistened(ignore: FeedItem[] = []): FeedItem {
        const availableItems = this._unplayed.filter(unplayed => !ignore.includes(unplayed));
        const index = Math.round(Math.random() * (availableItems.length - 1));
        return availableItems[index];
    }

}