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

const DATA_DIR = process.env.PODCASTPLAYLISTDIR || "./data";
const CACHE_DIR = `${DATA_DIR}/cache`;
const PLAYLIST_DIR = `${DATA_DIR}/playlists`;
const HISTORY_PATH = `${DATA_DIR}/history.json`;

type CommandMapping = { [key: string]: { func: Function, args: any[] } };

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

const argv = yargs(helpers.hideBin(process.argv))
    // TODO: move under a "feed" command, merge with "list"
    .command("feed", "Manage podcast feeds", (yargs) => {
        yargs
            .command("ingest", "Add new, and update existing, podcast feeds", (yargs) => {
                // TODO: support --rss <rss url>
                yargs.string("path")
                    .describe("path", "Path to the ingest configuration file")
                    .demandOption(["path"])
            })
            .command("list", "List the ingested feeds")
            .demandCommand(1, 1)
    })
    .command("history", "Import listening history", (yargs) => {
        yargs
            .command("import", "Import history", (yargs) => {
                yargs.string("podcastAddict")
                    .describe("podcastAddict", "Path to the Podcast Addict backup db")
                    .string("playlist")
                    .describe("playlist", "Path to the playlist to mark as listened")
            })
            .command("list", "List items in the history", (yargs) => {
                yargs.string("name")
                    .describe("name", "Filter by name")
            })
            .conflicts("import", "list")
            .conflicts("list", "import")
            .demandCommand(1, 1);
    })
    .command("playlist", "Playlist management", (yargs) => {
        yargs
            .command("create", "Create a new playlist", (yargs) => {
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
    .command("cache", "Cache management", (yargs) => {
        yargs
            .command("refresh", "Update the cached feeds")
            .command("update", "Download any uncached feed items", (yargs) => {
                yargs.boolean("latest")
                    .describe("latest", "If set, only get the most recent episode of each feed")
                    .string("feed")
                    .describe("feed", "Update only the named feed")
                    .boolean("force")
                    .describe("force", "If updating a specific feed, set this flag to ignore the cache status. Requires --feed")
                    .check((argv) => {
                        if (argv.force && !argv.feed) {
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
                        if (!argv.all && !argv.feed && !argv.history) {
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
    case "feed":
        handleCommand(argv._[1], {
            "list": { func: list, args: [] },
            "ingest": { func: newIngest, args: [argv.path] }
        }, "Invalid feed command");
        break;
    case "history":
        handleCommand(argv._[1], {
            "import": {
                func: importHistory,
                args: [
                    [
                        argv.podcastAddict,
                        argv.playlist
                    ].filter(x => x !== undefined)
                ]
            },
            "list": {
                func: listHistory,
                args: [
                    argv.name ? argv.name : null
                ]
            }
        }, "Invalid history command");
        break;
    case "playlist":
        handleCommand(argv._[1], {
            "create": {
                func: createPlaylist,
                args: [argv.title, argv.configPath, argv.local]
            }
        }, "Invalid playlist command");
        break;
    case "cache":
        handleCommand(argv._[1], {
            "refresh": {
                func: refreshCache,
                args: []
            },
            "update": {
                func: updateCache,
                args: [argv.feed, argv.latest, argv.force]
            },
            "skip": {
                func: skipCache,
                args: [argv.all, argv.feed, argv.history]
            }
        }, "Invalid cache command");
        break;
    default:
        console.error(`${argv._} is not a valid command`);
        break;
}

function handleCommand(command: string, mapping: CommandMapping, errorText: string) {
    const handler = mapping[command];
    if (!handler) {
        console.error(errorText);
        return;
    }
    handler.func.apply(null, handler.args);
}

function refreshCache() {
    const cache = new Cache(CACHE_DIR);
    console.log("Refreshing the cache...");
    cache.refresh().then(() => {
        console.log("Feed refresh complete");
    });
}

function updateCache(feedName: string | undefined, latest: boolean, force: boolean) {
    const cache = new Cache(CACHE_DIR);
    if (feedName) {
        console.log(`Updating cache for ${feedName}...`);
        loadFeeds().then(feeds => {
            const feed: Feed | undefined = feeds.filter(feed => feed.name.toLowerCase() === feedName.toLowerCase())[0];
            if (!feed) {
                console.error(`No known feed called "${feed}"`);
            } else {
                cache.cacheFeed(feed, latest, force).then(() => {
                    cache.save();
                    console.log("Cache feed update complete");
                });
            }
        });
    } else {
        console.log("Updating all feeds in the cache...");
        cache.update(latest).then(() => {
            cache.save();
            console.log("Cache update complete");
        });
    }
}

function skipCache(all: boolean, feedName: string, history: boolean) {
    const cache = new Cache(CACHE_DIR);
    if (all) {
        console.log("Skipping cache of all feed items");
        cache.skipAll().then(() => {
            cache.save();
            console.log("Skip complete");
        });
    } else if (feedName) {
        console.log(`Skipping cache of ${feedName}...`);
        loadFeeds().then(feeds => {
            console.log("searching", feeds.length);
            const feed: Feed | undefined = feeds.filter(feed => feed.name.toLowerCase() === feedName.toLowerCase())[0];
            if (!feed) {
                console.error(`No known feed called "${feed}"`);
            } else {
                cache.skip(feed);
                cache.save();
            }
        });
    } else if (history) {
        console.log(`Skipping all items in the history...`);
        const currentHistory = loadHistory();
        if (!currentHistory) {
            console.warn("No history available");
            return;
        }
        loadFeeds().then(feeds => {
            const historyFeedItems: FeedItem[] = currentHistory.items.map(historyItem => FeedItem.fromHistoryItem(historyItem, feeds))
                .filter(i => i !== null) as FeedItem[];
            console.log(`Found ${historyFeedItems.length} items to skip...`);
            historyFeedItems.forEach(cache.skipItem.bind(cache));
            cache.save();
        });
    } else {
        console.warn(`Unknown cache skip args`);
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
        const playlist = configuration.generate(title, feeds, history, PLAYLIST_DIR);
        // Check we're not overwriting an existing playlist
        if(playlist.onDisk()) {
            console.error(`A playlist called ${title} already exists (${playlist.playlistDirectoryPath()})`);
            return;
        }

        if (local) {
            const cache = new Cache(CACHE_DIR);
            playlist.toM3ULocal(cache).then(dirPath => {
                console.log(`Playlist (local) created at ${dirPath}`);
            });
        } else {
            let playListPath: string = playlist.toM3U();
            console.log(`Playlist (streaming) file created at ${playListPath}`);
        }
    });
}

function importHistory(paths: string[]) {
    paths.forEach(path => {
        console.log(`Importing history from ${path}`);
        let history: History = loadHistory();
        new PodcastAddictHistoryImporter(path).extract().then((newHistory: History) => {
            console.log("History loaded.");
            history = history.merge(newHistory);
            fs.writeFileSync(HISTORY_PATH, JSON.stringify(history));
        }).catch((err) => {
            console.log("Import failed.", err);
        })
    });
}

function loadHistory(): History {
    if (!fs.existsSync(HISTORY_PATH)) {
        fs.writeFileSync(HISTORY_PATH, JSON.stringify({ _items: [] }));
    }
    const json = fs.readFileSync(HISTORY_PATH).toString();
    const history: History = History.fromJSON(json);
    return history;
}

function listHistory(name: string | null) {
    const history = loadHistory();
    if (history.items.length === 0) {
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