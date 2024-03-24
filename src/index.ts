import { IngestConfig } from "./ingestion/ingestConfig";
import helpers = require("yargs/helpers")
import yargs = require("yargs/yargs");
import * as fs from "fs";
import { Feed } from "./feed";
import { OPMLImporter } from "./ingestion/opmlImporter";
import { RSSFeedImporter } from "./ingestion/rssFeedImporter";
import { PodcastAddictHistoryImporter } from "./ingestion/podcastAddictHistoryImporter";
import { History } from "./ingestion/history";
import { HistoryItem } from "./ingestion/historyItem";
import { Playlist } from "./playlist/playlist";

const DATA_DIR = "./data";
const HISTORY_PATH = `${DATA_DIR}/history.json`;

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
    .command("history", "Load listen history", (yargs) => {
        yargs.string("name")
        .describe("name", "Name of a podcast to check for in the history")
    })
    .command("playlist", "Create a new playlist", (yargs) => {
        yargs.string("title")
        .describe("title", "The title of the playlist")
        .number("count")
        .describe("count", "The number of items to add to the playlist")
        .boolean("local")
        .describe("local", "Download and reference the files locally")
        .demandOption(["title", "count"])
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
    case "history":
        history(argv.name ? argv.name : null);
        break;
    case "playlist":
        playlist(argv.title, argv.count, argv.local);
        break;
    default:
        console.error(`${argv._} is not a valid command`);
        break;
}

function playlist(title: string, count: number, local: boolean) {
    loadFeeds().then(feeds => {
        let history = loadHistory();
        if(history === null) {
            history = new History([]);
        }
        const playlist = Playlist.fromSelection(title, feeds, count, history);
        if(local) {
            playlist.toM3ULocal(`${DATA_DIR}/PLAYLISTS/`).then(console.log);
        } else {
            console.log(playlist.toM3U());
        }
    });
}

function importHistory(path: string) {
    console.log("Importing...");
    new PodcastAddictHistoryImporter(path).extract().then((history: History) => {
        console.log("History loaded.");
        fs.writeFileSync(HISTORY_PATH, JSON.stringify(history));
    }).catch((err) => {
        console.log("Import failed.", err);
    })
}

function loadHistory(): History | null {
    if(!fs.existsSync(HISTORY_PATH)) return null;
    const json = fs.readFileSync(HISTORY_PATH).toString();
    const history: History = History.fromJSON(json);
    return history;
}

function history(name: string | null) {
    const history = loadHistory();
    if(history === null) {
        console.log("No history has been imported.");
    } else {
        if(name === null) {
            // Print whole history if no query
            console.log(history.toString());
        } else {
            const inHistory: HistoryItem[] = history.queryByName(name);
            console.log(`"${name}" ${inHistory.length > 0 ? "is" : "is not"} in the listen history:`);
            console.log(inHistory.map(i => i.toString()).join("\n"));
        }
    }
}

function loadFeeds(): Promise<Feed[]> {
    return fs.promises.readdir(DATA_DIR, { withFileTypes: true }).then(dirents => {
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
        return feeds;
    });
}

function list() {
    loadFeeds().then(feeds => {
        feeds.forEach(f => console.log(f.name));
    });
}

function newIngest(path: string) {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR);
    }
    const ingestConfig: IngestConfig = IngestConfig.load(path);
    console.log(`Loaded ${ingestConfig.opmlSources.length} OPML sources and ${ingestConfig.rssSources.length} rss sources`);
    console.log("Resolving to feeds...");

    let resolvedFeeds: Feed[] = [];
    const parsing: Promise<any>[] = [];
    ingestConfig.opmlSources.forEach(source => {
        const opmlParse = new OPMLImporter(source).toFeeds().then(feeds => {
            console.log("OPML resolved to feeds")
            if (feeds !== null) {
                resolvedFeeds.push(...feeds);
            } else {
                console.warn(`OPML source ${source} failed (${feeds})`);
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
        let initialLength = resolvedFeeds.length;
        resolvedFeeds = resolvedFeeds.filter(f => f !== null);
        console.log(`Feeds loaded, saving ${resolvedFeeds.length} feeds to ${DATA_DIR} (${initialLength - resolvedFeeds.length} feeds failed to load)`);
        console.log(resolvedFeeds.map(f => f.name).join("\n"));

        resolvedFeeds.forEach(feed => {
            const dirName = `${DATA_DIR}/${feed.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
            if (!fs.existsSync(dirName)) {
                fs.mkdirSync(dirName);
            }
            fs.writeFileSync(`${dirName}/feed.json`, JSON.stringify(feed, null, "\t"))
        });
    });
}