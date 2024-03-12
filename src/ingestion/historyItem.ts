import { HistoryRow } from "./podcastAddictHistoryImporter";


export class HistoryItem {
    private _episodeName: string;
    public get episodeName(): string {
        return this._episodeName;
    }
    public set episodeName(value: string) {
        this._episodeName = value;
    }
    private _episodeURL: URL | null;
    public get episodeURL(): URL | null {
        return this._episodeURL;
    }
    public set episodeURL(value: URL | null) {
        this._episodeURL = value;
    }
    private _listenDate: Date;
    public get listenDate(): Date {
        return this._listenDate;
    }
    public set listenDate(value: Date) {
        this._listenDate = value;
    }
    private _podcastName: string;
    public get podcastName(): string {
        return this._podcastName;
    }
    public set podcastName(value: string) {
        this._podcastName = value;
    }
    private _podcastId: number;

    constructor(row: HistoryRow) {
        this._episodeName = row.episodeName;
        this._episodeURL = row.episodeUrl ? new URL(row.episodeUrl) : null;
        this._listenDate = new Date(row.playbackDate);
        this._podcastName = row.podcastName;
        this._podcastId = row.podcast_id;
    }

    public toString() {
        console.log(`"${this.episodeName}"(${this.episodeURL?.toString()}) from "${this.podcastName}" listened to on ${this.listenDate.toLocaleString()}`);
    }
    }
}