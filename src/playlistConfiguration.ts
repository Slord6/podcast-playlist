import { Feed } from './feed';
import { EpisodeType, FeedItem } from './feedItem';
import { PlayheadFeed } from './playlist/playheadFeed';
import { Playlist } from './playlist/playlist';
import { History } from './ingestion/history';

type PlaylistFeedConfig = {
    name: string,
    ordered?: boolean,
    exclude?: string[],
    skipTypes?: EpisodeType[],
};

type PlaylistConfig = {
    playlist: {
        include: PlaylistFeedConfig[]
        episodeTitleFilters: string[],
        count: number
    }
};

export class PlaylistConfiguration {
    private _configuration: PlaylistConfig;
    public get count(): number {
        return this._configuration.playlist.count;
    }

    constructor(config?: PlaylistConfig) {
        if (!config) {
            config = {
                playlist: {
                    include: [],
                    episodeTitleFilters: [],
                    count: 0,
                }
            }
        }
        this._configuration = config;
    }

    private filterFeeds(feeds: Feed[]): Feed[] {
        const includedNames = this._configuration.playlist.include.map(i => i.name);
        return feeds.filter((feed) => {
            return includedNames.includes(feed.name);
        });
    }

    private getFeedConfig(feedName: string): PlaylistFeedConfig | null {
        const found = this._configuration.playlist.include.filter(f => f.name === feedName)[0];
        return found ?? null;
    }

    public feedItemPassesFilters(feedItem: FeedItem, feedName: string): boolean {
        // Passes if none of the title filters match on it
        const filters = this._configuration.playlist.episodeTitleFilters.map(f => new RegExp(f));
        const namePass = filters.map(filter => {
            return filter.test(feedItem.title);
        }).filter(p => !p).length == 0;

        const feedConfig = this.getFeedConfig(feedName);
        if (feedConfig === null) {
            throw new Error(`Could not find feed ${feedName} when applying playlist filters`);
        }

        // Passes if none of the exclude filters match on it
        let notExcluded = true;
        if (feedConfig.exclude) {
            const filters = feedConfig.exclude.map(f => new RegExp(f));
            notExcluded = filters.map(filter => {
                return filter.test(feedItem.title);
            }).filter(p => !p).length == 0;
        }

        // Passes if it isn't of one of the types to skip
        let typePass = true;
        if (feedConfig.skipTypes) {
            typePass = !feedConfig.skipTypes.includes(feedItem.type);
        }
        return namePass && notExcluded && typePass;
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
        let feedsCopy = this.filterFeeds(feeds)
            .map(feed => new PlayheadFeed(feed, history, (feedItem: FeedItem) => this.feedItemPassesFilters(feedItem, feed.name)))
            .filter(f => !f.listened);
        const list: FeedItem[] = [];

        // TODO: support weightings in the playlist config

        while (feedsCopy.length > 0 && list.length < this.count) {
            PlaylistConfiguration.shuffleInPlace(feedsCopy);
            const chosen = feedsCopy[0];
            list.push(chosen.nextUnsafe);
            chosen.skip();

            feedsCopy = feedsCopy.filter(f => !f.listened);
        }

        return new Playlist(title, list, playlistWorkingDir);
    }
}