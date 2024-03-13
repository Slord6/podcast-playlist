import * as sqlite3lib from 'sqlite3';
import { HistoryItem } from './historyItem';
import { History } from './history';

export type HistoryRow = {episodeName: string, episodeUrl: string | null, podcastName: string, playbackDate: number, podcast_id: number};

export class PodcastAddictHistoryImporter {
    private db: sqlite3lib.Database;

    constructor(path: string) {
        console.log(`(PodcastAddictImporter)Database loading from ${path}`);
        const sqlite3 = sqlite3lib.verbose();
        this.db = new sqlite3.Database(path);
    }

    public async extract(): Promise<History> {
        console.log(`(PodcastAddictImporter)Extracting history from DB...`);
        return new Promise((resolve, reject) => {
            const results: HistoryItem[] = [];
            this.db.serialize(() => {
                this.db.each("SELECT episodes.name as episodeName,episodes.url as episodeUrl,podcasts.name as podcastName,playbackDate,podcast_id from episodes INNER JOIN podcasts on podcast_id = podcasts._id WHERE playbackDate > 0",
                    (err, row: HistoryRow) => {
                        if (err) {
                            console.error(`(PodcastAddictImporter)DB query error: ${err}`);
                            reject(err);
                        } else {
                            results.push(new HistoryItem(row));
                        }
                    },
                    (err, count) => {
                        if (err) {
                            console.error(`(PodcastAddictImporter)DB query failed: ${err}`);
                            reject(err);
                        } else {
                            console.log(`(PodcastAddictImporter)Query resulted in ${count} history items (${results.length} loaded)`);
                            console.log(`(PodcastAddictImporter)Constructing history from ${results.length} items`);
                            resolve(new History(results));
                        }
                    });
            });

            this.db.close();
        });

    }
}