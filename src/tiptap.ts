// import { writeFileSync } from 'node:fs'
import { nanoid } from 'nanoid'
// import { generateJSON, generateHTML } from '@tiptap/html'
import { generateJSON, generateHTML } from './html.js'
import Color from '@tiptap/extension-color'
import Bold from '@tiptap/extension-bold'
import Document from '@tiptap/extension-document'
import Blockquote from '@tiptap/extension-blockquote'
import Code from '@tiptap/extension-code'
import CodeBlock from '@tiptap/extension-code-block'
import FontFamily from '@tiptap/extension-font-family'
import HardBreak from '@tiptap/extension-hard-break'
import Heading from '@tiptap/extension-heading'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Image from '@tiptap/extension-image'
import Italic from '@tiptap/extension-italic'
import Link from '@tiptap/extension-link'
import ListItem from '@tiptap/extension-list-item'
import Mention from '@tiptap/extension-mention'
import OrderedList from '@tiptap/extension-ordered-list'
import Paragraph from '@tiptap/extension-paragraph'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Table from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Text from '@tiptap/extension-text'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import Typography from '@tiptap/extension-typography'
import Underline from '@tiptap/extension-underline'
import Youtube from '@tiptap/extension-youtube'

import { Details } from '@tiptap-pro/extension-details'
import { DetailsSummary } from '@tiptap-pro/extension-details-summary'
import { DetailsContent } from '@tiptap-pro/extension-details-content'
import { Emoji, emojis } from '@tiptap-pro/extension-emoji'
import { UniqueID } from '@tiptap-pro/extension-unique-id'
import { Mathematics } from '@tiptap-pro/extension-mathematics'

// import { writeFileSync } from 'node:fs'

const uidTypes = ['blockquote', 'codeBlock', 'detailsSummary', 'detailsContent', 'heading', 'listItem', 'paragraph', 'tableHeader', 'tableCell']
const tiptapExtensions = [
  Document,
  Details.configure({
    persist: true
  }),
  DetailsSummary,
  DetailsContent,
  Emoji.configure({
    enableEmoticons: true,
    emojis: [
      ...emojis
    ]
  }),
  Color,
  Bold,
  Blockquote,
  Code,
  CodeBlock,
  FontFamily,
  HardBreak,
  Heading,
  HorizontalRule,
  Image,
  Italic,
  Link.configure({
    openOnClick: false,
    linkOnPaste: false,
    autolink: false,
    validate: isValidHref,
    HTMLAttributes: {
      rel: '',
      target: ''
    }
  }),
  ListItem,
  Mathematics,
  Mention,
  OrderedList,
  Paragraph,
  Subscript,
  Superscript,
  Table,
  TableCell,
  TableHeader,
  TableRow,
  TaskItem.configure({
    nested: true
  }),
  TaskList,
  Text,
  TextAlign,
  TextStyle,
  Typography,
  Underline,
  UniqueID.configure({
    attributeName: "id",
    types: uidTypes,
    generateID: () => nanoid(6)
  }),
  Youtube.configure({
    inline: false
  })
]

export interface PartialNode {
  type: string
  attrs?: any
  text?: string
}

export interface Node extends PartialNode {
  marks?: PartialNode[]
  content?: Node[]
}

export class JSONDocumentAmender {
  ids: Set<string>

  constructor() {
    this.ids = new Set()
  }

  amendId(id: string): string {
    if (typeof id !== 'string' || id === '') {
      id = nanoid(6)
    }

    while (this.ids.has(id)) {
      id = nanoid(6)
    }
    this.ids.add(id)
    return id
  }

  // https://prosemirror.net/docs/ref/#model.Document_Structure
  amendNode(node: Node): any {
    // attrs: Attrs
    if (uidTypes.includes(node.type) && node.attrs == null) {
      node.attrs = { id: this.amendId('') }
    } else if (node.attrs != null) {
      // tiptap BUG: generateJSON reuses some attrs object, we need to clone a new one.
      node.attrs = Object.assign({}, node.attrs)
      if (uidTypes.includes(node.type)) {
        node.attrs.id = this.amendId(node.attrs.id)
      }
    }

    // marks: Mark[]
    if (node.marks != null) {
      for (const mark of node.marks) {
        if (mark.type === 'link' && mark.attrs != null) {
          delete mark.attrs.class

          if (isSameOriginHref(mark.attrs.href)) {
            delete mark.attrs.target
          } else {
            mark.attrs.rel = 'noopener noreferrer'
            mark.attrs.target = '_blank'
          }
        }
      }
    }

    // content: Node[]
    if (node.content != null) {
      for (const child of node.content) {
        this.amendNode(child)
      }
    }

    return node
  }
}

export function parseHTML(html: string): Node {
  const jsonDoc = generateJSON(html, tiptapExtensions)
  const amender = new JSONDocumentAmender()
  return amender.amendNode(jsonDoc as Node)
}

export function toHTML(doc: Node): string {
  return generateHTML(doc, tiptapExtensions)
}

const LOCALHOST = 'https://localhost'
function isSameOriginHref(href: string): boolean {
  if (typeof href === 'string') {
    try {
      const url = new URL(href, LOCALHOST)
      return url.origin === LOCALHOST
    } catch (e) { }
  }
  return false
}
function isValidHref(href: string): boolean {
  if (typeof href === 'string') {
    try {
      const url = new URL(href, LOCALHOST)
      return url.protocol === 'https:' || url.protocol === 'mailto:'
    } catch (e) { }
  }
  return false
}
