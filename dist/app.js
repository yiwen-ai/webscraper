import { gzipSync } from 'node:zlib';
import Router from '@koa/router';
import { encode } from 'cbor-x';
import { LogLevel, createLog, writeLog } from './log.js';
import { connect } from './db/scylladb.js';
import { versionAPI, healthzAPI, scrapingAPI, documentAPI } from './api.js';
const GZIP_MIN_LENGTH = 128;
export async function initApp(app) {
    // attach stateful components to the application context
    app.context.db = await connect('ywws');
    // create routes
    const router = new Router();
    router.use(initContext);
    router.get('/', versionAPI);
    router.get('/healthz', healthzAPI);
    router.get('/scraping', scrapingAPI);
    router.get('/document', documentAPI);
    app.use(router.routes());
    app.use(router.allowedMethods());
}
async function initContext(ctx, next) {
    const start = Date.now();
    const acceptCBOR = ctx.get('accept').toLowerCase().includes('cbor') || ctx.get('content-type').toLowerCase().includes('cbor');
    // initialize the log object
    const log = createLog(start);
    log.accept = ctx.get('accept');
    log.method = ctx.method;
    log.requestUri = ctx.originalUrl;
    log.remoteAddr = ctx.ip;
    log.xRequestID = ctx.get('x-request-id');
    ctx.state.log = log;
    try {
        await next();
    }
    catch (err) {
        // log the error if it's not a client error
        if (err.expose !== true || err.status == null || err.status >= 500) {
            const errLog = createLog(start, LogLevel.Error);
            errLog.xRequestID = log.xRequestID;
            errLog.msg = err.message;
            errLog.status = err.status;
            errLog.stack = err.stack;
            if (err.headers != null) {
                errLog.headers = err.headers;
            }
            if (err.data != null) {
                errLog.data = err.data;
            }
            writeLog(errLog);
        }
        log.msg = err.message;
        ctx.status = err.status == null ? 500 : err.status;
        ctx.body = {
            error: {
                code: err.code,
                message: err.message,
                data: err.data
            }
        };
    }
    finally {
        // log when the response is finished or closed, whichever happens first.
        const { res } = ctx;
        const onfinish = done.bind(null, 'finish');
        const onclose = done.bind(null, 'close');
        res.once('finish', onfinish);
        res.once('close', onclose);
        function done(_event) {
            res.removeListener('finish', onfinish);
            res.removeListener('close', onclose);
            log.length = ctx.length;
            log.status = ctx.status;
            log.elapsed = Date.now() - start;
            writeLog(log);
        }
    }
    // encode the response body
    let body = ctx.body;
    if (body != null && typeof body === 'object') {
        if (acceptCBOR) {
            body = encode(body);
            // console.log(body.toString('hex'))
            ctx.set('content-length', body.length);
            ctx.set('content-type', 'application/cbor');
        }
        else {
            body = Buffer.from(JSON.stringify(body), 'utf8');
            ctx.set('content-length', body.length);
            ctx.set('content-type', 'application/json');
        }
        if (body.length > GZIP_MIN_LENGTH && ctx.acceptsEncodings('gzip') === 'gzip') {
            log.beforeGzip = body.length;
            body = gzipSync(body);
            ctx.remove('Content-Length');
            ctx.set('content-encoding', 'gzip');
        }
        ctx.body = body;
    }
}
