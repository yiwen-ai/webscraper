import { nanoid } from 'nanoid';
import { generateJSON, generateHTML } from '@tiptap/html';
import Color from '@tiptap/extension-color';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import Blockquote from '@tiptap/extension-blockquote';
import Code from '@tiptap/extension-code';
import CodeBlock from '@tiptap/extension-code-block';
import FontFamily from '@tiptap/extension-font-family';
import HardBreak from '@tiptap/extension-hard-break';
import Heading from '@tiptap/extension-heading';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Image from '@tiptap/extension-image';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import ListItem from '@tiptap/extension-list-item';
import Mention from '@tiptap/extension-mention';
import OrderedList from '@tiptap/extension-ordered-list';
import Paragraph from '@tiptap/extension-paragraph';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import Text from '@tiptap/extension-text';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import Youtube from '@tiptap/extension-youtube';
import { Details } from '@tiptap-pro/extension-details';
import { DetailsSummary } from '@tiptap-pro/extension-details-summary';
import { DetailsContent } from '@tiptap-pro/extension-details-content';
import { Emoji, emojis } from '@tiptap-pro/extension-emoji';
import { UniqueID } from '@tiptap-pro/extension-unique-id';
import { Mathematics } from '@tiptap-pro/extension-mathematics';
// import { writeFileSync } from 'node:fs'
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
        types: ['blockquote', 'codeBlock', 'detailsSummary', 'detailsContent', 'heading', 'listItem', 'paragraph', 'tableHeader', 'tableCell']
    }),
    Youtube.configure({
        inline: false
    })
];
class JSONDocumentAmender {
    ids;
    constructor() {
        this.ids = new Set();
    }
    amendId(id) {
        if (typeof id === 'string' && id !== '') {
            this.ids.add(id);
        }
        else {
            id = nanoid(6);
            while (this.ids.has(id)) {
                id = nanoid(6);
            }
            this.ids.add(id);
        }
        return id;
    }
    // https://prosemirror.net/docs/ref/#model.Document_Structure
    amendNode(node) {
        // attrs: Attrs
        if (node.attrs != null) {
            // tiptap BUG: generateJSON reuses some attrs object, we need to clone a new one.
            node.attrs = Object.assign({}, node.attrs);
            if (Object.hasOwn(node.attrs, 'id')) {
                node.attrs.id = this.amendId(node.attrs.id);
            }
        }
        // marks: Mark[]
        if (node.marks != null) {
            for (const mark of node.marks) {
                if (mark.type === 'link' && mark.attrs != null) {
                    delete mark.attrs.class;
                    if (isSameOriginHref(mark.attrs.href)) {
                        delete mark.attrs.target;
                    }
                    else {
                        mark.attrs.rel = 'noopener noreferrer';
                        mark.attrs.target = '_blank';
                    }
                }
            }
        }
        // content: Node[]
        if (node.content != null) {
            for (const child of node.content) {
                this.amendNode(child);
            }
        }
        return node;
    }
}
export function parseHTMLDocument(html) {
    // writeFileSync('./debug/test-s.html', html, 'utf8')
    // some error: "_a.startsWith is not a function"
    // https://discuss.prosemirror.net/t/is-there-a-way-to-run-prosemirror-on-nodejs/2517/8
    const jsonDoc = generateJSON(html, tiptapExtensions);
    const amender = new JSONDocumentAmender();
    const htmlDoc = generateHTML(amender.amendNode(jsonDoc), tiptapExtensions);
    // writeFileSync('./debug/test.html', htmlDoc, 'utf8')
    // writeFileSync('./debug/test.json', JSON.stringify(jsonDoc), 'utf8')
    return {
        json: jsonDoc,
        html: htmlDoc
    };
}
const LOCALHOST = 'https://localhost';
function isSameOriginHref(href) {
    if (typeof href === 'string') {
        try {
            const url = new URL(href, LOCALHOST);
            return url.origin === LOCALHOST;
        }
        catch (e) { }
    }
    return false;
}
function isValidHref(href) {
    if (typeof href === 'string') {
        try {
            const url = new URL(href, LOCALHOST);
            return url.protocol === 'https:' || url.protocol === 'mailto:';
        }
        catch (e) { }
    }
    return false;
}