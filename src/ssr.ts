import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { type Context } from 'koa'
import config from 'config'
import { decode, encode } from 'cborg'
import { Xid } from 'xid-ts'
import * as cheerio from 'cheerio'
import createError from 'http-errors'
import { toHTML, type Node } from './tiptap.js'
import { lang639_3, isRTL } from './lang.js'

const ZeroID = Xid.default().toString()
const indexTpl = readFileSync('./html/index.html', 'utf-8')
const groupTpl = readFileSync('./html/group.html', 'utf-8')
const publicationTpl = readFileSync('./html/publication.html', 'utf-8')
const collectionTpl = readFileSync('./html/collection.html', 'utf-8')

const siteBase = config.get<string>('siteBase')
const writingBase = config.get<string>('writingBase')
const userBase = config.get<string>('userBase')
const metaInfos: Record<string, MetaInfo> = {
  zho: {
    title: 'Yiwen 亿文 — 基于人工智能的跨语言知识内容平台',
    desc: '亿文是一个跨语言知识内容平台，借助 GPT 人工智能，您可以轻松将精彩文章、文档一键翻译成多种语言并分享给全世界读者，让知识没有语言界限。',
  },
  eng: {
    title: 'Yiwen — AI-based Translingual Knowledge Content Platform',
    desc: 'Yiwen is a cross-language knowledge content platform. With the help of GPT artificial intelligence, you can easily translate outstanding articles and documents into multiple languages with one click and share them with readers all over the world, making knowledge free of language barriers.',
  },
  fra: {
    title:
      "Yiwen — Plateforme de contenu de connaissances translinguistique basée sur l'IA",
    desc: "Yiwen est une plateforme de contenu de connaissances multilingue. Grâce à l'intelligence artificielle GPT, vous pouvez facilement traduire des articles et documents exceptionnels en plusieurs langues en un seul clic et les partager avec des lecteurs du monde entier, rendant le savoir sans frontières linguistiques.",
  },
  rus: {
    title:
      'Yiwen — Платформа для контента знаний на основе ИИ с поддержкой многих языков',
    desc: 'Yiwen - это многоязычная платформа для контента знаний. С помощью искусственного интеллекта GPT вы можете легко переводить выдающиеся статьи и документы на множество языков одним кликом и делиться ими с читателями по всему миру, делая знания свободными от языковых барьеров.',
  },
  ara: {
    title: 'منصة محتوى المعرفة متعددة اللغات بناءً على الذكاء الصنعي — Yiwen',
    desc: 'يوين هي منصة محتوى المعرفة متعددة اللغات. بمساعدة الذكاء الاصطناعي جي بي تي، يمكنك ترجمة المقالات والوثائق البارزة بسهولة إلى لغات متعددة بنقرة واحدة ومشاركتها مع القراء حول العالم، مما يجعل المعرفة خالية من الحواجز اللغوية.',
  },
  spa: {
    title:
      'Yiwen — Plataforma de contenido de conocimiento translingüístico basada en IA',
    desc: 'Yiwen es una plataforma de contenido de conocimiento multilingüe. Con la ayuda de la inteligencia artificial GPT, puedes traducir fácilmente artículos y documentos destacados a múltiples idiomas con un solo clic y compartirlos con lectores de todo el mundo, haciendo que el conocimiento esté libre de barreras idiomáticas.',
  },
}

export async function renderIndex(ctx: Context) {
  const headers = ctxHeaders(ctx)

  const $ = cheerio.load(indexTpl)
  const lang = headers['x-language'] ?? 'eng'
  const siteInfo = metaInfos[lang] || metaInfos.eng
  $('title').text(siteInfo.title)
  $('meta[name="description"]').prop('content', siteInfo.desc)

  try {
    await Promise.all([
      (async () => {
        const docs = await listLatestCollections(headers)
        renderCollectionItems($, docs, lang)
      })().catch(ignoreError),
      (async () => {
        const docs = await listLatestPublications(headers)
        renderPublicationItems($, docs)
      })().catch(ignoreError),
    ])
  } catch (err: any) {
    ctx.status = 404
    const url = ctx.get('x-request-url')
    if (url !== '') {
      $('#content').text(url + ' not found')
    }
  }

  ctx.vary('Accept-Language')
  ctx.type = 'text/html'
  ctx.body = $.html()
}

