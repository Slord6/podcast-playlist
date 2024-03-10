import { Feed } from "../feed";
import Parser from 'rss-parser';
import { FeedItem } from "../feedItem";
import { it } from "node:test";

export class RSSFeedImporter {
    private rssUrl: URL;

    constructor(rssUrl: URL) {
        this.rssUrl = rssUrl;
    }

    public async toFeed(): Promise<Feed> {
        const parser: Parser = new Parser();
        const feed = await parser.parseURL(this.rssUrl.toString());
        console.log(feed.title);

        const items: FeedItem[] = feed.items.map((item) => {
            const title = item.title ? item.title : "<Unknown title>";
            const urlLoc = item.enclosure?.url;
            const url = urlLoc ? new URL(urlLoc) : new URL("https://example.com"); // TODO better handling of missing URL
            return new FeedItem(title, url, item.pubDate ? item.pubDate : "");
        });
        
        const title = feed.title ? feed.title : "<Unknown title>";
        const imgUrl = feed.image?.url ? new URL(feed.image?.url) : new URL("https://example.com"); // TODO better handling of missing URL
        return new Feed(title, this.rssUrl, new URL(feed.feedUrl as string), new URL(imgUrl), items);
    }
}