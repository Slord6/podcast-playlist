import { Feed } from './feed';
import { EpisodeType, FeedItem } from './feedItem';
import { PlayheadFeed } from './playlist/playheadFeed';
import { Playlist } from './playlist/playlist';
import { History } from './ingestion/history';
import { Logger } from './logger';

type PlaylistFeedConfig = {
    name: string,
    ordered?: boolean,
    exclude?: string[],
    include?: string[],
    skipTypes?: EpisodeType[],
};

type PlaylistConfig = {
    playlist: {
        include: PlaylistFeedConfig[],
        count: number
    }
};

export class PlaylistConfiguration {
    private static _logger = Logger.GetNamedLogger("PLAYLISTCONF");
    private _configuration: PlaylistConfig;
    public get count(): number {
        return this._configuration.playlist.count;
    }

    constructor(config?: PlaylistConfig) {
        if (!config) {
            config = {
                playlist: {
                    include: [],
                    count: 0,
                }
            }
        }
        this._configuration = config;
    }

    public filterFeeds(feeds: Feed[]): Feed[] {
        const includedNames = this._configuration.playlist.include.map(i => i.name);
        const selected = feeds.filter((feed) => {
            return includedNames.includes(feed.name);
        });
        PlaylistConfiguration._logger(`Configuration requested ${includedNames.length}, matched to ${selected.length} known feeds`, "Verbose");
        if (includedNames.length !== selected.length) {
            PlaylistConfiguration._logger(`Could not match ${includedNames.length - selected.length} configuration items to a feed:`, "Info");
            const foundNames = selected.map(s => s.name);
            PlaylistConfiguration._logger(`\r\n\t ${includedNames.filter(n => !foundNames.includes(n)).join(`\r\n\t`)}`);
        }
        return selected;
    }

    private getFeedConfig(feedName: string): PlaylistFeedConfig | null {
        const found = this._configuration.playlist.include.filter(f => f.name === feedName)[0];
        return found ?? null;
    }

    public feedItemPassesFilters(feedItem: FeedItem, feedName: string): boolean {
        const feedConfig = this.getFeedConfig(feedName);
        if (feedConfig === null) {
            throw new Error(`Could not find feed ${feedName} when applying playlist filters`);
        }

        // Automatically passes if it is included in the include list
        if (feedConfig.include) {
            PlaylistConfiguration._logger(`${feedItem.title}: Include configured (${feedConfig.include.join(", ")})`, "VeryVerbose");
            const filters = feedConfig.include.map(f => new RegExp(f));
            const matches = filters.filter(filter => {
                const res = filter.test(feedItem.title);
                PlaylistConfiguration._logger(`\t ${filter.source} = ${res}`, "VeryVerbose");
                return res;
            });
            PlaylistConfiguration._logger(`\t Matches: ${matches.length}}`, "VeryVerbose");
            if (matches.length > 0) {
                PlaylistConfiguration._logger(`${feedItem.title} explicitly included`, "VeryVerbose");
                return true;
            }
        }

        // Passes if none of the exclude filters match on it
        let notExcluded = true;
        if (feedConfig.exclude) {
            PlaylistConfiguration._logger(`${feedItem.title}: Exclude configured (${feedConfig.exclude.join(", ")})`, "VeryVerbose");
            const filters = feedConfig.exclude.map(f => new RegExp(f));
            const matches = filters.filter(filter => {
                const res = filter.test(feedItem.title);
                PlaylistConfiguration._logger(`\t ${filter.source} = ${res}`, "VeryVerbose");
                return res;
            });
            PlaylistConfiguration._logger(`\t Matches: ${matches.length}}`, "VeryVerbose");
            notExcluded = matches.length === 0;
        }

        // Passes if it isn't of one of the types to skip
        let typePass = true;
        if (feedConfig.skipTypes) {
            typePass = !feedConfig.skipTypes.includes(feedItem.type);
        }
        PlaylistConfiguration._logger(`${feedItem.title} (PASS: ${notExcluded && typePass}): notExclude:${notExcluded}, typePass:${typePass}`, "VeryVerbose")
        return notExcluded && typePass;
    }

    public static fromJSON(json: string): PlaylistConfiguration {
        const config: PlaylistConfig = JSON.parse(json);
        return new PlaylistConfiguration(config);
    }

    private static shuffleInPlace(items: any[]) {
        // Shuffle using Fisher-Yates
        // https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
        for (let index = items.length - 1; index >= 0; index--) {
            /*
            for i from n−1 down to 1 do
            j ← random integer such that 0 ≤ j ≤ i
            exchange a[j] and a[i]
            */
            const randIndex = Math.round(Math.random() * index);
            let chosen = items[randIndex];
            items[randIndex] = items[index];
            items[index] = chosen;
        }
    }

    public generate(title: string, feeds: Feed[], history: History, playlistWorkingDir: string): Playlist {
        let feedsCopy: PlayheadFeed[] = this.filterFeeds(feeds)
            .map(feed => new PlayheadFeed(feed, history, (feedItem: FeedItem) => this.feedItemPassesFilters(feedItem, feed.name)))
            .filter(f => !f.finished);
        const list: FeedItem[] = [];
        PlaylistConfiguration._logger(`Generating playlist from ${feedsCopy.length} feeds`, 'VeryVerbose');

        // TODO: support weightings in the playlist config

        let previous: PlayheadFeed | null = null;
        while (feedsCopy.length > 0 && list.length < this.count) {
            let chosen: PlayheadFeed;
            let retry = 0;
            do {
                retry++;
                PlaylistConfiguration.shuffleInPlace(feedsCopy);
                chosen = feedsCopy[0];
            } while (previous === chosen && feedsCopy.length > 1); // Don't have consecutive playlist items from the same feed
            PlaylistConfiguration._logger(`Took ${retry} times to find next feed (from ${feedsCopy.length}) remaining`, 'VeryVerbose');
            list.push(chosen.current!);

            chosen.progress();
            if (chosen.finished) {
                PlaylistConfiguration._logger(`No available items left to add to playlist from ${chosen.feed.name}`);
                feedsCopy = feedsCopy.filter(f => !f.finished);
            }
            previous = chosen;
        }
        PlaylistConfiguration._logger(`Generated playlist:\n\t${list.map(l => `(${l.author}) ${l.title}`).join(`\r\n\t`)}`, 'Verbose');

        return new Playlist(title, list, playlistWorkingDir);
    }
}