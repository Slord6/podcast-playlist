import {ServerHttp} from './server/serverHTTP';

const server = new ServerHttp(19001);

server.start();