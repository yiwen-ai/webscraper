import { getSchema } from '@tiptap/core';
import { Node, DOMParser, DOMSerializer } from '@tiptap/pm/model';
import { vdom, createHTMLDocument } from '@yiwen-ai/zeed-dom';
export function generateJSON(html, extensions) {
    const schema = getSchema(extensions);
    const dom = vdom(html);
    return DOMParser.fromSchema(schema).parse(dom).toJSON();
}
export function generateHTML(doc, extensions) {
    const schema = getSchema(extensions);
    const contentNode = Node.fromJSON(schema, doc);
    return getHTMLFromFragment(contentNode, schema);
}
export function getHTMLFromFragment(doc, schema) {
    const document = DOMSerializer.fromSchema(schema).serializeFragment(doc.content, {
        document: createHTMLDocument()
    });
    return document.render();
}
