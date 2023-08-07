import { encode } from 'cborg';
import createError from 'http-errors';
import { marked } from 'marked';
// import { getDocument } from 'pdfjs-dist'
// import { type TextItem } from 'pdfjs-dist/types/src/display/api'
import { parseHTML, JSONDocumentAmender } from './tiptap.js';
export function getConverter(mime) {
    switch (mime) {
        case 'text/html':
            return convertHtml;
        case 'text/markdown':
            return convertMarkdown;
        case 'text/x-markdown':
            return convertMarkdown;
        // case 'application/pdf':
        //   return convertPdf
        // case 'application/x-pdf':
        //   return convertPdf
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
// async function convertPdf(buf: Buffer): Promise<Buffer> {
//   const doc = await getDocument(buf).promise
//   const node: Node = Object.create(null)
//   node.type = 'doc'
//   node.content = []
//   for (let i = 1; i <= doc.numPages; i++) {
//     const page = await doc.getPage(i)
//     const content = await page.getTextContent()
//     let child: Node = Object.create(null)
//     child.type = 'paragraph'
//     child.content = []
//     for (let item of content.items) {
//       item = item as TextItem
//       if (item.str == null || item.str.length === 0) {
//         continue
//       }
//       let text = item.str
//       if (item.dir === 'ttb') {
//         text = text.replace(/\n/g, ' ')
//       }
//       child.content.push({
//         type: 'text',
//         text
//       })
//       if (item.hasEOL) {
//         node.content.push(child)
//         child = Object.create(null)
//         child.type = 'paragraph'
//         child.content = []
//       }
//     }
//     if (child.content.length > 0) {
//       node.content.push(child)
//     }
//     page.cleanup()
//   }
//   const amender = new JSONDocumentAmender()
//   return Promise.resolve(Buffer.from(encode(amender.amendNode(node))))
// }
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
