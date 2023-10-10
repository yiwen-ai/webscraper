// import { writeFileSync } from 'node:fs'
import { nanoid } from 'nanoid';
// import { generateJSON, generateHTML } from '@tiptap/html'
import { generateJSON, generateHTML } from './html.js';
import { StarterKit } from '@tiptap/starter-kit';
import { Color } from '@tiptap/extension-color';
import { Image } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { Mention } from '@tiptap/extension-mention';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Typography } from '@tiptap/extension-typography';
import { Underline } from '@tiptap/extension-underline';
import { Youtube } from '@tiptap/extension-youtube';
import { Details } from '@tiptap-pro/extension-details';
import { DetailsSummary } from '@tiptap-pro/extension-details-summary';
import { DetailsContent } from '@tiptap-pro/extension-details-content';
import { Emoji, emojis } from '@tiptap-pro/extension-emoji';
import { UniqueID } from '@tiptap-pro/extension-unique-id';
import { Mathematics } from '@tiptap-pro/extension-mathematics';
// import { writeFileSync } from 'node:fs'
const uidTypes = [
    'blockquote',
    'codeBlock',
    'detailsSummary',
    'detailsContent',
    'heading',
    'listItem',
    'paragraph',
    'tableHeader',
    'tableCell',
    'taskItem',
];
const tiptapExtensions = [
    Details.configure({
        persist: true,
    }),
    DetailsSummary,
    DetailsContent,
    Emoji.configure({
        enableEmoticons: true,
        emojis: [...emojis],
    }),
    Color,
    Image,
    Link.configure({
        protocols: [],
        autolink: false,
        linkOnPaste: true,
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
        validate: (href) => (href ? href.startsWith('https://') : false),
    }),
    Mathematics.configure({ katexOptions: { strict: false } }),
    Mention,
    StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
    }),
    Subscript,
    Superscript,
    Table,
    TableCell,
    TableHeader,
    TableRow,
    TaskItem.configure({
        nested: true,
    }),
    TaskList,
    TextAlign.configure({
        types: [
            'heading',
            'paragraph',
            'codeBlock',
            'blockquote',
            'table',
            'tableCell',
        ],
    }),
    TextStyle,
    Typography,
    Underline,
    UniqueID.configure({
        attributeName: 'id',
        types: uidTypes,
        generateID: () => nanoid(6),
    }),
    Youtube.configure({
        inline: false,
    }),
];
export class JSONDocumentAmender {
    ids;
    constructor() {
        this.ids = new Set();
    }
    amendId(id) {
        if (typeof id !== 'string' || id === '') {
            id = nanoid(6);
        }
        while (this.ids.has(id)) {
            id = nanoid(6);
        }
        this.ids.add(id);
        return id;
    }
    // https://prosemirror.net/docs/ref/#model.Document_Structure
    amendNode(node) {
        if (!node || node.type === 'invalid') {
            return;
        }
        if (node.type === 'image' && !node.attrs?.src) {
            node.type = 'invalid';
            return node;
        }
        if (node.type === 'paragraph' &&
            (!node.content?.length ||
                (node.content.length == 1 && node.content[0].type === 'hardBreak'))) {
            node.type = 'invalid';
            return node;
        }
        // attrs: Attrs
        if (uidTypes.includes(node.type) && node.attrs == null) {
            node.attrs = { id: this.amendId('') };
        }
        else if (node.attrs != null) {
            // tiptap BUG: generateJSON reuses some attrs object, we need to clone a new one.
            node.attrs = Object.assign({}, node.attrs);
            if (uidTypes.includes(node.type)) {
                node.attrs.id = this.amendId(node.attrs.id);
            }
        }
        // marks: Mark[]
        if (node.marks != null) {
            for (const mark of node.marks) {
                if (mark.type === 'link' && mark.attrs != null) {
                    delete mark.attrs.class;
                    mark.attrs.rel = 'noopener noreferrer';
                    mark.attrs.target = '_blank';
                }
            }
        }
        // content: Node[]
        if (node.content != null) {
            for (const child of node.content) {
                this.amendNode(child);
            }
            node.content = node.content.filter((child) => child.type !== 'invalid');
        }
        return node;
    }
}
export function parseHTML(html) {
    const jsonDoc = generateJSON(html, tiptapExtensions);
    const amender = new JSONDocumentAmender();
    return amender.amendNode(jsonDoc);
}
export function toHTML(doc) {
    return generateHTML(doc, tiptapExtensions);
}
export function findTitle(doc, level) {
    if (doc.type === 'heading') {
        if (doc.attrs.level === level && doc.content != null) {
            const texts = [];
            for (const child of doc.content) {
                if (child.type === 'text') {
                    texts.push(child.text);
                }
            }
            return texts.join(' ');
        }
    }
    else if (doc.content != null) {
        for (const child of doc.content) {
            const title = findTitle(child, level);
            if (title !== '') {
                return title;
            }
        }
    }
    return '';
}
