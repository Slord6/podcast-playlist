

export class BufferedRequests {
    private static lastRequests: { [host: string]: {
        queue: (() => void)[];
    } } = {}
    public static waitTimeSeconds: number = 5;

    private static delay<T>(waitMs: number, result: T): Promise<T> {
        return new Promise((resolve) => {
            setTimeout(resolve.bind(this, result), waitMs);
        });
    }

    public static fetch(url: URL): Promise<Response> {
        // function that will intiate the fetch of the URL
        let resolveFetch: () => void;
        // Promise to return to the caller, that we'll resolve later
        // using the above func
        const fetchPromise = new Promise<Response>((resolve) => {
            resolveFetch = () => resolve(fetch(url));
        });
        if(BufferedRequests.lastRequests[url.host]) {
            console.log(`(BUFREQ) Appending ${url.toString()}`);
            BufferedRequests.lastRequests[url.host].queue.push(() => resolveFetch());
        } else {
            console.log(`(BUFREQ) New host: ${url.toString()}`);
            BufferedRequests.lastRequests[url.host] = {
                queue: [() => resolveFetch()]
            }
            const interval = setInterval(() => {
                const queue = BufferedRequests.lastRequests[url.host].queue;
                if(queue.length === 0) {
                    console.log(`(BUFREQ) ${url.toString()} CLOSING`);
                    clearInterval(interval);
                    delete BufferedRequests.lastRequests[url.host];
                } else {
                    console.log(`(BUFREQ) ${url.toString()} RESOLVING`);
                    (BufferedRequests.lastRequests[url.host].queue.pop() as () => void)();
                }
            }, BufferedRequests.waitTimeSeconds * 1000);
        }
        return fetchPromise;
    }
}