import {M3uPlaylist, M3uMedia} from 'm3u-parser-generator';
import { FeedItem } from './feedItem';

export class Playlist {
    private _title: string;
    public get title(): string {
        return this._title;
    }
    public set title(value: string) {
        this._title = value;
    }
    private _items: FeedItem[];
    public get items(): FeedItem[] {
        return this._items;
    }
    public set items(value: FeedItem[]) {
        this._items = value;
    }

    constructor(title: string, items: FeedItem[] = []) {
        this._title = title;
        this._items = items;
    }

    public toM3U(): string {
        const playlist = new M3uPlaylist();
        playlist.title = this.title;

        const media: M3uMedia[] = this.items.map((feedItem: FeedItem) => {
            const mediaItem = new M3uMedia(feedItem.url.toString());
            mediaItem.name = feedItem.title;
            return mediaItem;
        });

        playlist.medias = media;
        return playlist.getM3uString();
    }
}