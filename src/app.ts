import { gzipSync } from 'node:zlib'
import type Koa from 'koa'
import Router from '@koa/router'
import { encode } from 'cborg'

import { LogLevel, createLog, writeLog } from './log.js'
import { connect } from './db/scylladb.js'
import { versionAPI, healthzAPI, scrapingAPI, searchAPI, documentAPI, convertingAPI } from './api.js'

const GZIP_MIN_LENGTH = 128

export async function initApp(app: Koa): Promise<void> {
  // attach stateful components to the application context
  app.context.db = await connect('ywws')

  // create routes
  const router = new Router()
  router.use(initContext)
  router.get('/', versionAPI)
  router.get('/healthz', healthzAPI)
  router.get('/v1/scraping', scrapingAPI)
  router.get('/v1/search', searchAPI)
  router.get('/v1/document', documentAPI)
  router.post('/v1/converting', convertingAPI)

  app.use(router.routes())
  app.use(router.allowedMethods())
}

async function initContext(ctx: Koa.Context, next: Koa.Next): Promise<void> {
  const start = Date.now()
  const acceptCBOR = ctx.get('accept').toLowerCase().includes('cbor') || ctx.get('content-type').toLowerCase().includes('cbor')

  // initialize the log object
  const log = createLog(start)
  log.accept = ctx.get('accept')
  log.method = ctx.method
  log.requestUri = ctx.originalUrl
  log.remoteAddr = ctx.ip
  log.xRequestID = ctx.get('x-request-id')

  ctx.state.log = log

  try {
    await next()
  } catch (err: any) {
    // log the error if it's not a client error
    if (err.expose !== true || err.status == null || err.status >= 500) {
      const errLog = createLog(start, LogLevel.Error)
      errLog.xRequestID = log.xRequestID
      errLog.msg = err.message
      errLog.status = err.status
      errLog.stack = err.stack

      if (err.headers != null) {
        errLog.headers = err.headers
      }

      if (err.data != null) {
        errLog.data = err.data
      }

      writeLog(errLog)
    }

    log.msg = err.message
    ctx.status = err.status ?? 500
    ctx.body = {
      error: {
        code: err.code,
        message: err.message,
        data: err.data
      }
    }
  } finally {
    // log when the response is finished or closed, whichever happens first.
    const { res } = ctx

    const onfinish = done.bind(null)
    const onclose = done.bind(null)

    res.once('finish', onfinish)
    res.once('close', onclose)

    function done(): void {
      res.removeListener('finish', onfinish)
      res.removeListener('close', onclose)

      log.length = ctx.length
      log.status = ctx.status
      log.elapsed = Date.now() - start
      writeLog(log)
    }
  }

  // encode the response body
  let body: any = ctx.body
  if (body != null && typeof body === 'object') {
    if (acceptCBOR) {
      body = Buffer.from(encode(body))
      ctx.set('content-length', String(body.length))
      ctx.set('content-type', 'application/cbor')
    } else {
      body = Buffer.from(JSON.stringify(body), 'utf8')
      ctx.set('content-length', String(body.length))
      ctx.set('content-type', 'application/json')
    }

    if (body.length > GZIP_MIN_LENGTH && ctx.acceptsEncodings('gzip') === 'gzip') {
      log.beforeGzip = body.length
      body = gzipSync(body as Buffer)
      ctx.remove('Content-Length')
      ctx.set('content-encoding', 'gzip')
    }

    ctx.body = body
  }
}
