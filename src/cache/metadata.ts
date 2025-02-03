import { Downloader } from "../downloader";
import * as fs from "fs";
import { loadMusicMetadata } from 'music-metadata';
import fluentFfmpeg from 'fluent-ffmpeg';
import { Logger } from "../logger";

export class Metadata {
    private static _logger = Logger.GetNamedLogger("METADATA");

    /**
     * Apply unset title/artist metadata if required
     * @param downloader 
     */
    public static async applyMetadata(downloader: Downloader): Promise<void> {
        const source = downloader.source;
        const { parseStream } = await loadMusicMetadata();
        const path = await downloader.getPath();

        Metadata._logger(`Applying metadata tags to ${source.title} (${source.author})`, "Verbose");

        Metadata._logger(`Loading metadata from ${path}`, "VeryVerbose");
        const audioStream = fs.createReadStream(path);

        const common = (await parseStream(audioStream).catch(() => {
            Metadata._logger(`Failed to read ${path}`);
            return null;
        }))?.common;

        if (common == null || common === undefined) {
            Metadata._logger(`Could not load metadata for file: skipping metadata check`);
            return;
        } else {
            const title = common.title;
            const album = common.album;
            Metadata._logger(`Loaded metadata (${title}, ${album})`, "VeryVerbose");

            let tags: { key: string, value: string }[] = [];
            if (title === undefined) {
                tags.push({ key: "title", value: source.title });
            }
            if (album === undefined) {
                tags.push({ key: "album", value: source.author });
                if(common.artist === undefined) {
                    tags.push({ key: "artist", value: source.author });
                }
            }

            if (tags.length == 0) {
                Metadata._logger(`No tags set for ${title} (${album}) - they were already present`, "Verbose");
                return;
            }

            Metadata._logger(`Constructing FFMPEG command`, "VeryVerbose");

            const command = fluentFfmpeg(path);
            command.outputOptions('-codec', `copy`);
            tags.forEach(tag => {
                command.outputOptions('-metadata', `${tag.key}=${tag.value}`);
            });

            Metadata._logger(`Setting tags (${tags.map(t => t.value).join(",")})`, "Verbose");
            const ext = await downloader.getExtension();
            const tempPath = `${path}.temp.${ext}`;
            Metadata._logger(`Saving modified file to ${tempPath}`, "VeryVerbose");

            return new Promise((resolve, reject) => {
                command.on('start', (cmdline) => Metadata._logger(cmdline, "VeryVerbose"))
                    .on('error', (err: Error, stdout: string | null, stderr: string | null) => {
                        Metadata._logger("Setting metadata failed!");
                        Metadata._logger(err.message, "Verbose");
                        Metadata._logger(stdout ?? "<No stdout>", "VeryVerbose");
                        Metadata._logger(stderr ?? "<No stderr>", "VeryVerbose");
                        reject();
                    })
                    .on('progress', (progress) => {
                        Metadata._logger('Processing: ' + progress.targetSize + ' KB', "VeryVerbose");
                    })
                    .on('end', () => {
                        Metadata._logger(`Overwriting original file ${path}`, "VeryVerbose");
                        fs.rmSync(path);
                        fs.renameSync(tempPath, path);
                        resolve();
                    })
                    .saveToFile(tempPath);
            });

        }
    }
}