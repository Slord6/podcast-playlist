# podcast-playlist
 Create playlists of podcast episodes


## Ingest feeds

`ingest --path "./config.json"`

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

## Playlist creation

`playlist create --title test_playlist --configPath .\playlist_config.json --local`

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