export async function renderPublication(ctx: Context): Promise<void> {
  const headers = ctxHeaders(ctx)

  const cid = ctx.params.cid as string
  const { gid, language } = ctx.query
  const $ = cheerio.load(publicationTpl)
  const lang = headers['x-language'] ?? 'eng'
  const siteInfo = metaInfos[lang]
  if (siteInfo) {
    $('title').text(siteInfo.title)
    $('meta[name="description"]').prop('content', siteInfo.desc)
  }

  try {
    const doc = await getPublication(
      headers,
      cid,
      (gid ?? '') as string,
      (language ?? lang) as string
    )

    const docs = await listPublished(headers, Xid.fromValue(cid))
    renderPublicationItems(
      $,
      docs.filter((item) => item.language !== doc.language)
    )

    const docUrl = `${siteBase}/pub/${Xid.fromValue(doc.cid).toString()}`
    const groupUrl = `${siteBase}/group/${Xid.fromValue(doc.gid).toString()}`
    $('html').prop('lang', doc.language)
    if (isRTL(doc.language)) {
      $('html').prop('dir', 'rtl')
    }

    $('meta[property="og:url"]').prop('content', docUrl)
    $('meta[property="og:title"]').prop('content', doc.title)
    if (doc.summary) {
      $('meta[property="og:description"]').prop('content', doc.summary)
    }

    $('#title').text(doc.title)
    if (doc.summary) {
      $('#summary').text(doc.summary)
    }
    if (doc.authors) {
      doc.authors.forEach((author) =>
        $(`<span>${author}</span>`).appendTo(`#authors`)
      )
    }
    if (doc.keywords) {
      doc.keywords.forEach((keyword) =>
        $(`<span>${keyword}</span>`).appendTo(`#keywords`)
      )
    }

    const groupInfo = $('#group')
    groupInfo.prop('href', groupUrl)
    groupInfo.text(`Group: ${groupUrl}`)

    const updated_at = new Date(doc.updated_at).toUTCString()
    $('#updated_time').text(`Updated: ${updated_at}`)
    $('#version').text(`Version: ${doc.version}`)

    const content = decode(doc.content) as Node
    let contentHtml =
      toHTML(content) +
      `\n<p><a title="Permalink" href="${docUrl}" target="_blank">Permalink: ${docUrl}</a></p>`
    if (doc.rfp?.creation) {
      contentHtml += `\n<p>Request For Payment, Price: ${doc.rfp.creation.price} WEN</p>`
    }
    $('#content').html(contentHtml)

    ctx.set('last-modified', updated_at)
  } catch (err: any) {
    ctx.status = 404
    const url = ctx.get('x-request-url')
    if (url !== '') {
      $('#content').text(url + ' not found')
    }
  }

  ctx.vary('Accept-Language')
  ctx.type = 'text/html'
  ctx.body = $.html()
}

