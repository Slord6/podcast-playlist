import * as sqlite3lib from 'sqlite3';
import { HistoryItem } from './historyItem';
import { History } from './history';
import { Logger } from '../logger';

export type HistoryRow = {episodeName: string, episodeUrl: string | null, podcastName: string, playbackDate: number, podcast_id: number | null};

export class PodcastAddictHistoryImporter {
    private static _logger = Logger.GetNamedLogger("PodcastAddictImporter");
    private db: sqlite3lib.Database;

    constructor(path: string) {
        PodcastAddictHistoryImporter._logger(`Database loading from ${path}`);
        const sqlite3 = sqlite3lib.verbose();
        this.db = new sqlite3.Database(path);
    }

    public async extract(): Promise<History> {
        PodcastAddictHistoryImporter._logger(`Extracting history from DB...`);
        return new Promise((resolve, reject) => {
            const results: HistoryItem[] = [];
            this.db.serialize(() => {
                this.db.each("SELECT episodes.name as episodeName,episodes.url as episodeUrl,podcasts.name as podcastName,playbackDate,podcast_id from episodes INNER JOIN podcasts on podcast_id = podcasts._id WHERE playbackDate > 0",
                    (err, row: HistoryRow) => {
                        if (err) {
                            console.error(`(PodcastAddictImporter) DB query error: ${err}`);
                            reject(err);
                        } else {
                            results.push(new HistoryItem(row));
                        }
                    },
                    (err, count) => {
                        if (err) {
                            console.error(`(PodcastAddictImporter) DB query failed: ${err}`);
                            reject(err);
                        } else {
                            PodcastAddictHistoryImporter._logger(`Query resulted in ${count} history items (${results.length} loaded)`, "Verbose");
                            PodcastAddictHistoryImporter._logger(`Constructing history from ${results.length} items`);
                            resolve(new History(results));
                        }
                    });
            });

            this.db.close();
        });

    }
}