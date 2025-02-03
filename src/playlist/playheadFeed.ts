import { Feed } from "../feed";
import { FeedItem } from "../feedItem";
import { History } from "../ingestion/history";


export class PlayheadFeed {
    private _feed: Feed;
    public get feed(): Feed {
        return this._feed;
    }
    private _history: History;
    private _playable: FeedItem[];
    private _playhead: number;
    public get finished(): boolean {
        return this._playhead >= this._playable.length;
    }
    public get current(): FeedItem | null {
        if (this.finished) return null;
        return this._playable[this._playhead];
    }
    public get next(): FeedItem | null {
        const n = this._playable[this._playhead + 1];
        if(n === undefined) return null;
        return n;
    }
    public get nextUnsafe(): FeedItem | undefined {
        return this._playable[this._playhead];
    }
    public get latest(): FeedItem {
        return this._playable[this._playable.length - 1];
    }


    constructor(feed: Feed, history: History, canIncludeFilter: (feedItem: FeedItem) => boolean) {
        this._feed = feed;
        this._history = history;
        this._playable = this._feed.items.filter(i => (!this._history.listenedToByFeedItem(i) && canIncludeFilter(i))).sort((a, b) => {
            const dateA = a.published;
            const dateB = b.published;
            if (dateA === null || dateB === null) {
                console.warn(`(PLAYHEADFEED) Cannot determine episode order of [${a}] and [${b}]`);
                return 0;
            } else {
                return dateA.getTime() - dateB.getTime();
            }
        })
        this._playhead = 0;
    }

    public randomUnlistened(ignore: FeedItem[] = []): FeedItem {
        const availableItems = this._playable.filter(unplayed => !ignore.includes(unplayed));
        const index = Math.round(Math.random() * (availableItems.length - 1));
        return availableItems[index];
    }

    public progress() {
        this._playhead++;
    }

}