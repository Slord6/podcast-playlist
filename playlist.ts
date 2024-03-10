import {M3uPlaylist, M3uMedia} from 'm3u-parser-generator';

export class Playlist {
    private _title: string;
    public get title(): string {
        return this._title;
    }
    public set title(value: string) {
        this._title = value;
    }

    constructor(title: string) {
        this._title = title;
    }
    

    public toM3U(): string {
        const playlist = new M3uPlaylist();
        playlist.title = this.title;

        return playlist.getM3uString();
    }
}