import * as fs from 'fs';
import { Feed } from '../feed';
import { parseStringPromise } from 'xml2js';

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
    private omplXml: string;

    constructor(omplPath: string) {
        this.omplXml = fs.readFileSync(omplPath).toString();
    }

    public async toFeeds(): Promise<Feed[]> {
        return parseStringPromise(this.omplXml).then((result: PodcastOmpl) => {
            return result.opml.body[0].outline.map((outlineItem) => {
                const feedItem = outlineItem.$;
                try {
                    return new Feed(feedItem.text, new URL(feedItem.xmlUrl), new URL(feedItem.htmlUrl), new URL(feedItem.imageUrl));
                } catch {
                    console.log("FAIL", feedItem.text);
                }
            }).filter(f => f !== undefined) as Feed[];
        });
    }
}