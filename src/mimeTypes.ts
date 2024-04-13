export class MimeTypes {
    private static _audioTypes: {[id: string]: string} = {
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
        if(mime === null) return defaultType;
        
        const mimeParts = mime.split("/");
        const mimeType = mimeParts[0];
        if(mimeType != "audio") {
            return defaultType;
        }
        return this._audioTypes[mimeParts[1]] || defaultType;
    }

    public static isExtension(ext: string): boolean {
        return Object.keys(MimeTypes._audioTypes).includes(ext);
    }
}