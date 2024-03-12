import { IngestConfig } from "./ingestion/ingestConfig";
import helpers = require("yargs/helpers")
import yargs = require("yargs/yargs");
import * as fs from "fs";
import { Feed } from "./feed";
import { OPMLImporter } from "./ingestion/opmlImporter";
import { RSSFeedImporter } from "./ingestion/rssFeedImporter";
import { PodcastAddictHistoryImporter } from "./ingestion/podcastAddictHistoryImporter";
import { History } from "./ingestion/history";

const DATA_DIR = "./data";

const argv = yargs(helpers.hideBin(process.argv))
    .command("ingest", "Add new, and update existing, podcast feeds", (yargs) => {
        yargs.string("path")
            .describe("path", "Path to the ingest configuration file")
            .demandOption(["path"])
    })
    .command("list", "List the ingested feeds")
    .command("importHistory", "Import listening history from a Podcast Addict backup db", (yargs) => {
        yargs.string("path")
            .describe("path", "Path to the backup db")
            .demandOption(["path"])
    })
    .demandCommand(1, 1)
    .parse() as any;

switch (argv._[0]) {
    case "ingest":
        newIngest(argv.path);
        break;
    case "list":
        list();
        break;
    case "importHistory":
        importHistory(argv.path);
        break;
    default:
        console.error(`${argv._} is not a valid command`);
        break;
}

function importHistory(path: string) {
    console.log("Importing...");
    new PodcastAddictHistoryImporter(path).extract().then((history: History) => {
        console.log("History loaded.");
    }).catch((err) => {
        console.log("Import failed.", err);
    })
}

function list() {
    fs.promises.readdir(DATA_DIR, { withFileTypes: true }).then(dirents => {
        return dirents.filter(dirent => dirent.isDirectory())
    }).then((subdirs: fs.Dirent[]) => {
        const feeds: Feed[] = [];
        subdirs.forEach(subDir => {
            const jsonPath = `${subDir.path}/${subDir.name}/feed.json`;
            if (fs.existsSync(jsonPath)) {
                const feed = Feed.fromJSON(fs.readFileSync(jsonPath).toString());
                feeds.push(feed);
            }
        });
        feeds.forEach(f => console.log(f.name));
    });
}

function newIngest(path: string) {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR);
    }
    const ingestConfig = IngestConfig.load(path);
    console.log(`Loaded ${ingestConfig.opmlSources.length} OPML sources and ${ingestConfig.rssSources.length} rss sources`);
    console.log("Resolving to feeds...");

    let resolvedFeeds: Feed[] = [];
    const parsing: Promise<any>[] = [];
    ingestConfig.opmlSources.forEach(source => {
        const opmlParse = new OPMLImporter(source).toFeeds().then(feeds => {
            if (feeds != null) {
                resolvedFeeds.push(...feeds);
            } else {
                console.warn(`OPML source ${source} failed`);
            }
        });
        parsing.push(opmlParse);
    });

    ingestConfig.rssSources.forEach(source => {
        const rssPromise = new RSSFeedImporter(new URL(source)).toFeed().then(feed => {
            if (feed !== null) {
                resolvedFeeds.push(feed);
            } else {
                console.warn(`RSS source ${source} failed`);
            }
        });
        parsing.push(rssPromise);
    });

    Promise.all(parsing).then(() => {
        resolvedFeeds = resolvedFeeds.filter(f => f !== null);
        console.log(resolvedFeeds.map(f => f.name).join("\n"));

        console.log("Done", resolvedFeeds.length);

        resolvedFeeds.forEach(feed => {
            const dirName = `${DATA_DIR}/${feed.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
            if (!fs.existsSync(dirName)) {
                fs.mkdirSync(dirName);
            }
            fs.writeFileSync(`${dirName}/feed.json`, JSON.stringify(feed, null, "\t"))
        });
    });
}