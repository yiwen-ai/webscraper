import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import config from 'config';
import { decode, encode } from 'cborg';
import { Xid } from 'xid-ts';
import * as cheerio from 'cheerio';
import createError from 'http-errors';
import { toHTML } from './tiptap.js';
import { lang639_3, isRTL } from './lang.js';
const ZeroID = Xid.default().toString();
const indexTpl = readFileSync('./html/index.html', 'utf-8');
const publicationTpl = readFileSync('./html/publication.html', 'utf-8');
const groupTpl = readFileSync('./html/group.html', 'utf-8');
const siteBase = config.get('siteBase');
const writingBase = config.get('writingBase');
const userBase = config.get('userBase');
const metaInfos = {
    zho: {
        title: 'Yiwen 亿文 — 基于人工智能的跨语言知识内容平台',
        desc: '亿文是一个跨语言知识内容平台，借助 GPT 人工智能，您可以轻松将精彩文章、文档一键翻译成多种语言并分享给全世界读者，让知识没有语言界限。',
    },
    eng: {
        title: 'Yiwen — AI-based Translingual Knowledge Content Platform',
        desc: 'Yiwen is a cross-language knowledge content platform. With the help of GPT artificial intelligence, you can easily translate outstanding articles and documents into multiple languages with one click and share them with readers all over the world, making knowledge free of language barriers.',
    },
    fra: {
        title: "Yiwen — Plateforme de contenu de connaissances translinguistique basée sur l'IA",
        desc: "Yiwen est une plateforme de contenu de connaissances multilingue. Grâce à l'intelligence artificielle GPT, vous pouvez facilement traduire des articles et documents exceptionnels en plusieurs langues en un seul clic et les partager avec des lecteurs du monde entier, rendant le savoir sans frontières linguistiques.",
    },
    rus: {
        title: 'Yiwen — Платформа для контента знаний на основе ИИ с поддержкой многих языков',
        desc: 'Yiwen - это многоязычная платформа для контента знаний. С помощью искусственного интеллекта GPT вы можете легко переводить выдающиеся статьи и документы на множество языков одним кликом и делиться ими с читателями по всему миру, делая знания свободными от языковых барьеров.',
    },
    ara: {
        title: 'منصة محتوى المعرفة متعددة اللغات بناءً على الذكاء الصنعي — Yiwen',
        desc: 'يوين هي منصة محتوى المعرفة متعددة اللغات. بمساعدة الذكاء الاصطناعي جي بي تي، يمكنك ترجمة المقالات والوثائق البارزة بسهولة إلى لغات متعددة بنقرة واحدة ومشاركتها مع القراء حول العالم، مما يجعل المعرفة خالية من الحواجز اللغوية.',
    },
    spa: {
        title: 'Yiwen — Plataforma de contenido de conocimiento translingüístico basada en IA',
        desc: 'Yiwen es una plataforma de contenido de conocimiento multilingüe. Con la ayuda de la inteligencia artificial GPT, puedes traducir fácilmente artículos y documentos destacados a múltiples idiomas con un solo clic y compartirlos con lectores de todo el mundo, haciendo que el conocimiento esté libre de barreras idiomáticas.',
    },
};
export async function renderIndex(ctx) {
    const headers = ctxHeaders(ctx);
    const $ = cheerio.load(indexTpl);
    const lang = headers['x-language'] ?? 'eng';
    const info = metaInfos[lang] || metaInfos.eng;
    $('title').text(info.title);
    $('meta[name="description"]').prop('content', info.desc);
    try {
        await Promise.all([
            (async () => {
                const docs = await listLatestCollections(headers);
                renderCollectionItems($, docs, lang);
            })().catch(ignoreError),
            (async () => {
                const docs = await listLatestPublications(headers);
                renderPublicationItems($, docs);
            })().catch(ignoreError),
        ]);
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
    const lang = headers['x-language'] ?? 'eng';
    const info = metaInfos[lang];
    if (info) {
        $('title').text(info.title);
        $('meta[name="description"]').prop('content', info.desc);
    }
    try {
        const docs = await listPublished(headers, Xid.fromValue(cid));
        renderPublicationItems($, docs);
        const doc = await getPublication(headers, cid, (gid ?? ''), (language ?? lang));
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
        let contentHtml = toHTML(content) +
            `\n<p><a title="Permalink" href="${docUrl}" target="_blank">${docUrl}</a></p>`;
        if (doc.rfp?.creation) {
            contentHtml += `\n<p>Request For Payment, Price: ${doc.rfp.creation.price} WEN</p>`;
        }
        $('#content').html(contentHtml);
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
    const _gid = ctx.params.id;
    const $ = cheerio.load(groupTpl);
    const lang = headers['x-language'] ?? 'eng';
    const info = metaInfos[lang];
    if (info) {
        $('title').text(info.title);
        $('meta[name="description"]').prop('content', info.desc);
    }
    try {
        const group = await getGroup(headers, _gid);
        const gid = Xid.fromValue(group.id);
        const groupUrl = `${siteBase}/group/${gid.toString()}`;
        $('meta[property="og:title"]').prop('content', group.name);
        $('meta[property="og:description"]').prop('content', group.slogan);
        $('meta[property="og:url"]').prop('content', groupUrl);
        $('#group_name').text(group.name);
        $('#group_slogan').text(group.slogan);
        await Promise.all([
            (async () => {
                const docs = await listCollections(headers, gid);
                renderCollectionItems($, docs, lang);
            })().catch(ignoreError),
            (async () => {
                const docs = await listPublications(headers, gid);
                renderPublicationItems($, docs);
            })().catch(ignoreError),
        ]);
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
function renderPublicationItems($, docs) {
    renderList($, 'publications', docs.map((doc) => {
        const cid = Xid.fromValue(doc.cid).toString();
        const gid = Xid.fromValue(doc.gid).toString();
        return {
            id: `${gid}-${cid}`,
            url: `${siteBase}/pub/${cid}?gid=${gid}`,
            title: doc.title,
            language: doc.language,
            summary: doc.summary ?? '',
            keywords: doc.keywords,
            authors: doc.authors,
        };
    }));
}
function renderCollectionItems($, docs, lang) {
    renderList($, 'collections', docs
        .map((doc) => {
        const [language, info] = getCollectionInfo(doc, lang) ?? [];
        if (!info)
            return null;
        const cid = Xid.fromValue(doc.id).toString();
        const gid = Xid.fromValue(doc.gid).toString();
        return {
            id: `${gid}-${cid}`,
            url: `${siteBase}/group/${gid}/collection?cid=${cid}`,
            title: info.title,
            language: language,
            summary: info.summary ?? '',
            keywords: info.keywords,
            authors: info.authors,
        };
    })
        .filter((item) => !!item));
}
function renderList($, ulId, items) {
    const ul = $('#' + ulId);
    for (const item of items) {
        $(`<li lang="${item.language}" id="${item.id}"></li>`).appendTo(ul);
        const title = $(`<a href="${item.url}"></a>`);
        title.attr('title', item.title);
        title.text(item.title);
        title.appendTo(`#${item.id}`);
        if (item.summary) {
            const summary = $(`<p title="summary"></p>`);
            summary.text(item.summary);
            title.appendTo(`#${item.id}`);
        }
        if (item.authors) {
            const authors = item.authors
                .map((author) => `<span>${author}</span>`)
                .join('');
            $(`<div title="authors">${authors}</div>`).appendTo(`#${item.id}`);
        }
        if (item.keywords) {
            const keywords = item.keywords
                .map((key) => `<span>${key}</span>`)
                .join('');
            $(`<div title="keywords">${keywords}</div>`).appendTo(`#${item.id}`);
        }
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
    api.searchParams.append('fields', 'title,summary,updated_at,from_language,authors,content');
    api.searchParams.append('subscription_in', ZeroID);
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
            fields: [
                'title',
                'summary',
                'keywords',
                'authors',
                'updated_at',
                'from_language',
            ],
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
async function listLatestPublications(headers) {
    const api = new URL('/v1/publication/list_latest', writingBase);
    headers.accept = 'application/cbor';
    headers['content-type'] = 'application/cbor';
    const res = await fetch(api, {
        method: 'POST',
        headers,
        body: Buffer.from(encode({
            page_size: 100,
            fields: [
                'title',
                'summary',
                'keywords',
                'authors',
                'updated_at',
                'from_language',
            ],
        })),
    });
    if (res.status !== 200) {
        throw createError(res.status, await res.text());
    }
    const data = await res.arrayBuffer();
    const obj = decode(Buffer.from(data));
    return obj.result;
}
async function listCollections(headers, gid) {
    const api = new URL('/v1/collection/list', writingBase);
    headers.accept = 'application/cbor';
    headers['content-type'] = 'application/cbor';
    const res = await fetch(api, {
        method: 'POST',
        headers,
        body: Buffer.from(encode({
            gid: gid.toBytes(),
            status: 2,
            fields: ['info', 'updated_at'],
        })),
    });
    if (res.status !== 200) {
        throw createError(res.status, await res.text());
    }
    const data = await res.arrayBuffer();
    const obj = decode(Buffer.from(data));
    return obj.result;
}
async function listLatestCollections(headers) {
    const api = new URL('/v1/collection/list_latest', writingBase);
    headers.accept = 'application/cbor';
    headers['content-type'] = 'application/cbor';
    const res = await fetch(api, {
        method: 'POST',
        headers,
        body: Buffer.from(encode({
            page_size: 100,
            fields: ['info', 'updated_at'],
        })),
    });
    if (res.status !== 200) {
        throw createError(res.status, await res.text());
    }
    const data = await res.arrayBuffer();
    const obj = decode(Buffer.from(data));
    return obj.result;
}
function isXid(id) {
    try {
        Xid.parse(id);
        return true;
    }
    catch (e) { }
    return false;
}
function getCollectionInfo(item, language) {
    let info = item.i18n_info?.[language];
    if (info) {
        return [language, info];
    }
    info = item.info;
    if (info) {
        return [language, info];
    }
    return undefined;
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
    ctxheaders['x-language'] = lang639_3(lang) || 'eng';
    return ctxheaders;
}
function ignoreError() {
    // console.error(err)
}
