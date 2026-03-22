# Takes an existing podcast, a name for a new one and a path to a config file
# Imports the hitsory of the existing podcast and creates a new one

# Usage: ./new-podcast.sh <existing-podcast-name> <new-podcast-name> <config-file-path>

# Check if the correct number of arguments is provided
if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <existing-podcast-name> <new-podcast-name> <config-file-path>"
    exit 1
fi

# Exit early if any command fails
set -e

EXISTING_PODCAST_NAME="$1"
NEW_PODCAST_NAME="$2"
CONFIG_FILE_PATH="$3"

echo "Creating new podcast '$NEW_PODCAST_NAME' based on '$EXISTING_PODCAST_NAME' with config from '$CONFIG_FILE_PATH'"

# Import the history of the existing podcast
node ./dist/index.js history import --playlist ./data/playlists/$EXISTING_PODCAST_NAME/Playlists/$EXISTING_PODCAST_NAME.m3u

# Create new
node dist/index.js playlist create --title "$NEW_PODCAST_NAME" --configPath "$CONFIG_FILE_PATH" --verbose

# Optionally offer to copy the new podcast
read -p "Do you want to copy the new podcast to the music box? (y/n) " -n 1 -r
echo    # move to a new line
if [[ $REPLY =~ ^[Yy]$ ]]; then
    node dist/index.js playlist copy --title "$NEW_PODCAST_NAME" --tangaraPath "/media/sam/MUSICBOX"
fi
