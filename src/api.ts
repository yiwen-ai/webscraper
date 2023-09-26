import { format } from 'node:util'
import { URL } from 'node:url'
import { type Context } from 'koa'
import { Xid } from 'xid-ts'
import { encode } from 'cborg'
import cassandra from 'cassandra-driver'
import contentType from 'content-type'
import getRawBody from 'raw-body'
import createError from 'http-errors'

import { LogLevel, createLog, logError, writeLog } from './log.js'
import { scraping } from './crawler.js'
import { parseHTML, toHTML, findTitle } from './tiptap.js'
import { getConverter } from './converting.js'
import { DocumentModel, Document } from './db/model.js'

const serverStartAt = Date.now()

export function versionAPI(ctx: Context): void {
  ctx.body = {
    result: {
      name: 'webscraper',
    },
  }
}

export function healthzAPI(ctx: Context): void {
  const db = ctx.app.context.db as cassandra.Client
  const s = db.getState()
  ctx.body = {
    result: {
      start: serverStartAt,
      scylla: s.toString(),
    },
  }
}

export async function searchAPI(ctx: Context): Promise<void> {
  const db = ctx.app.context.db as cassandra.Client
  const { url } = ctx.request.query

  if (!isValidUrl(url)) {
    ctx.throw(400, format('Invalid scraping URL: %s', url))
  }

  const doc = await DocumentModel.findLatest(db, url as string)
  if (doc.row.title != null && doc.row.title != '') {
    try {
      await doc.fill(db, ['src', 'meta', 'content'])
    } catch (_) {}
  }

  ctx.body = {
    result: doc.row,
  }
}

export async function scrapingAPI(ctx: Context): Promise<void> {
  const db = ctx.app.context.db as cassandra.Client
  const { url } = ctx.request.query

  if (!isValidUrl(url)) {
    ctx.throw(400, format('Invalid scraping URL: %s', url))
  }

  const doc = await DocumentModel.findLatest(db, url as string)
  if (doc.isFresh) {
    // a fresh document is a document that has been scraped within the last 3600 seconds
    ctx.body = {
      retry: 0, // client can get the document after 0 seconds
      result: doc.toJSON(),
    }
    return
  }

  const acquired = await doc.acquire(db)
  if (!acquired) {
    // fail to get the document scraping lock, it's being scraped by another process
    ctx.body = {
      retry: 1, // client can get the document after 0 seconds
      result: {
        id: doc.row.id,
        url: doc.row.url,
      },
    }
    return
  }

  const { result } = await scraping(url as string)
  const log = createLog(ctx.state.log.start, LogLevel.Info)
  log.action = 'scraping'
  log.xRequestID = ctx.state.log.xRequestID

  result
    .then(async (d) => {
      const obj = parseHTML(d.html)
      const html = toHTML(obj)
      doc.setTitle(d.title)
      doc.setMeta(d.meta)
      doc.setPage(d.page)
      doc.setContent(obj as object)
      doc.setHTML(html)

      await doc.save(db)

      log.url = d.url
      log.title = d.title
      log.meta = d.meta
      log.pageLength = d.page.length
      log.htmlLength = html.length
      log.cborLength = doc.row.content?.length
      log.elapsed = Date.now() - log.start
      writeLog(log)
    })
    .catch(async (err) => {
      // remove the partially saved document if scraping failed
      // so other requests can retry scraping
      await doc.release(db)
      logError(err)
    })

  ctx.body = {
    retry: 2, // client can get the document after 2 seconds
    result: {
      id: doc.row.id,
      url: doc.row.url,
    },
  }
}

export async function documentAPI(ctx: Context): Promise<void> {
  const { db } = ctx.app.context
  const { id, output } = ctx.request.query
  let xid: Xid | null = null

  try {
    xid = Xid.fromValue(id as string)
  } catch {
    ctx.throw(404, format('invalid document id %s', id))
  }

  const doc = new DocumentModel(xid)

  let selectColumns = ['url', 'src', 'title', 'meta', 'content']
  if (output === 'basic') {
    // 'basic', 'detail', 'full'
    selectColumns = ['url', 'src', 'title', 'meta']
  } else if (output === 'full') {
    selectColumns = ['url', 'src', 'title', 'meta', 'content', 'html', 'page']
  }

  await doc.fill(db, selectColumns)

  ctx.body = {
    result: doc.row,
  }
}

export async function convertingAPI(ctx: Context): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const ct = contentType.parse(ctx.get('content-type'))
  const converter = getConverter(ct.type)
  const buf = await getRawBody(ctx.req, { limit: '1024kb' })

  try {
    const content = await converter(buf)
    // console.log(Buffer.from(doc).toString('hex'))
    let title = findTitle(content, 1)
    if (title === '') {
      title = findTitle(content, 2)
    }

    const doc: Document = {
      id: new Xid(),
      url: '',
      src: '',
      title: title,
      meta: {},
      content: Buffer.from(encode(content)),
      html: '',
      page: '',
    }

    ctx.body = {
      result: doc,
    }
  } catch (err) {
    throw createError(400, err as createError.UnknownError)
  }
}

function isValidUrl(url: any): boolean {
  if (typeof url === 'string' && url.startsWith('https://')) {
    try {
      const v = new URL(url)
      return v != null
    } catch (e) {}
  }
  return false
}
