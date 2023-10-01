import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import config from 'config';
import { decode, encode } from 'cborg';
import { Xid } from 'xid-ts';
import * as cheerio from 'cheerio';
import createError from 'http-errors';
import { toHTML } from './tiptap.js';
import { lang639_3, isRTL } from './lang.js';
const indexTpl = readFileSync('./html/index.html', 'utf-8');
const publicationTpl = readFileSync('./html/publication.html', 'utf-8');
const groupTpl = readFileSync('./html/group.html', 'utf-8');
const siteBase = config.get('siteBase');
const writingBase = config.get('writingBase');
const userBase = config.get('userBase');
const metaInfos = {
    zho: {
        title: '亿文 — 跨语言的知识网络',
        desc: '亿文是一个多语言知识发布平台，借助 ChatGPT，您可以轻松将精彩文章、文档一键翻译多种语言并分享给全世界读者，让知识没有语言界限。',
    },
};
export async function renderIndex(ctx) {
    const headers = ctxHeaders(ctx);
    const $ = cheerio.load(indexTpl);
    const info = metaInfos[headers['x-language'] ?? ''];
    if (info) {
        $('title').text(info.title);
        $('meta[name="description"]').prop('content', info.desc);
    }
    try {
        const docs = await listIndex(headers);
        renderUL($, docs, headers['x-language'] ?? '');
    }
    catch (err) {
        ctx.status = 404;
        const url = ctx.get('x-request-url');
        if (url !== '') {
            $('#content').text(url + ' not found');
        }
    }
    ctx.vary('Accept-Language');
    ctx.type = 'text/html';
    ctx.body = $.html();
}
export async function renderPublication(ctx) {
    const headers = ctxHeaders(ctx);
    const cid = ctx.params.id;
    const { gid, language } = ctx.query;
    const $ = cheerio.load(publicationTpl);
    const info = metaInfos[headers['x-language'] ?? ''];
    if (info) {
        $('title').text(info.title);
        $('meta[name="description"]').prop('content', info.desc);
    }
    try {
        const docs = await listPublished(headers, Xid.fromValue(cid));
        renderUL($, docs, '');
        const doc = await getPublication(headers, cid, (gid ?? ''), (language ?? ''));
        const docUrl = `${siteBase}/pub/${Xid.fromValue(doc.cid).toString()}`;
        const groupUrl = `${siteBase}/group/${Xid.fromValue(doc.gid).toString()}`;
        $('html').prop('lang', doc.language);
        if (isRTL(doc.language)) {
            $('html').prop('dir', 'rtl');
        }
        $('meta[property="og:title"]').prop('content', doc.title);
        $('meta[property="og:url"]').prop('content', docUrl);
        $('#title').text(doc.title);
        const authors = $('#authors');
        authors.prop('href', groupUrl);
        authors.text(groupUrl);
        if (doc.authors != null && doc.authors.length > 0) {
            authors.text(doc.authors.join(', '));
        }
        const updated_at = new Date(doc.updated_at).toUTCString();
        $('#updated_time').text(updated_at);
        $('#version').text(doc.version.toString());
        const content = decode(doc.content);
        $('#content').html(toHTML(content) +
            `\n<p><a title="Permanently Link" href="${docUrl}" target="_blank">${docUrl}</a></p>`);
        ctx.set('last-modified', updated_at);
    }
    catch (err) {
        ctx.status = 404;
        const url = ctx.get('x-request-url');
        if (url !== '') {
            $('#content').text(url + ' not found');
        }
    }
    ctx.vary('Accept-Language');
    ctx.type = 'text/html';
    ctx.body = $.html();
}
export async function renderGroup(ctx) {
    const headers = ctxHeaders(ctx);
    const gid = ctx.params.id;
    const $ = cheerio.load(groupTpl);
    const info = metaInfos[headers['x-language'] ?? ''];
    if (info) {
        $('title').text(info.title);
        $('meta[name="description"]').prop('content', info.desc);
    }
    try {
        const group = await getGroup(headers, gid);
        const groupUrl = `${siteBase}/group/${Xid.fromValue(group.id).toString()}`;
        $('meta[property="og:title"]').prop('content', group.name);
        $('meta[property="og:description"]').prop('content', group.slogan);
        $('meta[property="og:url"]').prop('content', groupUrl);
        $('#group_name').text(group.name);
        $('#group_slogan').text(group.slogan);
        const docs = await listPublications(headers, Xid.fromValue(group.id));
        renderUL($, docs, headers['x-language'] ?? '');
    }
    catch (err) {
        ctx.status = 404;
        const url = ctx.get('x-request-url');
        if (url !== '') {
            $('#content').text(url + ' not found');
        }
    }
    ctx.vary('Accept-Language');
    ctx.type = 'text/html';
    ctx.body = $.html();
}
function renderUL($, docs, perferLang) {
    const docSet = new Set();
    const ul = $('#publications');
    for (const doc of docs) {
        const cid = Xid.fromValue(doc.cid).toString();
        const gid = Xid.fromValue(doc.gid).toString();
        const docUrl = `${siteBase}/pub/${cid}?gid=${gid}`;
        const idKey = perferLang ? cid : `${cid}-${doc.language}`;
        if (docSet.has(idKey)) {
            const el = $(`#${idKey}`);
            if (perferLang &&
                (doc.language === perferLang ||
                    (doc.language === doc.from_language &&
                        el.prop('lang') !== perferLang))) {
                el.text(doc.title);
                el.prop('lang', doc.language);
                el.prop('href', docUrl);
            }
            continue;
        }
        docSet.add(idKey);
        ul.append(`<li><a lang="${doc.language}" id="${idKey}" href="${docUrl}"></a></li>`);
        $(`#${idKey}`).text(doc.title);
    }
}
async function getGroup(headers, gid) {
    const api = new URL('/v1/group', userBase);
    if (isXid(gid)) {
        api.searchParams.append('id', gid);
    }
    else {
        api.searchParams.append('cn', gid);
    }
    api.searchParams.append('fields', 'cn,name,status,slogan');
    headers.accept = 'application/cbor';
    const res = await fetch(api, {
        headers,
    });
    if (res.status !== 200) {
        throw createError(res.status, await res.text());
    }
    const data = await res.arrayBuffer();
    const obj = decode(Buffer.from(data));
    return obj.result;
}
async function getPublication(headers, cid, gid, language) {
    const api = new URL('/v1/publication/implicit_get', writingBase);
    api.searchParams.append('cid', cid);
    if (gid !== '') {
        api.searchParams.append('gid', gid);
    }
    if (language !== '') {
        api.searchParams.append('language', language);
    }
    api.searchParams.append('fields', 'title,updated_at,from_language,authors,content');
    headers.accept = 'application/cbor';
    const res = await fetch(api, {
        headers,
    });
    if (res.status !== 200) {
        throw createError(res.status, await res.text());
    }
    const data = await res.arrayBuffer();
    const obj = decode(Buffer.from(data));
    return obj.result;
}
async function listPublications(headers, gid) {
    const api = new URL('/v1/publication/list', writingBase);
    headers.accept = 'application/cbor';
    headers['content-type'] = 'application/cbor';
    const res = await fetch(api, {
        method: 'POST',
        headers,
        body: Buffer.from(encode({
            gid: gid.toBytes(),
            status: 2,
            fields: ['title', 'updated_at', 'from_language'],
        })),
    });
    if (res.status !== 200) {
        throw createError(res.status, await res.text());
    }
    const data = await res.arrayBuffer();
    const obj = decode(Buffer.from(data));
    return obj.result;
}
async function listPublished(headers, cid) {
    const api = new URL('/v1/publication/publish', writingBase);
    api.searchParams.append('cid', cid.toString());
    api.searchParams.append('gid', '00000000000000000000');
    api.searchParams.append('status', '2');
    api.searchParams.append('fields', 'title,updated_at,from_language');
    headers.accept = 'application/cbor';
    headers['content-type'] = 'application/cbor';
    const res = await fetch(api, {
        headers,
    });
    if (res.status !== 200) {
        throw createError(res.status, await res.text());
    }
    const data = await res.arrayBuffer();
    const obj = decode(Buffer.from(data));
    return obj.result;
}
async function listIndex(headers) {
    const api = new URL('/v1/search?q=', writingBase);
    headers.accept = 'application/cbor';
    headers['content-type'] = 'application/cbor';
    const res = await fetch(api, {
        headers,
    });
    if (res.status !== 200) {
        throw createError(res.status, await res.text());
    }
    const data = await res.arrayBuffer();
    const obj = decode(Buffer.from(data));
    return obj.result.hits;
}
function isXid(id) {
    try {
        Xid.parse(id);
        return true;
    }
    catch (e) { }
    return false;
}
function ctxHeaders(ctx) {
    const ctxheaders = {
        'x-request-id': ctx.get('x-request-id'),
        'x-auth-user': '000000000000000anon0',
        'x-auth-user-rating': ctx.get('x-auth-user-rating'),
        'x-auth-app': ctx.get('x-auth-app'),
    };
    let lang = ctx.query.language;
    if (!lang) {
        lang = ctx.query.lang;
    }
    if (!lang) {
        lang = ctx.get('x-language');
    }
    if (!lang) {
        lang = ctx.cookies.get('lang') ?? '';
    }
    if (!lang) {
        lang = ctx.acceptsLanguages()[0] ?? '';
        const i = lang.indexOf('-');
        if (i > 0) {
            lang = lang.substring(0, i);
        }
    }
    ctxheaders['x-language'] = lang639_3(lang);
    return ctxheaders;
}
