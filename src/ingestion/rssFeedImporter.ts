import { Feed } from "../feed";
import Parser from 'rss-parser';
import { FeedItem } from "../feedItem";
import { BufferedRequests } from "../bufferedRequests";

export class RSSFeedImporter {
    private rssUrl: URL;

    constructor(rssUrl: URL) {
        this.rssUrl = rssUrl;
    }

    public async toFeed(): Promise<Feed | null> {
        const parser: Parser = new Parser();
        console.log(`(RSS) Parsing ${this.rssUrl}...`);
        return BufferedRequests.fetch(this.rssUrl).then(resp => resp.text(), (reason) => console.log(`(RSS) Fetch-parse of ${this.rssUrl} failed: ${reason}`))
            .then(rssText => {
                if(!rssText) return null;
                return parser.parseString(rssText).then(feed => {
                    const feedTitle = feed.title ? feed.title : "<Unknown Author>";
                    const items: FeedItem[] = feed.items.map((item) => {
                        const title = item.title ? item.title : "<Unknown title>";
                        const urlLoc = item.enclosure?.url;
                        const url = urlLoc ? new URL(urlLoc) : new URL("https://example.com"); // TODO better handling of missing URL
                        return new FeedItem(title, url, item.pubDate ? item.pubDate : "", feedTitle);
                    });

                    const imgUrl = feed.image?.url ? new URL(feed.image?.url) : new URL("https://example.com"); // TODO better handling of missing URL
                    const feedObj = new Feed(feedTitle, this.rssUrl, new URL(feed.feedUrl as string), new URL(imgUrl), items);
                    console.log(`(RSS) Feed "${feedTitle}" parsed`);
                    return feedObj;
                }).catch(reason => {
                    console.error(`(RSS) Could not parse ${this.rssUrl}: ${reason}`);
                    return null;
                });
            });
    }
}