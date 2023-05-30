import { CheerioCrawler, Request, log } from 'crawlee'
import { Cheerio, Element } from 'cheerio'

log.setLevel(log.LEVELS.WARNING)

export interface Meta {
  [index: string]: string
}

export interface Document {
  url: string
  src: string
  title: string
  meta: Meta
  html: string
  page: string
}

export async function scraping(url: string) {
  let resolve: (value: any) => void
  let reject: (reason?: any) => void

  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  const crawler = new CheerioCrawler({
      requestHandler: async ({ request, $ }) => {
        let articleTitle = $('h1')
        if (articleTitle.length == 0) {
          articleTitle = $('h2')
        }

        if (articleTitle.length == 0) {
          return reject(scrapingErr("not found", request))
        }

        const getCheerioText = ($el: Cheerio<Element>) => $el.map((_i, el) => $(el).text().trim()).toArray().join(' ')

        const doc: Document = {
          src: request.url,
          url: request.uniqueKey,
          title: getCheerioText(articleTitle),
          meta: {},
          html: '',
          page: $.html()
        }

        $('head > meta').map((_i, el) => {
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

        let articleContent = articleTitle.parent();
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
          if (i == -1) i = str.length
          return str.slice(0, i).trim()
        }).join(', ')
        reject(scrapingErr(msg, request))
      },
  })

  const rt = await crawler.addRequests([url])
  crawler.run([])
  const { requestId, uniqueKey } = rt.addedRequests[0]
  return {
    requestId,
    uniqueKey,
    result: promise as Promise<Document>,
  }
}

function scrapingErr(msg: string, req: Request) {
  const err = new Error(msg) as any
  err.name = 'ScrapingError'
  err.data = {
    id: req.id,
    url: req.url,
    uniqueKey: req.uniqueKey,
    retryCount: req.retryCount,
  }
  return err
}
