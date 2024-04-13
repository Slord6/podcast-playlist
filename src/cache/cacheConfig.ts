import { FeedItem } from "../feedItem";


type FeedMapping = { [key: string]: string[] };
type RawCache = {
    _cache: FeedMapping,
    _skipped: FeedMapping
}

export class CacheConfig {
    private _cache: FeedMapping;
    private _skipped: FeedMapping;

    constructor(cache: RawCache) {
        this._cache = cache._cache;
        this._skipped = cache._skipped;
    }

    public cachedContains(feedItem: FeedItem): boolean {
        const feedCache: string[] | undefined = this._cache[feedItem.author];
        if (!feedCache) return false;
        return feedCache.includes(feedItem.title);
    }

    public skippedContains(feedItem: FeedItem): boolean {
        const skipCache: string[] | undefined = this._skipped[feedItem.author];
        if (!skipCache) return false;
        return skipCache.includes(feedItem.title);
    }

    public cachedOrSkippedContains(feedItem: FeedItem): boolean {
        return this.cachedContains(feedItem) || this.skippedContains(feedItem);
    }

    public addToSkip(feedItem: FeedItem) {
        if (this.skippedContains(feedItem)) return;

        this.addKey(feedItem.author);
        const skipCache: string[] = this._skipped[feedItem.author];
        skipCache.push(feedItem.title);
    }

    public addToCache(feedItem: FeedItem) {
        if (this.skippedContains(feedItem)) return;

        this.addKey(feedItem.author);
        const cache: string[] = this._cache[feedItem.author];
        cache.push(feedItem.title);
    }

    public addKey(feedName: string) {
        if (!this._cache[feedName]) {
            this._cache[feedName] = [];
        }
        if (!this._skipped[feedName]) {
            this._skipped[feedName] = [];
        }
    }

    public static fromJSON(json: string): CacheConfig {
        const rawItem = JSON.parse(json);
        return new CacheConfig(rawItem as RawCache);
    }

    public static empty(): CacheConfig {
        return new CacheConfig({ _cache: {}, _skipped: {} });
    }
}