export async function renderCollection(ctx: Context): Promise<void> {
  const headers = ctxHeaders(ctx)

  // const gid = ctx.params.gid as string
  const { cid: _cid } = ctx.query
  const $ = cheerio.load(collectionTpl)
  const lang = headers['x-language'] ?? 'eng'
  const siteInfo = metaInfos[lang]
  if (siteInfo) {
    $('title').text(siteInfo.title)
    $('meta[name="description"]').prop('content', siteInfo.desc)
  }

  if (!_cid || Array.isArray(_cid)) {
    return renderGroup(ctx)
  }

  try {
    const doc = await getCollection(headers, _cid)
    const [language, info] = getCollectionInfo(doc, lang) ?? []
    if (!info || !language) {
      throw createError(404, 'collection not found')
    }

    const gid = Xid.fromValue(doc.gid)
    const cid = Xid.fromValue(doc.id)

    const groupUrl = `${siteBase}/group/${gid.toString()}`
    const docUrl = `${groupUrl}?cid=${cid.toString()}`
    $('html').prop('lang', language)
    if (isRTL(language)) {
      $('html').prop('dir', 'rtl')
    }

    $('meta[property="og:url"]').prop('content', docUrl)
    $('meta[property="og:title"]').prop('content', info.title)
    if (info.summary) {
      $('meta[property="og:description"]').prop('content', info.summary)
    }

    $('#title').text(info.title)
    if (info.summary) {
      $('#summary').text(info.summary)
    }

    if (info.authors) {
      info.authors.forEach((author) =>
        $(`<span>${author}</span>`).appendTo(`#authors`)
      )
    }
    if (info.keywords) {
      info.keywords.forEach((keyword) =>
        $(`<span>${keyword}</span>`).appendTo(`#keywords`)
      )
    }

    const groupInfo = $('#group')
    groupInfo.prop('href', groupUrl)
    groupInfo.text(`Group: ${groupUrl}`)

    const updated_at = new Date(doc.updated_at).toUTCString()
    $('#updated_time').text(`Updated: ${updated_at}`)
    ctx.set('last-modified', updated_at)

    try {
      const docs = await listCollectionChildren(headers, cid)
      renderCollectionChildrenItems($, docs)
    } catch (err: any) {
      ignoreError()
    }
  } catch (err: any) {
    ctx.status = 404
    const url = ctx.get('x-request-url')
    if (url !== '') {
      $('#content').text(url + ' not found')
    }
  }

  ctx.vary('Accept-Language')
  ctx.type = 'text/html'
  ctx.body = $.html()
}

export async function renderGroup(ctx: Context) {
  const headers = ctxHeaders(ctx)

  const gid = ctx.params.gid as string
  const $ = cheerio.load(groupTpl)
  const lang = headers['x-language'] ?? 'eng'
  const siteInfo = metaInfos[lang]
  if (siteInfo) {
    $('title').text(siteInfo.title)
    $('meta[name="description"]').prop('content', siteInfo.desc)
  }

  try {
    const group = await getGroup(headers, gid)
    const xGid = Xid.fromValue(group.id)
    const groupUrl = `${siteBase}/group/${gid.toString()}`

    $('meta[property="og:url"]').prop('content', groupUrl)
    $('meta[property="og:title"]').prop('content', group.name)
    $('meta[property="og:description"]').prop('content', group.slogan)

    $('#group_name').text(group.name)
    $('#group_slogan').text(group.slogan)

    await Promise.all([
      (async () => {
        const docs = await listCollections(headers, xGid)
        renderCollectionItems($, docs, lang)
      })().catch(ignoreError),
      (async () => {
        const docs = await listPublications(headers, xGid)
        renderPublicationItems($, docs)
      })().catch(ignoreError),
    ])
  } catch (err: any) {
    ctx.status = 404
    const url = ctx.get('x-request-url')
    if (url !== '') {
      $('#content').text(url + ' not found')
    }
  }

  ctx.vary('Accept-Language')
  ctx.type = 'text/html'
  ctx.body = $.html()
}

function renderPublicationItems(
  $: cheerio.CheerioAPI,
  docs: PublicationOutput[]
): void {
  renderList(
    $,
    'publications',
    docs.map((doc) => {
      const cid = Xid.fromValue(doc.cid).toString()
      const gid = Xid.fromValue(doc.gid).toString()
      return {
        id: `${gid}-${cid}`,
        url: `${siteBase}/pub/${cid}?gid=${gid}`,
        title: doc.title,
        language: doc.language,
        summary: doc.summary ?? '',
        keywords: doc.keywords,
        authors: doc.authors,
      }
    })
  )
}

