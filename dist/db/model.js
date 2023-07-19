import { Buffer } from 'node:buffer';
import createError from 'http-errors';
import { encode } from 'cbor-x';
import { Xid } from 'xid-ts';
const MAX_CELL_SIZE = 1024 * 1024 - 1; // 1MB
export class DocumentModel {
    row;
    static get columns() {
        return ['id', 'url', 'src', 'title', 'meta', 'content', 'html', 'page'];
    }
    constructor(id) {
        if (id == null) {
            id = new Xid();
        }
        this.row = Object.create(null);
        this.row.id = id;
        this.row.url = '';
        this.row.src = '';
        this.row.title = '';
        this.row.meta = Object.create(null);
        this.row.content = null;
        this.row.html = '';
        this.row.page = '';
    }
    get isFresh() {
        return this.row.title !== '' && this.row.id.timestamp() > (Date.now() / 1000 - 24 * 3600);
    }
    toJSON() {
        return this.row;
    }
    setTitle(str) {
        if (str.includes('\n')) {
            str = str.replace(/\n/g, ' ');
        }
        this.row.title = str.trim();
    }
    setMeta(meta) {
        if (meta != null && typeof meta === 'object') {
            this.row.meta = meta;
        }
    }
    setContent(obj) {
        this.row.content = encode(obj);
    }
    setHTML(str) {
        this.row.html = str.trim();
    }
    setPage(str) {
        this.row.page = str.trim();
    }
    async fill(cli, selectColumns = ['url', 'src', 'title', 'meta', 'content', 'html', 'page']) {
        const query = `SELECT ${selectColumns.join(',')} FROM doc WHERE id=? LIMIT 1`;
        const params = [Buffer.from(this.row.id)]; // find the document in a hour.
        const result = await cli.execute(query, params, { prepare: true });
        const row = result.first();
        if (row == null) {
            const name = this.row.src !== '' ? this.row.src : this.row.id.toString();
            throw createError(404, `fill document ${name} not found`, { expose: true });
        }
        // @ts-expect-error: should ignore
        row.forEach((value, name) => {
            // @ts-expect-error: should ignore
            // @typescript-eslint/no-unsafe-assignment: should ignore
            this.row[name] = value;
        });
    }
    async acquire(cli) {
        const query = 'INSERT INTO doc (id,url) VALUES (?,?) IF NOT EXISTS USING TTL 60';
        const params = [Buffer.from(this.row.id), this.row.url];
        const result = await cli.execute(query, params, { prepare: true });
        const row = result.first();
        if (row == null) {
            const name = this.row.src !== '' ? this.row.src : this.row.id.toString();
            throw createError(500, `acquire document ${name} no result`);
        }
        return row.get('[applied]');
    }
    async release(cli) {
        const query = 'DELETE FROM doc WHERE id=?';
        const params = [Buffer.from(this.row.id)];
        await cli.execute(query, params, { prepare: true });
    }
    async save(cli) {
        if (this.row.content == null) {
            throw new Error('Document content is null');
        }
        if (Buffer.byteLength(this.row.page, 'utf8') > MAX_CELL_SIZE || this.row.content.length > MAX_CELL_SIZE) {
            throw createError(400, `document ${this.row.src} is too large`);
        }
        const columns = DocumentModel.columns;
        const query = `INSERT INTO doc (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) USING TTL 0`;
        // @ts-expect-error: should ignore
        const params = columns.map((c) => this.row[c]);
        params[0] = Buffer.from(this.row.id);
        await cli.execute(query, params, { prepare: true });
    }
    static async findLatest(cli, url) {
        const query = 'SELECT id,title FROM doc WHERE url=? LIMIT 100';
        const params = [url];
        const result = await cli.execute(query, params, { prepare: true });
        const doc = new DocumentModel();
        doc.row.url = url;
        result.rows.sort((a, b) => {
            const aId = Xid.fromValue(a.get('id'));
            const bId = Xid.fromValue(b.get('id'));
            for (let i = 0; i < aId.length; i++) {
                if (aId[i] < bId[i]) {
                    return 1;
                }
                else if (aId[i] > bId[i]) {
                    return -1;
                }
                continue;
            }
            return 0;
            // return bId.compare(aId)
        });
        const rows = result.rows.filter((row) => row.get('title') != null);
        const row = rows.length > 0 ? rows[0] : null;
        if (row != null) {
            doc.row.id = Xid.fromValue(row.get('id'));
            doc.row.title = row.get('title');
        }
        return doc;
    }
}
