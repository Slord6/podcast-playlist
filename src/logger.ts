export type Verbosity = "VeryVerbose" | "Verbose" | "Info";

type LogFunc = (message: string, verbosity?: Verbosity) => void;
type LogSink = (message: string) => void;

export class Logger {
    private static _verbosity: Verbosity = "Info";
    private static _messageBuffer: string[] = [];
    private static _sink: LogSink = console.log;

    private static ShouldLog(verbosity: Verbosity): boolean {
        if(this._verbosity === "VeryVerbose") return true;
        if(this._verbosity === "Verbose" && (verbosity === "Verbose" || verbosity === "Info")) return true;
        if(this._verbosity === "Info" && verbosity === "Info") return true;
        
        return false;
    }

    public static SetVerbosity(verbosity: Verbosity) {
        this._verbosity = verbosity;
    }

    public static Log(message: string, verbosity: Verbosity = "Info") {
        if(!Logger.ShouldLog(verbosity)) return;
        Logger._sink(message);
    }

    /**
     * A log sink - rather than printing, store in message buffer
     * @param message 
     */
    private static BufferLogs(message: string) {
        this._messageBuffer.push(message);
    }

    /**
     * Take control of output, blocking all other named loggers from the terminal
     * Other output is buffered whilst context is claimed
     * @returns Wrapped stdout write function
     */
    public static ClaimContext(): LogFunc {
        Logger._sink = Logger.BufferLogs;
        return (msg: string) => process.stdout.write(msg);
    }

    /**
     * Relinquish control, returning it back to this Logger
     * This will flush any buffered messages to the terminal
     */
    public static ReleaseContext(): void {
        Logger._sink = console.log;
        Logger._sink("");

        this._messageBuffer.forEach(Logger._sink);
        this._messageBuffer = [];
    }

    public static GetNamedLogger(name: string): LogFunc {
        name = name.toUpperCase();
        return (message: string, verbosity: Verbosity = "Info") => {
            Logger.Log(`(${name}) ${message}`, verbosity);
        };
    }

}