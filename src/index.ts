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
import { PlaylistConfiguration } from "./playlistConfiguration";
import { Cache } from "./cache/cache";
import { FeedItem } from "./feedItem";

const DATA_DIR = "./data"
const CACHE_DIR = `${DATA_DIR}/cache`;
const PLAYLIST_DIR = `${DATA_DIR}/playlists`;
const HISTORY_PATH = `${DATA_DIR}/history.json`;

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

const argv = yargs(helpers.hideBin(process.argv))
    .command("ingest", "Add new, and update existing, podcast feeds", (yargs) => {
        // TODO: support --rss <rss url>
        yargs.string("path")
            .describe("path", "Path to the ingest configuration file")
            .demandOption(["path"])
    })
    .command("list", "List the ingested feeds")
    // TODO: support marking a playlist as listened
    // TODO: Refactor to "history -importPA <path>" & "history -importPlaylist <path>"
    .command("importHistory", "Import listening history from a Podcast Addict backup db", (yargs) => {
        yargs.string("path")
            .describe("path", "Path to the backup db")
            .demandOption(["path"])
    })
    .command("history", "Load listen history", (yargs) => {
        yargs.string("name")
            .describe("name", "Name of a podcast to check for in the history")
    })
    .command("playlist", "Playlist commands", (yargs) => {
        yargs.command("create", "Create a new playlist", (yargs) => {
            yargs.string("title")
                .describe("title", "The title of the playlist")
                .string("configPath")
                .describe("configPath", "Path to the configuration JSON")
                .boolean("local")
                .describe("local", "Download and reference the files locally")
                .demandOption(["title", "configPath"])
        })
            .demandCommand(1, 1);
    })
    .command("cache", "Cache commands", (yargs) => {
        yargs.command("refresh", "Update the cached feeds")
            .command("update", "Download any uncached feed items", (yargs) => {
                yargs.boolean("latest")
                    .describe("latest", "If set, only get the most recent episode of each feed")
                    .string("feed")
                    .describe("feed", "Update only a specific feed")
                    .boolean("force")
                    .describe("force", "If updating a specific feed, set this flag to ignore the cache status. Requires --feed")
                    .check((argv) => {
                        if(argv.force && !argv.feed) {
                            throw new Error("--force can only be used when a feed is specified with --feed");
                        }
                        return true;
                    });
            })
            .command("skip", "Mark all episodes in feeds as not requiring caching.", (yargs) => {
                yargs.boolean("all")
                    .describe("all", "Skip all the episodes in all the feeds that aren't already skipped or cached")
                    .boolean("history")
                    .describe("history", "Skip any item that has already been listend to")
                    .string("feed")
                    .describe("feed", "Skip the episodes in a specific feed by its name (capitalisation ignored)")
                    .conflicts("all", ["history", "feed"])
                    .conflicts("history", ["all", "feed"])
                    .conflicts("feed", ["history", "all"])
                    .check((argv) => {
                        if(!argv.all && !argv.feed && !argv.history) {
                            throw new Error("Must set at least one option of --all, --feed and --history");
                        }
                        return true;
                    });
            })
            .demand(1, 1);
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
        createPlaylist(argv.title, argv.configPath, argv.local);
        break;
    case "cache":
        cache(argv);
        break;
    default:
        console.error(`${argv._} is not a valid command`);
        break;
}

function cache(argv: any) {
    const cacheCommand = argv._[1];
    const cache = new Cache(CACHE_DIR);
    switch (cacheCommand) {
        case "refresh":
            console.log("Refreshing the cache...");
            cache.refresh().then(() => {
                console.log("Feed refresh complete");
            });
            break;
        case "update":
            if (argv.feed) {
                console.log(`Updating cache for ${argv.feed}...`);
                loadFeeds().then(feeds => {
                    const feed: Feed | undefined = feeds.filter(feed => feed.name.toLowerCase() === argv.feed.toLowerCase())[0];
                    if (!feed) {
                        console.error(`No known feed called "${argv.feed}"`);
                    } else {
                        cache.cacheFeed(feed, argv.latest, argv.force).then(() => {
                            cache.save();
                            console.log("Cache feed update complete");
                        });
                    }
                });
            } else {
                console.log("Updating all feeds in the cache...");
                cache.update(argv.latest).then(() => {
                    cache.save();
                    console.log("Cache update complete");
                });
            }
            break;
        case "skip":
            if (argv.all) {
                console.log("Skipping cache of all feed items");
                cache.skipAll().then(() => {
                    cache.save();
                    console.log("Skip complete");
                });
            } else if (argv.feed) {
                console.log(`Skipping cache of ${argv.feed}...`);
                loadFeeds().then(feeds => {
                    console.log("searching", feeds.length);
                    const feed: Feed | undefined = feeds.filter(feed => feed.name.toLowerCase() === argv.feed.toLowerCase())[0];
                    if (!feed) {
                        console.error(`No known feed called "${argv.feed}"`);
                    } else {
                        cache.skip(feed);
                        cache.save();
                    }
                });
            } else if (argv.history) {
                console.log(`Skipping all items in the history...`);
                const history = loadHistory();
                if (!history) {
                    console.warn("No history available");
                    return;
                }
                loadFeeds().then(feeds => {
                    const historyFeedItems: FeedItem[] = history.items.map(historyItem => FeedItem.fromHistoryItem(historyItem, feeds))
                        .filter(i => i !== null) as FeedItem[];
                    console.log(`Found ${historyFeedItems.length} items to skip...`);
                    historyFeedItems.forEach(cache.skipItem.bind(cache));
                    cache.save();
                });
            } else {
                console.warn(`Unknown cache skip args`);
                break;
            }
            break;
        default:
            console.error(`${cacheCommand} is not a valid cache command (${argv._})`);
            break;
    }
}

function createPlaylist(title: string, configPath: string, local: boolean) {
    let configuration: PlaylistConfiguration;
    if (!fs.existsSync(configPath)) {
        console.error(`${configPath} does not exist`);
        return;
    } else {
        try {
            configuration = PlaylistConfiguration.fromJSON(fs.readFileSync(configPath).toString());
        } catch (err) {
            console.error(`Could not load playlist configuration from ${configPath}: ${err}`);
            return;
        }
    }
    loadFeeds().then(feeds => {
        let history = loadHistory();
        if (history === null) {
            history = new History([]);
        }
        const playlist = configuration.generate(title, feeds, history);
        if (local) {
            const cache = new Cache(CACHE_DIR);
            playlist.toM3ULocal(PLAYLIST_DIR, cache).then(console.log);
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
    if (!fs.existsSync(HISTORY_PATH)) return null;
    const json = fs.readFileSync(HISTORY_PATH).toString();
    const history: History = History.fromJSON(json);
    return history;
}

function history(name: string | null) {
    const history = loadHistory();
    if (history === null) {
        console.log("No history has been imported.");
    } else {
        if (name === null) {
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
    return new Cache(CACHE_DIR).loadFeeds();
}

function list() {
    loadFeeds().then(feeds => {
        feeds.forEach(f => console.log(f.name));
    });
}

function newIngest(path: string) {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR);
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
        console.log(`Feeds loaded, saving ${resolvedFeeds.length} feeds to ${CACHE_DIR} (${initialLength - resolvedFeeds.length} feeds failed to load)`);
        console.log(resolvedFeeds.map(f => f.name).join("\n"));

        const cache = new Cache(CACHE_DIR);
        resolvedFeeds.forEach(feed => {
            cache.registerFeed(feed);
        });
    });
}