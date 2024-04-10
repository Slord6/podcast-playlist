import { M3uPlaylist, M3uMedia } from 'm3u-parser-generator';
import { FeedItem } from '../feedItem';
import { Feed } from '../feed';
import { History } from '../ingestion/history';
import { PlayheadFeed } from './playheadFeed';
import { Downloader } from '../downloader';
import * as fs from "fs";
import { PlaylistConfiguration } from '../playlistConfiguration';

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

    constructor(title: string, items: FeedItem[]) {
        this._title = title;
        this._items = items;
    }

    public async toM3ULocal(directory: string): Promise<string> {
        const playlistSafeName = Downloader.toSafeFileName(this.title);
        const workingDir = `${directory}/${playlistSafeName}`;
        const playlist = new M3uPlaylist();
        playlist.title = this.title;

        const downloads: Promise<FeedItem>[] = this.items.map((feedItem: FeedItem) => {
            return new Downloader(feedItem, workingDir).download();
        });

        return Promise.all(downloads).then(localFeedItems => {
            const media: M3uMedia[] = localFeedItems.map((feedItem: FeedItem) => {
                // Simply use the file name for the url, as it will sit next to the playlist
                const mediaItem = new M3uMedia(Downloader.toSafeFileName(feedItem.title));
                mediaItem.name = feedItem.title;
                mediaItem.artist = feedItem.author;
                return mediaItem;
            });
    
            playlist.medias = media;
            const playlistString = playlist.getM3uString();
            fs.writeFileSync(`${workingDir}/${playlistSafeName}.m3u`, playlistString);
            return playlistString;
        });
    }

    public toM3U(): string {
        const playlist = new M3uPlaylist();
        playlist.title = this.title;

        const media: M3uMedia[] = this.items.map((feedItem: FeedItem) => {
            const mediaItem = new M3uMedia(feedItem.url.toString());
            mediaItem.name = feedItem.title;
            mediaItem.artist = feedItem.author;
            return mediaItem;
        });

        playlist.medias = media;
        return playlist.getM3uString();
    }
}