# podcast-playlist

This project exists to help me transition podcast listening from [PodcastAddict](https://podcastaddict.com/) to a [Tangara](https://www.crowdsupply.com/cool-tech-zone/tangara). Ultimately it will tie into whatever process the [companion app](https://github.com/haileys/tangara-companion) uses to transfer media and playlists to the device and scrobbling back off.

podcast-playlist currently supports fetching feeds, downloading episodes, building playlists and tracking listen history. It's probably 'good enough' to use, but I've not fully used it in anger yet, so there's likely quirks and bugs yet to be discovered!

## Install

This assumes you have node/npm installed.

1. Clone the repo
2. npm i
3. npm run build
4. node .\dist\index.js

## Usage

Invoke podcast-playlist with `node .\dist\index.js`. The documentation below just shows the subsequent commands (i.e. `feed list` means `node .\dist\index.js feed list`).

To get stuck in you can use `--help` for any (sub)command to get help.

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

`ingest --path "./config.json"`

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

Importing existing audio files is being tracked in issue [#15](https://github.com/Slord6/podcast-playlist/issues/15).

### Playlist creation

To create a playlist, create a configuration file like below:

Configuration file:

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
                "ordered": false
            }
        ],
        "episodeTitleFilters": [
            "^BONUS.*"
        ],
        "count": 4
    }
}
```

Then invoke the creation:

`playlist create --title playlist_name --configPath .\playlist_config.json --local`

If you don't want the files downloaded, and just want the playlist to point to the URL of the episodes, drop the `--local`.