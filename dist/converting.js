import { encode } from 'cborg';
import createError from 'http-errors';
import { marked } from 'marked';
import pdfjs from 'pdfjs-dist';
import { parseHTML, JSONDocumentAmender } from './tiptap.js';
export function getConverter(mime) {
    switch (mime) {
        case 'text/html':
            return convertHtml;
        case 'text/markdown':
            return convertMarkdown;
        case 'text/x-markdown':
            return convertMarkdown;
        case 'application/pdf':
            return convertPdf;
        case 'application/x-pdf':
            return convertPdf;
        case 'text/plain':
            return convertText;
        default:
            throw createError(400, 'not implemented: ' + mime);
    }
}
function convertHtml(buf) {
    const html = buf.toString('utf8');
    const doc = parseHTML(html);
    return Promise.resolve(Buffer.from(encode(doc)));
}
function convertMarkdown(buf) {
    const html = marked.parse(buf.toString('utf8'));
    const doc = parseHTML(html);
    return Promise.resolve(Buffer.from(encode(doc)));
}
async function convertPdf(buf) {
    const doc = await pdfjs.getDocument(new Uint8Array(buf)).promise;
    const node = Object.create(null);
    node.type = 'doc';
    node.content = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const hl = new HeadingLevel();
        for (let item of content.items) {
            item = item;
            if (item.height > 0) {
                hl.add(item.height);
            }
        }
        hl.finalize();
        let texts = [];
        let height = 0;
        for (let item of content.items) {
            item = item;
            if (item.str == null) {
                continue;
            }
            let text = item.str;
            if (item.dir === 'ttb') {
                text = text.replace(/\n/g, ' ');
            }
            if (text !== '') {
                texts.push(text);
            }
            if (item.height > height) {
                height = item.height;
            }
            if (item.hasEOL) {
                const level = hl.level(height);
                if (level == 0) {
                    node.content.push({
                        type: 'paragraph',
                        content: [{
                                type: 'text',
                                text: texts.join('')
                            }]
                    });
                }
                else {
                    node.content.push({
                        type: "heading",
                        attrs: {
                            id: null,
                            level,
                        },
                        content: [{
                                type: 'text',
                                text: texts.join('')
                            }]
                    });
                }
                texts = [];
                height = 0;
            }
        }
        if (texts.length > 0) {
            node.content.push({
                type: 'paragraph',
                content: [{
                        type: 'text',
                        text: texts.join('')
                    }]
            });
        }
        page.cleanup();
    }
    const amender = new JSONDocumentAmender();
    return Promise.resolve(Buffer.from(encode(amender.amendNode(node))));
}
function convertText(buf) {
    const texts = buf.toString('utf8').split(/\r\n|\r|\n/);
    const node = Object.create(null);
    node.type = 'doc';
    node.content = [];
    for (const text of texts) {
        const txt = text.trim();
        if (txt.length === 0) {
            continue;
        }
        node.content.push({
            type: 'paragraph',
            content: [{
                    type: 'text',
                    text: txt
                }]
        });
    }
    const amender = new JSONDocumentAmender();
    return Promise.resolve(Buffer.from(encode(amender.amendNode(node))));
}
export class HeadingLevel {
    sample;
    levels;
    constructor() {
        this.sample = new Map();
        this.levels = [];
    }
    add(height) {
        const key = (height - 0.01).toFixed(2);
        let count = this.sample.get(key) ?? 0;
        count += 1;
        this.sample.set(key, count);
    }
    finalize() {
        const keys = Array.from(this.sample.keys());
        if (keys.length === 0) {
            return [];
        }
        keys.sort((a, b) => (this.sample.get(b) ?? 0) - (this.sample.get(a) ?? 0));
        const levels = [];
        const h = parseFloat(keys[0]);
        for (const key of keys.slice(1)) {
            const height = parseFloat(key);
            if (height > h) {
                levels.push(height);
            }
        }
        levels.sort((a, b) => a - b);
        this.levels = levels.slice(0, 6);
        this.levels.sort((a, b) => b - a);
    }
    level(height) {
        for (let i = 0; i < this.levels.length; i++) {
            if (height >= this.levels[i]) {
                return i + 1; // 1 ~ 6
            }
        }
        return 0; // not heading
    }
}
