import { M3uPlaylist, M3uMedia, M3uParser } from 'm3u-parser-generator';
import { FeedItem } from '../feedItem';
import { Downloader, LocalDownload } from '../downloader';
import * as fs from "fs";
import { Cache } from '../cache/cache';
import { Logger } from '../logger';

export class Playlist {
    private static _logger = Logger.GetNamedLogger("PLAYLIST");
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

    public playlistM3UPath(): string {
        return `${this.localPlaylistFilesDir()}/${Downloader.toSafeFileName(this.title)}.playlist`;
    }

    private localAudioFilesDir(): string {
        return `${this.rootDir()}/Podcasts`;
    }

    private localPlaylistFilesDir(): string {
        return `${this.rootDir()}/Playlists`;
    }

    private localAudioFileDirPath(feedItem: FeedItem, onDevice: boolean = false): string {
        const root = onDevice ? `/Podcasts` : this.localAudioFilesDir();
        return `${root}/${Downloader.toSafeFileName(feedItem.author)}`
    }

    public rootDir(): string {
        return `${this._workingDir}/${Downloader.toSafeFileName(this.title)}`;
    }

    private createDirectories(): void {
        if (!fs.existsSync(this.localAudioFilesDir())) {
            fs.mkdirSync(this.localAudioFilesDir(), { recursive: true });
        }
        if (!fs.existsSync(this.localPlaylistFilesDir())) {
            fs.mkdirSync(this.localPlaylistFilesDir(), { recursive: true });
        }
    }

    private saveM3U(playlist: M3uPlaylist) {
        this.createDirectories();
        let playlistString = playlist.getM3uString();

        fs.writeFileSync(this.playlistM3UPath(), playlistString);
    }

    public onDisk(): boolean {
        return fs.existsSync(this.playlistM3UPath());
    }

    public async toM3ULocal(cache: Cache): Promise<string | null> {
        const playlist = new M3uPlaylist();
        playlist.title = this.title;

        const downloadResults: LocalDownload[] = [];
        for (const [_, item] of this.items.entries()) {
            Playlist._logger(`Creating downloader for ${item.title} (${item.author})`, "VeryVerbose");
            downloadResults.push(await new Downloader(item, cache).download());
            Playlist._logger(`Download completed ${item.title} (${item.author})`, "VeryVerbose");
        }

        return Promise.resolve(downloadResults).then((localFeedItems: LocalDownload[]) => {
            Playlist._logger(`Downloads complete`, "Verbose");
            this.createDirectories();
            let copies: Promise<void>[] = [];
            localFeedItems.forEach(item => {
                try {
                    const dest = this.localAudioFileDirPath(item.item);
                    if (!fs.existsSync(dest)) {
                        fs.mkdirSync(dest);
                    }
                    copies.push(cache.copy(item.item, dest));
                } catch (err) {
                    console.error(`(PLAYLIST) Copying ${item.item.title} failed: ${err}`);
                }
            });
            Playlist._logger(`Copying ${copies.length} items from the cache...`, "Verbose");
            return Promise.allSettled(copies).then((copyRes) => {
                const failedCopies = copyRes.filter(res => res.status !== 'fulfilled');
                const copyFail = failedCopies.length > 0;
                if (copyFail) {
                    console.error("(PLAYLIST) One or more files failed to copy to the playlist output directory:\n", failedCopies, failedCopies.map(res => (res as any).reason).join("\n"));
                    return null;
                }
                Playlist._logger(`All items retrieved from the cache. Building playlist...`);

                const media: M3uMedia[] = localFeedItems.map((feedItem) => {
                    Playlist._logger(`Creating media line for ${feedItem.item.title} (${feedItem.path})`, "VeryVerbose");
                    // Simply use the file name for the url, as it will sit next to the playlist
                    const pathParts = feedItem.path.split("/");
                    const fileName = pathParts[pathParts.length - 1];
                    Playlist._logger(`Extracted file name for playlist entry; ${fileName}`, "VeryVerbose");
                    const mediaItem = new M3uMedia(`${this.localAudioFileDirPath(feedItem.item, true)}/${fileName}`);
                    mediaItem.name = feedItem.item.title;
                    mediaItem.artist = feedItem.item.author;
                    return mediaItem;
                });

                playlist.medias = media;
                this.saveM3U(playlist);
                return this.rootDir();
            });
        }).catch((reason) => {
            Playlist._logger(`Playlist failed creation: ${reason}`);
            return null;
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
        const m3uPlaylist = new M3uParser().parse(fs.readFileSync(m3uPath).toString());
        Playlist._logger(`Loaded ${m3uPlaylist.medias.length} items from the playlist`, "Verbose");
        const valid = m3uPlaylist.medias.map(media => {
            return {
                title: media.name,
                podcast: media.artist
            }
        }).filter(x => x.podcast !== undefined && x.title !== undefined) as { title: string, podcast: string }[];
        Playlist._logger(`Parsed ${valid.length} items successfully`, 'Verbose');
        Playlist._logger(valid.map(v => `${v.podcast}: ${v.title}`).join("\n\t"), 'Verbose');
        if (valid.length !== m3uPlaylist.medias.length) {
            console.warn(`(PLAYLIST) ${m3uPlaylist.medias.length - valid.length} items could not be parsed`);
        }
        return valid;
    }
}