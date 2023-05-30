import { URL } from 'node:url'
import { format } from 'node:util'

import { Context } from 'koa'

import { LogLevel, createLog, logError, writeLog } from './log.js'
import { scraping } from './crawler.js'
import { parseHTMLDocument } from './tiptap.js'
import { Counter, Document } from './db/model.js'

const serverStartAt = Date.now()

export async function versionAPI(ctx: Context) {
  ctx.body = {
    result: {
      name: 'webscraper',
    },
  }
}

export async function healthzAPI(ctx: Context) {
  const { db } = ctx.app.context
  const s = ctx.app.context.db.getState()
  const c = new Counter('Documents')
  await c.fill(db)
  ctx.body = {
    result: {
      start: serverStartAt,
      documents: c.row.cnt,
      hosts: s._hosts.length,
      openConnections: s._openConnections,
      inFlightQueries: s._inFlightQueries,
    }
  }
}

export async function scrapingAPI(ctx: Context) {
  const { db } = ctx.app.context
  const { url } = ctx.request.query

  if (!isValidUrl(url)) {
    ctx.throw(400, format('Invalid scraping URL: %s',  url))
  }

  const doc = await Document.findLatest(db, url as string)
  if (doc.isFresh) {
    ctx.body = {
      result: {
        id: doc.id.toString('base64url'),
        url: doc.row.url,
      }
    }
    return
  }

  const { result } = await scraping(url as string)
  const log = createLog(ctx.state.log.start, LogLevel.Info)
  log.action = 'scraping'
  log.xRequestID = ctx.state.log.xRequestID

  result.then(async (d) => {
    const res = parseHTMLDocument(d.html)
    doc.setTitle(d.title)
    doc.setMeta(d.meta)
    doc.setPage(d.page)
    doc.setCBOR(res.json)
    doc.setHTML(res.html)

    await doc.insert(db)
    await new Counter('Documents').incrOne(db)

    log.url = d.url
    log.title = d.title
    log.meta = d.meta
    log.pageLength = d.page.length
    log.htmlLength = res.html.length
    log.cborLength = doc.row.cbor?.length
    log.elapsed = Date.now() - log.start
    writeLog(log)
  }).catch((err) => {
    logError(err)
  })

  ctx.body = {
    result: {
      id: doc.id.toString('base64url'),
      url: doc.row.url,
    }
  }
}

export async function documentAPI(ctx: Context) {
  const { db } = ctx.app.context
  const { id, url, output } = ctx.request.query

  var doc
  if (typeof id == 'string' && id != '') {
    const idBuf = Buffer.from(id as string, 'base64url')
    if (idBuf.length == 28) {
      doc = Document.fromId(idBuf)
    }
  } else if (isValidUrl(url)) {
    doc = await Document.findLatest(db, url as string)
  }

  if (doc == null) {
    ctx.throw(400, format('Invalid document id %s or url %s', id, url))
  }

  let selectColumns = ['url', 'src', 'title', 'meta', 'meta', 'cbor']
  if (output == 'basic') { // 'basic', 'detail', 'full'
    selectColumns = ['url', 'src', 'title', 'meta']
  } else if (output == 'full') {
    selectColumns = ['url', 'src', 'title', 'meta', 'cbor', 'html', 'page']
  }

  await doc.fill(db, selectColumns)

  ctx.body = {
    result: {
      id: doc.id.toString('base64url'),
      url: doc.row.url,
      doc: doc.toJSON(),
    }
  }
}

function isValidUrl(url: any): boolean {
  return typeof url == 'string' && url.startsWith('https://') // node 20 && URL.canParse(url)
}