import { M3uPlaylist, M3uMedia, M3uParser } from 'm3u-parser-generator';
import { FeedItem } from '../feedItem';
import { Downloader } from '../downloader';
import * as fs from "fs";
import { Cache } from '../cache/cache';

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
    private _workingDir: string;

    constructor(title: string, items: FeedItem[], workingDir: string) {
        this._title = title;
        this._items = items;
        this._workingDir = workingDir;
    }

    private playlistM3UPath(): string {
        return `${this.playlistDirectoryPath()}/${Downloader.toSafeFileName(this.title)}.m3u`;
    }

    public playlistDirectoryPath(): string {
        return `${this._workingDir}/${Downloader.toSafeFileName(this.title)}`;
    }

    private createDirectory(): void {
        if (!fs.existsSync(this.playlistDirectoryPath())) {
            fs.mkdirSync(this.playlistDirectoryPath(), { recursive: true });
        }
    }

    private saveM3U(playlist: M3uPlaylist) {
        this.createDirectory();
        const playlistString = playlist.getM3uString();
        fs.writeFileSync(this.playlistM3UPath(), playlistString);
    }

    public onDisk(): boolean {
        return fs.existsSync(this.playlistM3UPath());
    }

    public async toM3ULocal(cache: Cache): Promise<string> {
        const playlist = new M3uPlaylist();
        playlist.title = this.title;

        const downloads: Promise<FeedItem>[] = this.items.map((feedItem: FeedItem) => {
            return new Downloader(feedItem, cache).download();
        });

        return Promise.all(downloads).then(localFeedItems => {
            this.createDirectory();
            let copies: Promise<void>[] = [];
            localFeedItems.forEach(item => {
                try {
                    copies.push(cache.copy(item, this.playlistDirectoryPath()));
                } catch (err) {
                    console.error(`Copying ${item.title} failed: ${err}`);
                }
            });
            console.log(`Copying ${copies.length} items from the cache...`);
            return Promise.allSettled(copies).then((copyRes) => {
                const failedCopies = copyRes.filter(res => res.status === "rejected");
                const copyFail = failedCopies.length > 0;
                if (copyFail) {
                    console.error("One or more files failed to copy to the playlist output directory:\n", failedCopies.map(res => (res as any).reason).join("\n"));
                    return "<Not saved>";
                }
                console.log(`All items retrieved from the cache. Building playlist...`);

                const media: M3uMedia[] = localFeedItems.map((feedItem: FeedItem) => {
                    // Simply use the file name for the url, as it will sit next to the playlist
                    const mediaItem = new M3uMedia(Downloader.toSafeFileName(feedItem.title));
                    mediaItem.name = feedItem.title;
                    mediaItem.artist = feedItem.author;
                    return mediaItem;
                });

                playlist.medias = media;
                this.saveM3U(playlist);
                return this.playlistDirectoryPath();
            });
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
        this.saveM3U(playlist);
        return this.playlistM3UPath();
    }

    public static loadItems(m3uPath: string): { title: string, podcast: string }[] {
        const m3uPlaylist = M3uParser.parse(fs.readFileSync(m3uPath).toString());
        return m3uPlaylist.medias.map(media => {
            return {
                title: media.name,
                podcast: media.artist
            }
        }).filter(x => x.podcast !== undefined && x.title !== undefined) as { title: string, podcast: string }[];

    }
}