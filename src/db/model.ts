import { Buffer } from 'node:buffer'
import createError from 'http-errors'
import { type Client } from 'cassandra-driver'
import { encode } from 'cborg'
import { Xid } from 'xid-ts'

const MAX_CELL_SIZE = 1024 * 1024 - 1 // 1MB

export type Meta = Record<string, string>

export interface Document {
  id: Xid
  url: string
  src: string
  title: string
  meta: Meta
  content: Buffer | null
  html: string
  page: string
}

export class DocumentModel {
  row: Document

  static get columns(): string[] {
    return ['id', 'url', 'src', 'title', 'meta', 'content', 'html', 'page']
  }

  constructor(id?: Xid) {
    if (id == null) {
      id = new Xid()
    }

    this.row = Object.create(null) as Document
    this.row.id = id
    this.row.url = ''
    this.row.src = ''
    this.row.title = ''
    this.row.meta = Object.create(null) as Meta
    this.row.content = null
    this.row.html = ''
    this.row.page = ''
  }

  get isFresh(): boolean {
    return this.row.title !== '' && this.row.id.timestamp() > (Date.now() / 1000 - 3 * 24 * 3600)
  }

  toJSON(): Document {
    return this.row
  }

  setTitle(str: string): void {
    if (str.includes('\n')) {
      str = str.replace(/\n/g, ' ')
    }
    this.row.title = str.trim()
  }

  setMeta(meta: Meta): void {
    if (meta != null && typeof meta === 'object') {
      this.row.meta = meta
    }
  }

  setContent(obj: object): void {
    this.row.content = encode(obj)
  }

  setHTML(str: string): void {
    this.row.html = str.trim()
  }

  setPage(str: string): void {
    this.row.page = str.trim()
  }

  async fill(cli: Client, selectColumns: string[] = ['url', 'src', 'title', 'meta', 'content', 'html', 'page']): Promise<void> {
    const query = `SELECT ${selectColumns.join(',')} FROM doc WHERE id=? LIMIT 1`
    const params = [Buffer.from(this.row.id)] // find the document in a hour.

    const result = await cli.execute(query, params, { prepare: true })
    const row = result.first()
    if (row == null) {
      const name = this.row.src !== '' ? this.row.src : this.row.id.toString()
      throw createError(404, `fill document ${name} not found`, { expose: true })
    }

    // @ts-expect-error: should ignore
    row.forEach((value, name) => {
      // @ts-expect-error: should ignore
      // @typescript-eslint/no-unsafe-assignment: should ignore
      this.row[name as string] = value
    })
  }

  async acquire(cli: Client): Promise<boolean> {
    const query = 'INSERT INTO doc (id,url) VALUES (?,?) IF NOT EXISTS USING TTL 60'
    const params = [Buffer.from(this.row.id), this.row.url]

    const result = await cli.execute(query, params, { prepare: true })
    const row = result.first()
    if (row == null) {
      const name = this.row.src !== '' ? this.row.src : this.row.id.toString()
      throw createError(500, `acquire document ${name} no result`)
    }

    return row.get('[applied]') as boolean
  }

  async release(cli: Client): Promise<void> {
    const query = 'DELETE FROM doc WHERE id=?'
    const params = [Buffer.from(this.row.id)]

    await cli.execute(query, params, { prepare: true })
  }

  async save(cli: Client): Promise<void> {
    if (this.row.content == null) {
      throw new Error('Document content is null')
    }

    if (Buffer.byteLength(this.row.page, 'utf8') > MAX_CELL_SIZE || this.row.content.length > MAX_CELL_SIZE) {
      throw createError(400, `document ${this.row.src} is too large`)
    }

    const columns = DocumentModel.columns
    const query = `INSERT INTO doc (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) USING TTL 0`

    // @ts-expect-error: should ignore
    const params = columns.map((c) => this.row[c])
    params[0] = Buffer.from(this.row.id)

    await cli.execute(query, params, { prepare: true })
  }

  static async findLatest(cli: Client, url: string): Promise<DocumentModel> {
    const query = 'SELECT id,title FROM doc WHERE url=? LIMIT 100'
    const params = [url]

    const result = await cli.execute(query, params, { prepare: true })
    const doc = new DocumentModel()
    doc.row.url = url

    result.rows.sort((a, b) => {
      const aId = Xid.fromValue(a.get('id') as Buffer)
      const bId = Xid.fromValue(b.get('id') as Buffer)
      for (let i = 0; i < aId.length; i++) {
        if (aId[i] < bId[i]) {
          return 1
        } else if (aId[i] > bId[i]) {
          return -1
        }
        continue
      }
      return 0
      // return bId.compare(aId)
    })

    const rows = result.rows.filter((row) => row.get('title') != null)
    const row = rows.length > 0 ? rows[0] : null
    if (row != null) {
      doc.row.id = Xid.fromValue(row.get('id') as Buffer)
      doc.row.title = row.get('title') as string
    }
    return doc
  }
}
