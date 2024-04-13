

export class BufferedRequests {
    private static lastRequests: {
        [host: string]: {
            queue: (() => void)[];
        }
    } = {}
    public static waitTimeSeconds: number = 5;

    private static delay<T>(waitMs: number, result: T): Promise<T> {
        return new Promise((resolve) => {
            setTimeout(resolve.bind(this, result), waitMs);
        });
    }

    public static fetch(url: URL): Promise<Response> {
        const fetchPromise = new Promise<Response>((resolve) => {
            if (BufferedRequests.lastRequests[url.host]) {
                console.log(`(BUFREQ) Appending ${url.toString()}`);
                BufferedRequests.lastRequests[url.host].queue.push(() => {
                    return resolve(fetch(url));
                });
            } else {
                console.log(`(BUFREQ) New host: ${url.host}`);
                BufferedRequests.lastRequests[url.host] = {
                    queue: [() => resolve(fetch(url))]
                }
                const interval = setInterval(() => {
                    const queue = BufferedRequests.lastRequests[url.host].queue;
                    if (queue.length === 0) {
                        console.log(`(BUFREQ) ${url.toString()} CLOSING`);
                        clearInterval(interval);
                        delete BufferedRequests.lastRequests[url.host];
                    } else {
                        console.log(`(BUFREQ) ${url.toString()} RESOLVING`);
                        (BufferedRequests.lastRequests[url.host].queue.pop() as () => void)();
                    }
                }, BufferedRequests.waitTimeSeconds * 1000);
            }
        });
        return fetchPromise;
    }
}