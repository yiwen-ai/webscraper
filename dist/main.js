import http from 'http';
import Koa from 'koa';
import config from 'config';
import { LogLevel, createLog, writeLog } from './log.js';
import { initApp } from './app.js';
const app = new Koa({
    proxy: true,
    maxIpsCount: 3,
});
await initApp(app);
const controller = new AbortController();
const server = http.createServer(app.callback());
server.listen({
    port: config.get('port'),
    signal: controller.signal,
});
const gracefulSecs = config.get('gracefulShutdown');
async function gracefulShutdown(ev) {
    if (!controller.signal.aborted) {
        controller.abort(ev);
        const secs = gracefulSecs > 0 && gracefulSecs < 120 ? gracefulSecs : 5;
        await Promise.any([
            new Promise((resolve) => server.close(resolve)),
            new Promise((resolve) => setTimeout(resolve, secs * 1000)),
        ]);
        process.exit(0);
    }
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
writeLog(createLog(Date.now(), LogLevel.Info, `app start on port ${config.get('port')}`));
