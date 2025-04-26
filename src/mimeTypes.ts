import { Logger } from "./logger";

export class MimeTypes {
    private static _logger = Logger.GetNamedLogger("MIMETYPES");

    private static _audioTypes: { [id: string]: string } = {
        "aac": "aac",
        "midi": "midi",
        "mpeg": "mp3",
        "ogg": "oga",
        "opus": "opus",
        "wav": "wav",
        "webm": "weba",
        "3gpp": "3gp",
        "3gpp2": "3g2"
    }

    public static getAudioExtension(mime: string | null): string {
        const defaultType = "bin";
        if (mime === null) return defaultType;

        const mimeParts = mime.split("/");
        const mimeType = mimeParts[0];
        if (mimeType != "audio") {
            this._logger(`Could not get audio extension from type '${mime}' (${mimeType} is not an audio type)`);
            return defaultType;
        }

        if (!this._audioTypes[mimeParts[1]]) this._logger(`Could not get audio extension from type '${mime}' (not implemented)`);
        return this._audioTypes[mimeParts[1]] || defaultType;
    }

    public static isExtension(ext: string): boolean {
        const r = Object.values(MimeTypes._audioTypes).includes(ext);
        this._logger(`${ext} is a valid extension: ${r}`);
        return r;
    }
}