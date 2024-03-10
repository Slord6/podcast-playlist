import * as fs from "fs";

export class IngestConfig {

    private opml: string[];
    public get opmlSources(): string[] {
        return this.opml;
    }
    public set opmlSources(value: string[]) {
        this.opml = value;
    }
    private rss: string[];
    public get rssSources(): string[] {
        return this.rss;
    }
    public set rssSources(value: string[]) {
        this.rss = value;
    }

    constructor(opml: string[] = [], rss: string[] = []) {
        this.opml = opml;
        this.rss = rss;
    }

    public static load(path: string): IngestConfig {
        return IngestConfig.fromJSON(fs.readFileSync(path).toString());
    }

    public static fromJSON(json: string): IngestConfig {
        const rawConfig = JSON.parse(json);
        return new IngestConfig(rawConfig.opml, rawConfig.rss);
    }
}