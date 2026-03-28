# Takes an existing playlist, a name for a new one and a path to a config file
# Imports the history of the existing playlist and creates a new one

# Usage: ./new-playlist.sh <existing-playlist-name> <new-playlist-name> <config-file-path>

# Check if the correct number of arguments is provided
if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <existing-playlist-name> <new-playlist-name> <config-file-path>"

    # And print current playlists in the ../data/playlists directory
    echo "Current playlists:"
    pwd | echo
    for dir in ./data/playlists/*/; do
        echo " - $(basename "$dir")"
    done

    exit 1
fi

# Exit early if any command fails
set -e

EXISTING_PLAYLIST_NAME="$1"
NEW_PLAYLIST_NAME="$2"
CONFIG_FILE_PATH="$3"

echo "Creating new playlist '$NEW_PLAYLIST_NAME' based on '$EXISTING_PLAYLIST_NAME' with config from '$CONFIG_FILE_PATH'"

# Import the history of the existing playlist
node ./dist/index.js history import --playlist ./data/playlists/$EXISTING_PLAYLIST_NAME/Playlists/$EXISTING_PLAYLIST_NAME.m3u

# Create new playlist
node dist/index.js playlist create --title "$NEW_PLAYLIST_NAME" --configPath "$CONFIG_FILE_PATH" --verbose

# Optionally offer to copy the new playlist
read -p "Do you want to copy the new playlist to the music box? (y/n) " -n 1 -r
echo    # move to a new line
if [[ $REPLY =~ ^[Yy]$ ]]; then
    node dist/index.js playlist copy --title "$NEW_PLAYLIST_NAME" --tangaraPath "/media/sam/MUSICBOX"
fi
