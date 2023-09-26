import { type Extensions, getSchema, type JSONContent } from '@tiptap/core'
import { Node, DOMParser, DOMSerializer, type Schema } from '@tiptap/pm/model'
import { vdom, createHTMLDocument, type VHTMLDocument } from 'zeed-dom'

export function generateJSON(
  html: string,
  extensions: Extensions
): Record<string, any> {
  const schema = getSchema(extensions)
  const dom = vdom(html) as any

  return DOMParser.fromSchema(schema).parse(dom).toJSON()
}

export function generateHTML(doc: JSONContent, extensions: Extensions): string {
  const schema = getSchema(extensions)
  const contentNode = Node.fromJSON(schema, doc)

  return getHTMLFromFragment(contentNode, schema)
}

export function getHTMLFromFragment(doc: Node, schema: Schema): string {
  const document = DOMSerializer.fromSchema(schema).serializeFragment(
    doc.content,
    {
      document: createHTMLDocument() as unknown as Document,
    }
  ) as unknown as VHTMLDocument

  return document.render()
}
