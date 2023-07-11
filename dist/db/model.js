import { Buffer } from 'node:buffer';
import createError from 'http-errors';
import { types } from 'cassandra-driver';
import Long from 'long';
import { Request } from '@crawlee/core';
import { encode } from 'cbor-x';
const { createHash } = await import('node:crypto');
const MAX_CELL_SIZE = 1024 * 1024 - 1; // 1MB
// @ts-expect-error: should ignore
if (BigInt.prototype.toJSON == null) {
    /* eslint no-extend-native: ["error", { "exceptions": ["BigInt"] }] */
    // @ts-expect-error: should ignore
    BigInt.prototype.toJSON = function () {
        return this.toString();
    };
}
export class Document {
    id;
    row;
    static fromUrl(url) {
        const doc = new Document();
        const req = new Request({ url });
        sha1(req.uniqueKey).copy(doc.id);
        doc.row.at = types.Long.fromInt(Math.floor(Date.now() / 1000));
        doc.row.url = req.uniqueKey;
        doc.row.src = url;
        doc._fillAt();
        return doc;
    }
    static fromId(id) {
        const doc = new Document();
        id.copy(doc.id);
        const bytes = new Array(8);
        for (let i = 0; i < 8; i++) {
            bytes[i] = doc.id[20 + i];
        }
        // types.Long is a old version of Long
        doc.row.at = types.Long.fromValue(Long.fromBytesBE(bytes));
        return doc;
    }
    constructor() {
        this.id = Buffer.alloc(28);
        this.row = Object.create(null);
        this.row.hid = this.id.slice(0, 20);
        this.row.at = types.Long.fromInt(0);
        this.row.url = '';
        this.row.src = '';
        this.row.title = '';
        this.row.meta = {};
        this.row.cbor = null;
        this.row.html = '';
        this.row.page = '';
    }
    get isFresh() {
        return this.row.title !== '' && this.row.at.gt(Math.floor(Date.now() / 1000) - 3600);
    }
    toJSON() {
        return {
            hid: this.row.hid,
            at: BigInt(this.row.at.toString()),
            url: this.row.url,
            src: this.row.src,
            title: this.row.title,
            meta: this.row.meta,
            cbor: this.row.cbor,
            html: this.row.html,
            page: this.row.page
        };
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
    setCBOR(json) {
        this.row.cbor = encode(json);
    }
    setHTML(str) {
        this.row.html = str.trim();
    }
    setPage(str) {
        this.row.page = str.trim();
    }
    _fillAt() {
        const bytes = Long.fromValue(this.row.at).toBytesBE();
        for (let i = 0; i < 8; i++) {
            this.id[20 + i] = bytes[i];
        }
    }
    async fill(cli, selectColumns = ['url', 'src', 'title', 'meta', 'cbor', 'html', 'page']) {
        const query = `SELECT ${selectColumns.join(',')} FROM doc WHERE hid=? AND at=? LIMIT 1`;
        const params = [this.row.hid, this.row.at]; // find the document in a hour.
        const result = await cli.execute(query, params, { prepare: true });
        const row = result.first();
        if (row == null) {
            const name = this.row.src !== '' ? this.row.src : this.id.toString('base64url');
            throw createError(404, `fill document ${name} at ${this.row.at.toString()} not found`, { expose: true });
        }
        // @ts-expect-error: should ignore
        row.forEach((value, name) => {
            // @ts-expect-error: should ignore
            this.row[name] = value;
        });
    }
    async acquire(cli) {
        const query = 'INSERT INTO doc (hid,at,url) VALUES (?,?,?) IF NOT EXISTS USING TTL 60';
        const params = [this.row.hid, this.row.at, this.row.url];
        const result = await cli.execute(query, params, { prepare: true });
        const row = result.first();
        if (row == null) {
            const name = this.row.src !== '' ? this.row.src : this.id.toString('base64url');
            throw createError(500, `acquire document ${name} at ${this.row.at.toString()} no result`);
        }
        return row.get('[applied]');
    }
    async release(cli) {
        const query = 'DELETE FROM doc WHERE hid=? AND at=?';
        const params = [this.row.hid, this.row.at];
        await cli.execute(query, params, { prepare: true });
    }
    async save(cli) {
        if (this.row.cbor == null) {
            throw new Error('Document cbor is null');
        }
        if (Buffer.byteLength(this.row.page, 'utf8') > MAX_CELL_SIZE || this.row.cbor.length > MAX_CELL_SIZE) {
            throw createError(400, `document ${this.row.src} is too large`);
        }
        const columns = Document.columns;
        const query = `INSERT INTO doc (${columns.join(',')}) VALUES (${columns.map((c) => '?').join(',')}) USING TTL 0`;
        // @ts-expect-error: should ignore
        const params = columns.map((c) => this.row[c]);
        await cli.execute(query, params, { prepare: true });
    }
    static async findLatest(cli, url) {
        const doc = Document.fromUrl(url);
        const query = 'SELECT at,title FROM doc WHERE hid=? LIMIT 1';
        const params = [doc.row.hid];
        const result = await cli.execute(query, params, { prepare: true });
        const row = result.first();
        if (row != null) {
            doc.row.at = row.get('at');
            doc.row.title = row.get('title');
            doc._fillAt();
        }
        return doc;
    }
    static tableName = 'art';
    static get columns() {
        return ['hid', 'at', 'url', 'src', 'title', 'meta', 'cbor', 'html', 'page'];
    }
}
function sha1(str) {
    const hash = createHash('sha1');
    hash.update(str, 'utf8');
    return hash.digest();
}
