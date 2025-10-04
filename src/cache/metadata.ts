import { Downloader } from "../downloader";
import * as fs from "fs";
import { loadMusicMetadata } from 'music-metadata';
import fluentFfmpeg from 'fluent-ffmpeg';
import { Logger } from "../logger";

export class Metadata {
    private static _logger = Logger.GetNamedLogger("METADATA");

    /**
     * Apply title/artist metadata from the download's feed item source values
     * @param downloader 
     */
    public static async applyMetadata(downloader: Downloader): Promise<void> {
        const source = downloader.source;
        const path = await downloader.getPath();

        Metadata._logger(`Applying metadata tags to ${source.title} (${source.author})`, "Verbose");

        let tags: { key: string, value: string }[] = [
            { key: "title", value: source.title },
            { key: "album", value: source.author },
            { key: "artist", value: source.author }
        ];

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
                    Metadata._logger(`Setting metadata failed for "${source.title}" (${source.author})!`);
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