function renderCollectionItems(
  $: cheerio.CheerioAPI,
  docs: CollectionOutput[],
  lang: string
): void {
  renderList(
    $,
    'collections',
    docs
      .map((doc) => {
        const [language, info] = getCollectionInfo(doc, lang) ?? []
        if (!info) return null

        const cid = Xid.fromValue(doc.id).toString()
        const gid = Xid.fromValue(doc.gid).toString()
        return {
          id: `${gid}-${cid}`,
          url: `${siteBase}/group/${gid}/collection?cid=${cid}`,
          title: info.title,
          language: language,
          summary: info.summary ?? '',
          keywords: info.keywords,
          authors: info.authors,
        }
      })
      .filter((item) => !!item) as ListItem[]
  )
}

function renderCollectionChildrenItems(
  $: cheerio.CheerioAPI,
  docs: CollectionChildrenOutput[]
): void {
  renderList(
    $,
    'children',
    docs
      .map((doc) => {
        if (doc.kind == 2) return null // collection

        const cid = Xid.fromValue(doc.cid).toString()
        const gid = Xid.fromValue(doc.gid).toString()
        return {
          id: `${gid}-${cid}`,
          url: `${siteBase}/pub/${cid}?gid=${gid}`,
          title: doc.title,
          language: doc.language,
          summary: doc.summary ?? '',
          keywords: doc.keywords,
          authors: doc.authors,
        }
      })
      .filter((item) => !!item) as ListItem[]
  )
}

interface ListItem {
  id: string
  url: string
  title: string
  summary: string
  language: string
  keywords?: string[]
  authors?: string[]
}

function renderList(
  $: cheerio.CheerioAPI,
  ulId: string,
  items: ListItem[]
): void {
  const ul = $('#' + ulId)
  for (const item of items) {
    $(`<li lang="${item.language}" id="${item.id}"></li>`).appendTo(ul)
    const title = $(`<a href="${item.url}"></a>`)
    title.attr('title', item.title)
    title.text(item.title)
    title.appendTo(`#${item.id}`)

    if (item.summary) {
      const summary = $(`<p title="summary"></p>`)
      summary.text(item.summary)
      summary.appendTo(`#${item.id}`)
    }

    if (item.authors) {
      const authors = item.authors
        .map((author) => `<span>${author}</span>`)
        .join('')
      $(`<div title="authors">${authors}</div>`).appendTo(`#${item.id}`)
    }
    if (item.keywords) {
      const keywords = item.keywords
        .map((key) => `<span>${key}</span>`)
        .join('')
      $(`<div title="keywords">${keywords}</div>`).appendTo(`#${item.id}`)
    }
  }
}

// --------- API ---------

interface MetaInfo {
  title: string
  desc: string
}

interface GroupInfo {
  id: Uint8Array
  cn: string
  name: string
  logo: string
  slogan: string
  status: number
}

async function getGroup(
  headers: Record<string, string>,
  gid: string
): Promise<GroupInfo> {
  const api = new URL('/v1/group', userBase)
  if (isXid(gid)) {
    api.searchParams.append('id', gid)
  } else {
    api.searchParams.append('cn', gid)
  }

  api.searchParams.append('fields', 'cn,name,status,slogan')

  headers.accept = 'application/cbor'
  const res = await fetch(api, {
    headers,
  })

  if (res.status !== 200) {
    throw createError(res.status, await res.text())
  }

  const data = await res.arrayBuffer()
  const obj = decode(Buffer.from(data))
  return obj.result
}

interface RFPInfo {
  id: Uint8Array
  price: number
}

// Request for Payment
interface RFP {
  creation?: RFPInfo
  collection?: RFPInfo
}

interface PublicationOutput {
  gid: Uint8Array
  cid: Uint8Array
  language: string
  version: number
  status: number
  rating?: number
  price?: number
  created_at: number
  updated_at: number
  model: string
  original_url?: string
  from_language?: string
  title: string
  cover?: string
  keywords?: string[]
  authors?: string[]
  summary?: string
  content: Uint8Array
  rfp?: RFP
}

