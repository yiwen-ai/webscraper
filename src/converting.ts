import createError from 'http-errors'
import { marked } from 'marked'
import pdfjs from 'pdfjs-dist'
import { type TextItem } from 'pdfjs-dist/types/src/display/api'

import { parseHTML, Node, JSONDocumentAmender } from './tiptap.js'

export type converter = (buf: Buffer) => Promise<Node>

export function getConverter(mime: string): converter {
  switch (mime) {
    case 'text/html':
      return convertHtml
    case 'text/markdown':
      return convertMarkdown
    case 'text/x-markdown':
      return convertMarkdown
    case 'application/pdf':
      return convertPdf
    case 'application/x-pdf':
      return convertPdf
    case 'text/plain':
      return convertText
    default:
      throw createError(400, 'not implemented: ' + mime)
  }
}

function convertHtml(buf: Buffer): Promise<Node> {
  const html = buf.toString('utf8')
  const doc = parseHTML(html)
  return Promise.resolve(doc)
}

function convertMarkdown(buf: Buffer): Promise<Node> {
  const html = marked.parse(buf.toString('utf8'))
  const doc = parseHTML(html)
  return Promise.resolve(doc)
}

async function convertPdf(buf: Buffer): Promise<Node> {
  const doc = await pdfjs.getDocument(new Uint8Array(buf)).promise
  const node: Node = Object.create(null)
  node.type = 'doc'
  node.content = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const hl = new HeadingLevel()

    for (let item of content.items) {
      item = item as TextItem
      if (item.height > 0) {
        hl.add(item.height)
      }
    }
    hl.finalize()

    let texts = []
    let height = 0
    let prevNode = null
    for (let item of content.items) {
      item = item as TextItem
      if (item.str == null) {
        continue
      }

      let text = item.str
      if (item.dir === 'ttb') {
        text = text.replace(/\n/g, ' ')
      }

      if (text !== '') {
        texts.push(text)
      }

      if (item.height > height) {
        height = item.height
      }

      if (item.hasEOL) {
        const level = hl.level(height)

        if (level == 0) {
          prevNode = {
            type: 'paragraph',
            content: [{
              type: 'text',
              text: texts.join('')
            }]
          }
          node.content.push(prevNode)
        } else if (prevNode != null && prevNode.type === 'heading' && prevNode.attrs!.level === level) {
          prevNode.content.push({
            type: 'text',
            text: texts.join('')
          })
        } else {
          prevNode = {
            type: "heading",
            attrs: {
              id: null,
              level,
            },
            content: [{
              type: 'text',
              text: texts.join('')
            }]
          }
          node.content.push(prevNode)
        }

        texts = []
        height = 0
      }
    }

    if (texts.length > 0) {
      node.content.push({
        type: 'paragraph',
        content: [{
          type: 'text',
          text: texts.join('')
        }]
      })
    }

    page.cleanup()
  }

  const amender = new JSONDocumentAmender()
  return Promise.resolve(amender.amendNode(node))
}

function convertText(buf: Buffer): Promise<Node> {
  const texts = buf.toString('utf8').split(/\r\n|\r|\n/)
  const node: Node = Object.create(null)
  node.type = 'doc'
  node.content = []
  for (const text of texts) {
    const txt = text.trim()
    if (txt.length === 0) {
      continue
    }
    node.content.push({
      type: 'paragraph',
      content: [{
        type: 'text',
        text: txt
      }]
    })
  }

  const amender = new JSONDocumentAmender()
  return Promise.resolve(amender.amendNode(node))
}

export class HeadingLevel {
  sample: Map<string, number>
  levels: number[]
  constructor() {
    this.sample = new Map()
    this.levels = []
  }

  add(height: number) {
    const key = (height - 0.01).toFixed(2)
    let count = this.sample.get(key) ?? 0
    count += 1
    this.sample.set(key, count)
  }

  finalize() {
    const keys = Array.from(this.sample.keys())
    if (keys.length === 0) {
      return []
    }

    keys.sort((a, b) => (this.sample.get(b) ?? 0) - (this.sample.get(a) ?? 0))
    const levels: number[] = []
    const h = parseFloat(keys[0])
    for (const key of keys.slice(1)) {
      const height = parseFloat(key)
      if (height > h) {
        levels.push(height)
      }
    }

    levels.sort((a, b) => a - b)
    this.levels = levels.slice(0, 6)
    this.levels.sort((a, b) => b - a)
  }

  level(height: number): number {
    for (let i = 0; i < this.levels.length; i++) {
      if (height >= this.levels[i]) {
        return i + 1 // 1 ~ 6
      }
    }

    return 0 // not heading
  }
}