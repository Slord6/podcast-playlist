import * as http from 'http';
import express from 'express';

export type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

export class ServerHttp {
    private port: number;
    private address: string;
    private app: express.Express;

    constructor(port: number, address: string = "0.0.0.0") {
        this.port = port;
        this.address = address;

        this.app = express();

        this.app.use(express.static('./root'));
    }

    private static Log(...data: any[]) {
        console.log("SERVER:", ...data);
    }

    public addHandlerGet(route: string | RegExp, handler: Handler) {
        ServerHttp.Log(`New GET handler ${route}`);
        this.app.get(route, handler);
        return this;
    }

    public addHandlerPost(route: string | RegExp, handler: Handler) {
        ServerHttp.Log(`New POST handler ${route}`);
        this.app.post(route, handler);
        return this;
    }

    public addHandlerPut(route: string | RegExp, handler: Handler) {
        ServerHttp.Log(`New PUT handler ${route}`);
        this.app.put(route, handler);
        return this;
    }

    public addHandlerDelete(route: string | RegExp, handler: Handler) {
        ServerHttp.Log(`New DELETE handler ${route}`);
        this.app.delete(route, handler);
        return this;
    }

    public start(): void {
        this.app.listen(this.port, this.address, () => {
            ServerHttp.Log(`Listening on port ${this.port}`)
        });
    }
}