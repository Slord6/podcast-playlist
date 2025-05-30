import { Feed } from "../feed";
import Parser from 'rss-parser';
import { FeedItem } from "../feedItem";
import { BufferedRequests } from "../bufferedRequests";
import { Logger } from "../logger";

export class RSSFeedImporter {
    private static _logger = Logger.GetNamedLogger("RSS");
    private rssUrl: URL;

    constructor(rssUrl: URL) {
        this.rssUrl = rssUrl;
    }

    public async toFeed(): Promise<Feed | null> {
        const parser: Parser = new Parser();
        RSSFeedImporter._logger(`Parsing ${this.rssUrl}...`, "Verbose");
        return BufferedRequests.fetch(this.rssUrl).then(resp => resp.text(), (reason) => console.error(`(RSS) Fetch-parse of ${this.rssUrl} failed: ${reason}`))
            .then(rssText => {
                if (!rssText) return null;
                RSSFeedImporter._logger(`Got feed document`, "VeryVerbose");
                return parser.parseString(rssText).then(feed => {
                    RSSFeedImporter._logger(`Feed inital parse successfuk`, "VeryVerbose");
                    const feedTitle = feed.title ? feed.title : "<Unknown Author>";
                    const items: FeedItem[] = feed.items.map((item) => {
                        try {
                            const title = item.title ? item.title : "<Unknown title>";
                            const urlLoc = item.enclosure?.url;
                            const url = urlLoc ? new URL(urlLoc) : new URL("https://example.com"); // TODO better handling of missing URL
                            return new FeedItem(title, url, item.pubDate ? item.pubDate : "", feedTitle, item.itunes?.episodeType || "full", item.enclosure?.type || null);
                        } catch (err) {
                            throw new Error(`Failed parsing feed item ${item} (caused by: ${err})`);
                        }
                    });

                    try {
                        const webPageSrc = feed.feedUrl || feed.link;
                        const imgSrc = feed.image?.url || feed.itunes?.image;
                        RSSFeedImporter._logger(`Feed info URLs:\n\t${webPageSrc}\n\t${imgSrc}`, "VeryVerbose")

                        const webUrl = webPageSrc ? new URL(webPageSrc) : new URL("https://example.com"); // TODO better handling of missing URL
                        const imgUrl = imgSrc ? new URL(imgSrc) : new URL("https://example.com"); // TODO better handling of missing URL

                        const feedObj = new Feed(feedTitle, this.rssUrl, webUrl, imgUrl, items);
                        RSSFeedImporter._logger(`Feed "${feedTitle}" parsed`, "Verbose");
                        return feedObj;
                    } catch (err) {
                        throw new Error(`Could not construct Feed object from parsed data (caused by: ${err})`);
                    }
                }).catch(reason => {
                    console.error(`(RSS) Could not parse ${this.rssUrl}: ${reason}`);
                    return null;
                });
            });
    }
}
