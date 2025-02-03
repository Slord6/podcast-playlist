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
import { Playlist } from "./playlist/playlist";
import { Logger } from "./logger";

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
            .command("feed", "Mark an entire feed as played", (yargs) => {
                yargs.string("name")
                    .describe("name", "Name of the feed to add to the history")
                    .demandOption("name");
            })
            .command("list", "List items in the history", (yargs) => {
                yargs.string("name")
                    .describe("name", "Filter by name")
            })
            .command("matching", "Mark episodes matching a regex as played", (yargs) => {
                yargs.string("feed")
                    .describe("feed", "The name of the feed to match items in")
                    .demandOption("feed")
                yargs.string("regex")
                    .describe("regex", "The regex to match against item titles")
                    .demandOption("regex")
                yargs.boolean("lowerCase")
                    .describe("lowerCase", "Checks the regex against the lower-cased title")
                yargs.boolean("dry")
                    .describe("dry", "Output the matches rather than adding to history")
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
                    .boolean("remote")
                    .describe("remote", "Reference the files by URL rather than downloading and referencing a local file")
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
            .command("import", "Import exsiting audio files into the cache", (yargs) => {
                yargs.string("path")
                    .describe("path", "The path to the directory containing all the files")
                    .boolean("recursive")
                    .describe("recursive", "If set, recurses into subdirectories to find more files")
                    .boolean("ignoreArtist")
                    .describe("ignoreArtist", "If set, will ignore artist values in file metadata and try to match only on the title")
                    .demandOption("path")
            })
            .demand(1, 1);
    })
    .boolean("verbose")
    .alias("verbose", "v")
    .describe("verbose", "Moderate verbosity of output")
    .boolean("veryverbose")
    .alias("veryverbose", "vv")
    .describe("veryverbose", "High verbosity of output")
    .demandCommand(1, 1)
    .version("0.1.0 (Alpha)")
    .parse() as any;

if (argv.veryverbose) {
    Logger.SetVerbosity("VeryVerbose");
    Logger.Log("Very Verbose output enabled", "VeryVerbose");
} else if (argv.verbose) {
    Logger.SetVerbosity("Verbose");
    Logger.Log("Verbose output enabled", "Verbose");
} else {
    Logger.SetVerbosity("Info");
}

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
                    argv.podcastAddict,
                    argv.playlist
                ]
            },
            "list": {
                func: listHistory,
                args: [
                    argv.name ? argv.name : null
                ]
            },
            "feed": {
                func: markFeedPlayed,
                args: [argv.name]
            },
            "matching": {
                func: markItemsByRegex,
                args: [argv.feed, argv.regex, argv.lowerCase, argv.dry]
            }
        }, "Invalid history command");
        break;
    case "playlist":
        handleCommand(argv._[1], {
            "create": {
                func: createPlaylist,
                args: [argv.title, argv.configPath, !argv.remote]
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
            },
            "import": {
                func: importCacheFiles,
                args: [argv.path, argv.recursive, argv.ignoreArtist]
            }
        }, "Invalid cache command");
        break;
    default:
        console.error(`${argv._} is not a valid command`);
        break;
}

function importCacheFiles(path: string, recursive: boolean | undefined, ignoreArtist: boolean | undefined) {
    const cache = new Cache(CACHE_DIR);
    Logger.Log(`Importing existing files from ${path}`);
    Logger.Log(`Importing with settings: recursive: ${recursive}, ignoreArtist: ${ignoreArtist}`, "VeryVerbose");
    cache.import(path, recursive === true, ignoreArtist === true);
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
    Logger.Log("Refreshing the cache...");
    cache.refresh().then(() => {
        Logger.Log("Feed refresh complete");
    });
}

function updateCache(feedName: string | undefined, latest: boolean, force: boolean) {
    const cache = new Cache(CACHE_DIR);
    if (feedName) {
        Logger.Log(`Updating cache for ${feedName}...`);
        loadFeeds().then(feeds => {
            const feed: Feed | undefined = feeds.filter(feed => feed.name.toLowerCase() === feedName.toLowerCase())[0];
            if (!feed) {
                console.error(`No known feed called "${feed}"`);
            } else {
                cache.cacheFeed(feed, latest, force).then(() => {
                    cache.save();
                    Logger.Log("Cache feed update complete");
                });
            }
        });
    } else {
        Logger.Log("Updating all feeds in the cache...");
        cache.update(latest).then(() => {
            cache.save();
            Logger.Log("Cache update complete");
        });
    }
}

