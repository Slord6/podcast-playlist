import { Feed } from './feed';
import { FeedItem } from './feedItem';
import { PlayheadFeed } from './playlist/playheadFeed';
import { Playlist } from './playlist/playlist';
import { History } from './ingestion/history';

type PlaylistFeedConfig = {
    name: string,
    ordered?: boolean,
    exclude?: string[]
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
                    count: 0
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

    public feedItemPassesFilters(feedItem: FeedItem): boolean {
        const filters = this._configuration.playlist.episodeTitleFilters.map(f => new RegExp(f));
        // Passes if none of the filters match on it
        return filters.map(filter => {
            return filter.test(feedItem.title);
        }).filter(p => !p).length == 0;
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
            .map(feed => new PlayheadFeed(feed, history, this.feedItemPassesFilters.bind(this)))
            .filter(f => !f.listened);
        const list: FeedItem[] = [];

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