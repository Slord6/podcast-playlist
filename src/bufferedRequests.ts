import { Logger } from "./logger";


export class BufferedRequests {
    private static lastRequests: {
        [host: string]: {
            queue: (() => void)[];
        }
    } = {}
    public static waitTimeSeconds: number = 5;
    private static _logger = Logger.GetNamedLogger("BUFREQ");

    private static delay<T>(waitMs: number, result: T): Promise<T> {
        return new Promise((resolve) => {
            setTimeout(resolve.bind(this, result), waitMs);
        });
    }

    public static fetch(url: URL): Promise<Response> {
        const fetchPromise = new Promise<Response>((resolve) => {
            if (BufferedRequests.lastRequests[url.host]) {
                BufferedRequests._logger(`Appending ${url.toString()}`, "VeryVerbose");
                BufferedRequests.lastRequests[url.host].queue.push(() => {
                    return resolve(fetch(url));
                });
            } else {
                BufferedRequests._logger(`New host: ${url.host}`);
                BufferedRequests.lastRequests[url.host] = {
                    queue: [() => resolve(fetch(url))]
                }
                const interval = setInterval(() => {
                    const queue = BufferedRequests.lastRequests[url.host].queue;
                    if (queue.length === 0) {
                        BufferedRequests._logger(`${url.toString()} CLOSING`, "VeryVerbose");
                        clearInterval(interval);
                        delete BufferedRequests.lastRequests[url.host];
                    } else {
                        BufferedRequests._logger(`${url.toString()} RESOLVING`, "VeryVerbose");
                        (BufferedRequests.lastRequests[url.host].queue.pop() as () => void)();
                    }
                }, BufferedRequests.waitTimeSeconds * 1000);
            }
        });
        return fetchPromise;
    }
}