function skipCache(all: boolean, feedName: string, history: boolean) {
    const cache = new Cache(CACHE_DIR);
    if (all) {
        Logger.Log("Skipping cache of all feed items");
        cache.skipAll().then(() => {
            cache.save();
            Logger.Log("Skip complete");
        });
    } else if (feedName) {
        Logger.Log(`Skipping cache of ${feedName}...`);
        loadFeeds().then(feeds => {
            Logger.Log(`Searching ${feeds.length}`, "Verbose");
            const feed: Feed | undefined = feeds.filter(feed => feed.name.toLowerCase() === feedName.toLowerCase())[0];
            if (!feed) {
                console.error(`No known feed called "${feed}"`);
            } else {
                cache.skip(feed);
                cache.save();
            }
        });
    } else if (history) {
        Logger.Log(`Skipping all items in the history...`);
        const currentHistory = loadHistory();
        if (!currentHistory) {
            console.warn("No history available");
            return;
        }
        loadFeeds().then(feeds => {
            const historyFeedItems: FeedItem[] = currentHistory.items.map(historyItem => FeedItem.fromHistoryItem(historyItem, feeds))
                .filter(i => i !== null) as FeedItem[];
            Logger.Log(`Found ${historyFeedItems.length} items to skip...`);
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
        if (playlist.onDisk()) {
            console.error(`A playlist called ${title} already exists (${playlist.playlistDirectoryPath()})`);
            return;
        }

        if (local) {
            const cache = new Cache(CACHE_DIR);
            playlist.toM3ULocal(cache).then(dirPath => {
                Logger.Log(`Playlist (local) created at ${dirPath}`);
            });
        } else {
            let playListPath: string = playlist.toM3U();
            Logger.Log(`Playlist (streaming) file created at ${playListPath}`);
        }
    });
}

function importHistory(opmlPath: string, playlistPath: string) {
    let history: History = loadHistory();
    const startCount = history.items.length;
    if (opmlPath) {
        Logger.Log(`Importing OPML history from ${opmlPath}`);
        new PodcastAddictHistoryImporter(opmlPath).extract().then((newHistory: History) => {
            Logger.Log("History loaded.");
            history = history.merge(newHistory);
            saveHistory(history);
        }).catch((err) => {
            Logger.Log("Import failed.", err);
        });
    }
    if (playlistPath) {
        Logger.Log(`Importing playlist history from ${playlistPath}`);
        const items = Playlist.loadItems(playlistPath);
        history = loadHistory();
        const time = Date.now();
        const newHistory = new History(
            items.map(item => new HistoryItem({
                episodeName: item.title,
                episodeUrl: null,
                playbackDate: time,
                podcastName: item.podcast,
                podcast_id: null
            }))
        )
        saveHistory(history.merge(newHistory));
    }
    const endCount = loadHistory().items.length;
    Logger.Log(`${endCount - startCount} items added to history (${endCount} total (may include duplicates))`);
}

function saveHistory(history: History) {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history));
}

function addToHistory(feedName: string, items: FeedItem[]) {
    const history = loadHistory();
    const time = Date.now();
    const newHistory = new History(items.map(item => {
        const histItem = new HistoryItem(
            {
                episodeName: item.title,
                episodeUrl: item.url.toString(),
                podcastName: feedName,
                playbackDate: time,
                // TODO: do we even need the podcast Id?
                podcast_id: null
            }
        );
        return histItem;
    }));
    saveHistory(history.merge(newHistory));
    Logger.Log(`Added ${items.length} items from ${feedName} to history`);

}

function markFeedPlayed(feedName: string) {
    loadFeeds().then(feeds => {
        const feed: undefined | Feed = feeds.filter(f => f.name === feedName)[0];
        if (!feed) {
            console.error(`No feed called ${feedName} found.`);
            return;
        }
        addToHistory(feed.name, feed.items);
    });
}

function markItemsByRegex(feedName: string, regex: string, lowerCase: boolean | undefined, dry: boolean | undefined) {
    lowerCase = lowerCase === undefined ? false : lowerCase;
    dry = dry === undefined ? false : dry;
    loadFeeds().then(feeds => {
        const feed: undefined | Feed = feeds.filter(f => f.name === feedName)[0];
        if (!feed) {
            console.error(`No feed called ${feedName} found.`);
            return;
        }

        const matcher = new RegExp(regex);
        const matches = feed.items.filter(item => matcher.test(lowerCase ? item.title.toLowerCase() : item.title));
        if (dry) {
            console.log(matches.map(i => i.title).join("\n"));
            console.log(`Would have added ${matches.length} items to history`)
        } else {
            console.log(matches.map(i => i.title).join("\n"));
            addToHistory(feed.name, matches);
        }
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
        Logger.Log("No history has been imported.");
    } else {
        if (name === null) {
            // Print whole history if no query
            Logger.Log(history.toString());
        } else {
            const inHistory: HistoryItem[] = history.queryByName(name);
            Logger.Log(`"${name}" ${inHistory.length > 0 ? "is" : "is not"} in the listen history:`);
            Logger.Log(inHistory.map(i => i.toString()).join("\n"));
        }
    }
}

function loadFeeds(): Promise<Feed[]> {
    return new Cache(CACHE_DIR).loadFeeds();
}

function list() {
    loadFeeds().then(feeds => {
        feeds.forEach(f => Logger.Log(f.name));
    });
}

function newIngest(path: string) {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR);
    }
    const ingestConfig: IngestConfig = IngestConfig.load(path);
    Logger.Log(`Loaded ${ingestConfig.opmlSources.length} OPML sources and ${ingestConfig.rssSources.length} rss sources`);
    Logger.Log("Resolving to feeds...");

    let resolvedFeeds: Feed[] = [];
    const parsing: Promise<any>[] = [];
    ingestConfig.opmlSources.forEach(source => {
        const opmlParse = new OPMLImporter(source).toFeeds().then(feeds => {
            Logger.Log("OPML resolved to feeds")
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
        Logger.Log(`Feeds loaded, saving ${resolvedFeeds.length} feeds to ${CACHE_DIR} (${initialLength - resolvedFeeds.length} feeds failed to load)`);
        Logger.Log(resolvedFeeds.map(f => f.name).join("\n"));

        const cache = new Cache(CACHE_DIR);
        resolvedFeeds.forEach(feed => {
            cache.registerFeed(feed);
        });
    });
}