interface CollectionOutput {
  gid: Uint8Array
  id: Uint8Array
  rating?: number
  status: number
  updated_at: number
  language: string
  languages: string[]
  price: number
  creation_price: number
  cover?: string
  info?: CollectionInfo
  i18n_info?: Record<string, CollectionInfo>
  rfp?: RFP
}

interface CollectionInfo {
  title: string
  summary: string
  keywords?: string[]
  authors?: string[]
}

interface CollectionChildrenOutput {
  parent: Uint8Array
  gid: Uint8Array
  cid: Uint8Array
  kind: number
  ord: number
  language: string
  version: number
  status: number
  rating?: number
  price?: number
  updated_at: number
  title: string
  cover?: string
  keywords?: string[]
  authors?: string[]
  summary?: string
}

async function getPublication(
  headers: Record<string, string>,
  cid: string,
  gid: string,
  language: string
): Promise<PublicationOutput> {
  const api = new URL('/v1/publication/implicit_get', writingBase)
  api.searchParams.append('cid', cid)
  if (gid !== '') {
    api.searchParams.append('gid', gid)
  }
  if (language !== '') {
    api.searchParams.append('language', language)
  }
  api.searchParams.append(
    'fields',
    'title,summary,updated_at,from_language,authors,content'
  )
  api.searchParams.append('subscription_in', ZeroID)

  headers.accept = 'application/cbor'
  const res = await fetch(api, {
    headers,
  })

  if (res.status !== 200) {
    throw createError(res.status, await res.text())
  }

  const data = await res.arrayBuffer()
  const obj = decode(Buffer.from(data))
  return obj.result
}

async function listPublications(
  headers: Record<string, string>,
  gid: Xid
): Promise<PublicationOutput[]> {
  const api = new URL('/v1/publication/list', writingBase)
  headers.accept = 'application/cbor'
  headers['content-type'] = 'application/cbor'
  const res = await fetch(api, {
    method: 'POST',
    headers,
    body: Buffer.from(
      encode({
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
      })
    ),
  })

  if (res.status !== 200) {
    throw createError(res.status, await res.text())
  }

  const data = await res.arrayBuffer()
  const obj = decode(Buffer.from(data))
  return obj.result
}

async function listPublished(
  headers: Record<string, string>,
  cid: Xid
): Promise<PublicationOutput[]> {
  const api = new URL('/v1/publication/publish', writingBase)
  api.searchParams.append('cid', cid.toString())
  api.searchParams.append('gid', '00000000000000000000')
  api.searchParams.append('status', '2')
  api.searchParams.append('fields', 'title,updated_at,from_language')
  headers.accept = 'application/cbor'
  headers['content-type'] = 'application/cbor'
  const res = await fetch(api, {
    headers,
  })

  if (res.status !== 200) {
    throw createError(res.status, await res.text())
  }

  const data = await res.arrayBuffer()
  const obj = decode(Buffer.from(data))
  return obj.result
}

async function listLatestPublications(
  headers: Record<string, string>
): Promise<PublicationOutput[]> {
  const api = new URL('/v1/publication/list_latest', writingBase)
  headers.accept = 'application/cbor'
  headers['content-type'] = 'application/cbor'
  const res = await fetch(api, {
    method: 'POST',
    headers,
    body: Buffer.from(
      encode({
        page_size: 100,
        fields: [
          'title',
          'summary',
          'keywords',
          'authors',
          'updated_at',
          'from_language',
        ],
      })
    ),
  })

  if (res.status !== 200) {
    throw createError(res.status, await res.text())
  }

  const data = await res.arrayBuffer()
  const obj = decode(Buffer.from(data))
  return obj.result
}

async function getCollection(
  headers: Record<string, string>,
  cid: string
): Promise<CollectionOutput> {
  const api = new URL('/v1/collection', writingBase)
  api.searchParams.append('gid', '000000000000000anon0')
  api.searchParams.append('id', cid)
  api.searchParams.append('fields', 'info,updated_at')

  headers.accept = 'application/cbor'
  const res = await fetch(api, {
    headers,
  })

  if (res.status !== 200) {
    throw createError(res.status, await res.text())
  }

  const data = await res.arrayBuffer()
  const obj = decode(Buffer.from(data))
  return obj.result
}

