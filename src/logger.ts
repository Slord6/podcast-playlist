export type Verbosity = "VeryVerbose" | "Verbose" | "Info";

type LogFunc = (message: string, verbosity?: Verbosity) => void;

export class Logger {
    private static _verbosity: Verbosity = "Info";

    private static ShouldLog(verbosity: Verbosity): boolean {
        if(this._verbosity === "VeryVerbose") return true;
        if(this._verbosity === "Verbose" && (verbosity === "Verbose" || verbosity === "Info")) return true;
        if(this._verbosity === "Info" && verbosity === "Info") return true;
        
        // Unreachable
        return true;
    }

    public static SetVerbosity(verbosity: Verbosity) {
        this._verbosity = verbosity;
    }

    public static Log(message: string, verbosity: Verbosity = "Info") {
        if(!Logger.ShouldLog(verbosity)) return;
        console.log(message);
    }

    public static GetNamedLogger(name: string): LogFunc {
        name = name.toUpperCase();
        return (message: string, verbosity: Verbosity = "Info") => {
            Logger.Log(`(${name}) ${message}`, verbosity);
        };
    }

}