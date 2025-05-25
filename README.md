# podcast-playlist

This project exists to help me transition podcast listening from [PodcastAddict](https://podcastaddict.com/) to a [Tangara](https://www.crowdsupply.com/cool-tech-zone/tangara).

podcast-playlist currently supports fetching feeds, downloading episodes, building playlists, tracking listen history and syncing with Tangara.

## Install

This assumes you have node/npm and ffmpeg installed.

1. Clone the repo
2. npm i
3. npm run build
4. node .\dist\index.js

## Usage

Invoke podcast-playlist with `node .\dist\index.js`. The documentation below just shows the subsequent commands (i.e. `feed list` means `node .\dist\index.js feed list`).

To get stuck in you can use `--help` for any (sub)command to get help.

### Quick Reference

```bash
# Import a new rss feed
node dist/index.js feed ingest --rss "https://example.com/some-feed.rss"
# Generate a playlist
node dist/index.js playlist create --title "test" --configPath ./test.json
# Sync a new playlist, keeping the existing playlists on the device
node ./dist/index.js sync --title "NewPlaylist" --configPath "./default.json" --tangaraPath "/media/sam/TG_DATA" --keepExisting
```

### Data

Data is by default stored in `./data`. To change this set the environment variable `PODCASTPLAYLISTDIR`.

All the data is plain JSON files in a (hopefully!) sensible folder structure, with audio files in `cache/podcastname` directories.

### Ingestion

#### Subscriptions

Unless you're starting completely from scratch, you probably have some existing subscriptions to import. OPML files are supported for this, or you can just use RSS fees URLs:

For ingestion, create a configuration file listing any OPML files or RSS feeds you want to add:

Configuration file:

```JSON
{
    "opml": [
        "A:/Path/To/File.opml"
    ],
    "rss": [
        "https://example.com/rss"
    ]
}
```

Then

`feed ingest --path "./config.json"`

Or, for individual RSS feeds:

`feed ingest --rss <rssUrl>`

#### History

Items in the history are skipped when creating playlists.

If you have a previous listen history from [Podcast Addict](https://podcastaddict.com/), you can import the sqlite database (App settings > Backup / Restore) to add your listen history:

`history import --podcastAddict "<path/to/export.db>"`

Otherwise, you can add entire feeds to the history with `history feed --name "feedname"` or mark all episodes in a playlist as played - `history import --playlist "path/to/playlist.m3u"`

### Feed updates and the cache

You can refresh feeds using `cache refresh`. This will re-download all the RSS feeds.

To have episodes added to the cache, run `cache update`. Note that this will download **all** uncached episodes. To avoid this you can run `update cache skip` to mark episodes you don't want downloaded:

```Powershell
# Don't cache any episodes that are in the history
node .\dist\index.js cache skip --history
# Don't cache any episodes in the feed "EXAMPLE"
node .\dist\index.js cache skip --feed "EXAMPLE"
# Don't cache any episodes present in the feeds currently
node .\dist\index.js cache skip --all
```

You can also manually curate a history JSON and replace the one in the root data directory if you need more control:

```JSON
{
    "_items": [
        {
            "_episodeName": "Episode title as it appears in the feed",
            "_episodeURL": "https://example.com/this/can/also/be/null.rss",
            "_listenDate": "2016-03-22T08:51:47.453Z",
            "_podcastName": "Name of the podcast as it appears in the feed",
            "_podcastId": null
        }
    ],
    ...
}
```

#### Audio

Existing files can be imported provided there is enough metadata to match the file to an item in a feed.

`cache import --path /home/user/Music/Podcasts/ --recursive --ignoreArtist`

Removing `--ignoreArtist` will be quicker, but will mean that podcasts that have changed names, or files that don't have a valid tag (e.g. `artist`), will not find a match.

### Playlist creation

To create a playlist, create a configuration file like below. Feeds are included in the playlist by having an entry in the include list. By default all episodes are valid choices for the playlist, but items can be removed from selection by using `exclude` regexes or skipping certain types of episode (if supported by the feed) using `skipTypes`. Items matching any filter in the explicit `include` list are always included even if an exclude would otherwise exclude it.

You can test regexes against a feed using `feed filter --name "Podcast Name" --regex ".*example" --lowerCase`

Example configuration file:

```JSON
{
    "playlist": {
        "include": [
            {
                "name": "Hello From The Magic Tavern",
                "exclude": [
                    "^Introducing"
                ],
                "ordered": true
            },
            {
                "name": "Pitch, Please",
                "include": [
                    "featuring"
                ],
                "ordered": false
            },
            {
                "name": "Regulation Podcast",
                "ordered": false,
                "skipTypes": ["bonus"]
            },
            {
                "name": "Off Book: The Improvised Musical",
                "exclude": [
                    ".*"
                ],
                "include": [
                    " on book:"
                ],
                "ordered": true
            }
        ],
        "count": 4
    }
}
```

Then invoke the creation:

`playlist create --title playlist_name --configPath .\playlist_config.json --local`

If you don't want the files downloaded, and just want the playlist to point to the URL of the episodes, drop the `--local`.

### Syncronising

Rather than a multi-step process of:

1. Generate playlist
2. Copy files to device
3. Listen
4. Mark the playlist as played
5. Delete old playlist file

You can instead run:

`sync --title "NewPlaylist" --configPath "./APlaylistConfiguration.json" --tangaraPath "/media/sam/TG_DATA"`

This will import any existing playlist on-device to the history, generate a new playlist with the provided name and configuration and then copy the playlist and media to the device. You can additionally set `--keepExisting` to leave the on-device playlists as-is.