async function listCollections(
  headers: Record<string, string>,
  gid: Xid
): Promise<CollectionOutput[]> {
  const api = new URL('/v1/collection/list', writingBase)
  headers.accept = 'application/cbor'
  headers['content-type'] = 'application/cbor'
  const output = new Array<CollectionOutput>()

  const input = {
    gid: gid.toBytes(),
    page_size: 100,
    status: 2,
    fields: ['info', 'updated_at'],
    page_token: undefined,
  }

  let i = 7
  while (i > 0) {
    i -= 1
    const res = await fetch(api, {
      method: 'POST',
      headers,
      body: Buffer.from(encode(input)),
    })

    if (res.status !== 200) {
      break
    }

    const data = await res.arrayBuffer()
    const obj = decode(Buffer.from(data))
    output.push(...obj.result)
    if (!obj.next_page_token) {
      break
    }
    input.page_token = obj.next_page_token
  }

  return output
}

async function listLatestCollections(
  headers: Record<string, string>
): Promise<CollectionOutput[]> {
  const api = new URL('/v1/collection/list_latest', writingBase)
  headers.accept = 'application/cbor'
  headers['content-type'] = 'application/cbor'
  const output = new Array<CollectionOutput>()

  const input = {
    page_size: 100,
    fields: ['info', 'updated_at'],
    page_token: undefined,
  }

  let i = 7
  while (i > 0) {
    i -= 1

    const res = await fetch(api, {
      method: 'POST',
      headers,
      body: Buffer.from(encode(input)),
    })

    if (res.status !== 200) {
      break
    }

    const data = await res.arrayBuffer()
    const obj = decode(Buffer.from(data))
    output.push(...obj.result)
    if (!obj.next_page_token) {
      break
    }
    input.page_token = obj.next_page_token
  }

  return output
}

async function listCollectionChildren(
  headers: Record<string, string>,
  id: Xid
): Promise<CollectionChildrenOutput[]> {
  const api = new URL('/v1/collection/list_children', writingBase)
  headers.accept = 'application/cbor'
  headers['content-type'] = 'application/cbor'
  const res = await fetch(api, {
    method: 'POST',
    headers,
    body: Buffer.from(
      encode({
        gid: Xid.default().toBytes(),
        id: id.toBytes(),
        page_size: 100,
      })
    ),
  })

  if (res.status !== 200) {
    throw createError(res.status, await res.text())
  }

  const data = await res.arrayBuffer()
  const obj = decode(Buffer.from(data))
  return obj.result
}

function isXid(id: string): boolean {
  try {
    Xid.parse(id)
    return true
  } catch (e) {}
  return false
}

function getCollectionInfo(
  item: CollectionOutput,
  language: string
): [string, CollectionInfo] | undefined {
  let info = item.i18n_info?.[language]
  if (info) {
    return [language, info]
  }
  info = item.info
  if (info) {
    return [language, info]
  }

  return undefined
}

function ctxHeaders(ctx: Context): Record<string, string> {
  const ctxheaders: Record<string, string> = {
    'x-request-id': ctx.get('x-request-id'),
    'x-auth-user': '000000000000000anon0',
    'x-auth-user-rating': ctx.get('x-auth-user-rating'),
    'x-auth-app': ctx.get('x-auth-app'),
  }
  let lang = ctx.query.language as string
  if (!lang) {
    lang = ctx.query.lang as string
  }
  if (!lang) {
    lang = ctx.get('x-language')
  }
  if (!lang) {
    lang = ctx.cookies.get('lang') ?? ''
  }
  if (!lang) {
    lang = ctx.acceptsLanguages()[0] ?? ''
    const i = lang.indexOf('-')
    if (i > 0) {
      lang = lang.substring(0, i)
    }
  }

  ctxheaders['x-language'] = lang639_3(lang) || 'eng'
  return ctxheaders
}

function ignoreError() {
  // console.error(err)
}
