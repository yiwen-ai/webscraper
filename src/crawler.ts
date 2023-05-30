import { CheerioCrawler, type Request, log } from 'crawlee'
import { type Cheerio, type Element } from 'cheerio'

log.setLevel(log.LEVELS.WARNING)

export type Meta = Record<string, string>

export interface Document {
  url: string
  src: string
  title: string
  meta: Meta
  html: string
  page: string
}

export async function scraping (url: string): Promise<{
  requestId: string
  uniqueKey: string
  result: Promise<Document>
}> {
  let resolve: (value: any) => void
  let reject: (reason?: any) => void

  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })

  const crawler = new CheerioCrawler({
    requestHandler: async ({ request, $ }) => {
      let articleTitle = $('h1')
      if (articleTitle.length === 0) {
        articleTitle = $('h2')
      }

      if (articleTitle.length === 0) {
        reject(scrapingErr('not found', request)); return
      }

      function getCheerioText ($el: Cheerio<Element>): string {
        return $el.map((_i, el) => $(el).text().trim()).toArray().join(' ')
      }

      const doc: Document = {
        src: request.url,
        url: request.uniqueKey,
        title: getCheerioText(articleTitle),
        meta: {},
        html: '',
        page: $.html()
      }

      $('head > meta').each((_i, el) => {
        const property = el.attribs?.property
        const content = el.attribs?.content
        if (typeof property === 'string' && typeof content === 'string') {
          if (property === 'og:title') {
            doc.title = content.trim()
          } else if (property.startsWith('og:') || property.startsWith('article:')) {
            doc.meta[property.trim()] = content.trim()
          }
        }
      })

      let articleContent = articleTitle.parent()
      // try to find the article content
      if (getCheerioText(articleContent).length < doc.title.length * 2) {
        articleContent = articleContent.parent()
      }
      if (getCheerioText(articleContent).length < doc.title.length * 2) {
        articleContent = articleContent.parent()
      }

      doc.html = articleContent.html() as string
      resolve(doc)
    },

    failedRequestHandler: async ({ request }) => {
      const msg = request.errorMessages.map((str) => {
        let i = str.indexOf('\n')
        if (i === -1) i = str.length
        return str.slice(0, i).trim()
      }).join(', ')
      reject(scrapingErr(msg, request))
    }
  })

  const rt = await crawler.addRequests([url])
  crawler.run([]).catch((err) => { reject(err) })

  const { requestId, uniqueKey } = rt.addedRequests[0]
  return {
    requestId,
    uniqueKey,
    result: promise as Promise<Document>
  }
}

function scrapingErr (msg: string, req: Request): any {
  const err = new Error(msg) as any
  err.name = 'ScrapingError'
  err.data = {
    id: req.id,
    url: req.url,
    uniqueKey: req.uniqueKey,
    retryCount: req.retryCount
  }
  return err
}
