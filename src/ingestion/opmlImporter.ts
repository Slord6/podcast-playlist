import * as fs from 'fs';
import { Feed } from '../feed';
import { parseStringPromise } from 'xml2js';
import { RSSFeedImporter } from './rssFeedImporter';
import { error } from 'console';
import { Logger } from '../logger';

type PodcastOmpl = {
    opml: {
        body: [
            {
                outline: [
                    {
                        "$": { text: string, xmlUrl: string, htmlUrl: string, imageUrl: string }
                    }
                ]
            }
        ]
    }
};

export class OPMLImporter {
    private static _logger = Logger.GetNamedLogger("OPML");
    private omplXml: string;

    constructor(omplPath: string) {
        this.omplXml = fs.readFileSync(omplPath).toString();
    }

    public async toFeeds(): Promise<Feed[] | null> {
        // Does parseStringPromise resolve more than once??
        return parseStringPromise(this.omplXml).then((result: PodcastOmpl) => {
            OPMLImporter._logger(`Loading ${result.opml.body[0].outline.length} feeds...`);
            return result.opml.body[0].outline.map((outlineItem) => {
                const feedItem = outlineItem.$;
                OPMLImporter._logger(`Getting RSS for ${feedItem.text}`, "Verbose");
                return new RSSFeedImporter(new URL(feedItem.xmlUrl)).toFeed().catch((reason) => {
                    console.error(`Feed import failure when resolving ${feedItem} to feed: ${reason ? reason : ""}`);
                });
            }).filter(f => f !== undefined && f !== null) as Promise<Feed>[];
        }).then(feedPromises => {
            return new Promise<Feed[]>((resolve) => {
                resolve(Promise.all(feedPromises));
            });
        }).catch((reason) => {
            console.error(`(OPML) Failure: ${reason}`);
            return null;
        })
    }
}