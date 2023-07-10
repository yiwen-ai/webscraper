import { format } from 'node:util'
import { URL } from 'node:url'

import { type Context } from 'koa'

import { LogLevel, createLog, logError, writeLog } from './log.js'
import { scraping } from './crawler.js'
import { parseHTMLDocument } from './tiptap.js'
import { Document } from './db/model.js'

const serverStartAt = Date.now()

export async function versionAPI (ctx: Context): Promise<void> {
  ctx.body = {
    result: {
      name: 'webscraper'
    }
  }
}

export async function healthzAPI (ctx: Context): Promise<void> {
  const s = ctx.app.context.db.getState()
  ctx.body = {
    result: {
      start: serverStartAt,
      hosts: s._hosts.length,
      openConnections: s._openConnections,
      inFlightQueries: s._inFlightQueries
    }
  }
}

export async function scrapingAPI (ctx: Context): Promise<void> {
  const { db } = ctx.app.context
  const { url } = ctx.request.query

  if (!isValidUrl(url)) {
    ctx.throw(400, format('Invalid scraping URL: %s', url))
  }

  const doc = await Document.findLatest(db, url as string)
  if (doc.isFresh) {
    // a fresh document is a document that has been scraped within the last 3600 seconds
    ctx.body = {
      readyAfter: 0, // client can get the document after 0 seconds
      result: {
        id: doc.id.toString('base64url'),
        url: doc.row.url
      }
    }
    return
  }

  const acquired = await doc.acquire(db)
  if (!acquired) {
    // fail to get the document scraping lock, it's being scraped by another process
    ctx.body = {
      readyAfter: 3, // client should try to get the document after 3 seconds
      result: {
        id: doc.id.toString('base64url'),
        url: doc.row.url
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

    await doc.save(db)

    log.url = d.url
    log.title = d.title
    log.meta = d.meta
    log.pageLength = d.page.length
    log.htmlLength = res.html.length
    log.cborLength = doc.row.cbor?.length
    log.elapsed = Date.now() - log.start
    writeLog(log)
  }).catch(async (err) => {
    // remove the partially saved document if scraping failed
    // so other requests can retry scraping
    await doc.release(db)
    logError(err)
  })

  ctx.body = {
    readyAfter: 2, // client should try to get the document after 2 seconds
    result: {
      id: doc.id.toString('base64url'),
      url: doc.row.url
    }
  }
}

export async function documentAPI (ctx: Context): Promise<void> {
  const { db } = ctx.app.context
  const { id, url, output } = ctx.request.query

  let doc
  if (typeof id === 'string' && id !== '') {
    const idBuf = Buffer.from(id, 'base64url')
    if (idBuf.length === 28) {
      doc = Document.fromId(idBuf)
    }
  } else if (isValidUrl(url)) {
    doc = await Document.findLatest(db, url as string)
  }

  if (doc == null) {
    ctx.throw(400, format('invalid document id %s or url %s', id, url))
  }

  let selectColumns = ['url', 'src', 'title', 'meta', 'meta', 'cbor']
  if (output === 'basic') { // 'basic', 'detail', 'full'
    selectColumns = ['url', 'src', 'title', 'meta']
  } else if (output === 'full') {
    selectColumns = ['url', 'src', 'title', 'meta', 'cbor', 'html', 'page']
  }

  await doc.fill(db, selectColumns)

  ctx.body = {
    result: {
      id: doc.id.toString('base64url'),
      url: doc.row.url,
      doc: doc.toJSON()
    }
  }
}

function isValidUrl (url: any): boolean {
  if (typeof url === 'string' && url.startsWith('https://')) {
    try {
      const v = new URL(url)
      return v != null
    } catch (e) {}
  }
  return false
}
