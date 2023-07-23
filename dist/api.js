import { format } from 'node:util';
import { URL } from 'node:url';
import { Xid } from 'xid-ts';
import { LogLevel, createLog, logError, writeLog } from './log.js';
import { scraping } from './crawler.js';
import { parseHTMLDocument } from './tiptap.js';
import { DocumentModel } from './db/model.js';
const serverStartAt = Date.now();
export function versionAPI(ctx) {
    ctx.body = {
        result: {
            name: 'webscraper'
        }
    };
}
export function healthzAPI(ctx) {
    const db = ctx.app.context.db;
    const s = db.getState();
    ctx.body = {
        result: {
            start: serverStartAt,
            scylla: s.toString(),
        }
    };
}
export async function searchAPI(ctx) {
    const db = ctx.app.context.db;
    const { url } = ctx.request.query;
    if (!isValidUrl(url)) {
        ctx.throw(400, format('Invalid scraping URL: %s', url));
    }
    const doc = await DocumentModel.findLatest(db, url);
    if (doc.row.title != null && doc.row.title != "") {
        try {
            await doc.fill(db, ['src', 'meta', 'content']);
        }
        catch (_) { }
    }
    ctx.body = {
        result: doc.row
    };
}
export async function scrapingAPI(ctx) {
    const db = ctx.app.context.db;
    const { url } = ctx.request.query;
    if (!isValidUrl(url)) {
        ctx.throw(400, format('Invalid scraping URL: %s', url));
    }
    const doc = await DocumentModel.findLatest(db, url);
    if (doc.isFresh) {
        // a fresh document is a document that has been scraped within the last 3600 seconds
        ctx.body = {
            retry: 0,
            result: doc.toJSON()
        };
        return;
    }
    const acquired = await doc.acquire(db);
    if (!acquired) {
        // fail to get the document scraping lock, it's being scraped by another process
        ctx.body = {
            retry: 1,
            result: {
                id: doc.row.id,
                url: doc.row.url
            }
        };
        return;
    }
    const { result } = await scraping(url);
    const log = createLog(ctx.state.log.start, LogLevel.Info);
    log.action = 'scraping';
    log.xRequestID = ctx.state.log.xRequestID;
    result.then(async (d) => {
        const res = parseHTMLDocument(d.html);
        doc.setTitle(d.title);
        doc.setMeta(d.meta);
        doc.setPage(d.page);
        doc.setContent(res.json);
        doc.setHTML(res.html);
        await doc.save(db);
        log.url = d.url;
        log.title = d.title;
        log.meta = d.meta;
        log.pageLength = d.page.length;
        log.htmlLength = res.html.length;
        log.cborLength = doc.row.content?.length;
        log.elapsed = Date.now() - log.start;
        writeLog(log);
    }).catch(async (err) => {
        // remove the partially saved document if scraping failed
        // so other requests can retry scraping
        await doc.release(db);
        logError(err);
    });
    ctx.body = {
        retry: 2,
        result: {
            id: doc.row.id,
            url: doc.row.url
        }
    };
}
export async function documentAPI(ctx) {
    const { db } = ctx.app.context;
    const { id, output } = ctx.request.query;
    let xid = null;
    try {
        xid = Xid.fromValue(id);
    }
    catch {
        ctx.throw(404, format('invalid document id %s', id));
    }
    const doc = new DocumentModel(xid);
    let selectColumns = ['url', 'src', 'title', 'meta', 'content'];
    if (output === 'basic') { // 'basic', 'detail', 'full'
        selectColumns = ['url', 'src', 'title', 'meta'];
    }
    else if (output === 'full') {
        selectColumns = ['url', 'src', 'title', 'meta', 'content', 'html', 'page'];
    }
    await doc.fill(db, selectColumns);
    ctx.body = {
        result: doc.row
    };
}
function isValidUrl(url) {
    if (typeof url === 'string' && url.startsWith('https://')) {
        try {
            const v = new URL(url);
            return v != null;
        }
        catch (e) { }
    }
    return false;
}
