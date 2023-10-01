import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { type Context } from 'koa'
import config from 'config'
import { decode, encode } from 'cborg'
import { Xid } from 'xid-ts'
import * as cheerio from 'cheerio'
import createError from 'http-errors'
import { toHTML, type Node } from './tiptap.js'

const indexTpl = readFileSync('./html/index.html', 'utf-8')
const publicationTpl = readFileSync('./html/publication.html', 'utf-8')
const groupTpl = readFileSync('./html/group.html', 'utf-8')
const siteBase = config.get<string>('siteBase')
const writingBase = config.get<string>('writingBase')
const userBase = config.get<string>('userBase')

export async function renderIndex(ctx: Context) {
  const ctxheaders: Record<string, string> = {
    'x-request-id': ctx.get('x-request-id'),
    'x-auth-user': '000000000000000anon0',
    'x-auth-user-rating': ctx.get('x-auth-user-rating'),
    'x-auth-app': ctx.get('x-auth-app'),
    'x-language': ctx.get('x-language'),
  }

  const $ = cheerio.load(indexTpl)

  try {
    const docs = await listIndex(ctxheaders)
    for (const doc of docs) {
      const cid = Xid.fromValue(doc.cid).toString()
      const docUrl = `${siteBase}/pub/${cid}?gid=${Xid.fromValue(
        doc.gid
      ).toString()}`
      $('ul').append(
        `<li><a id="${cid}" href="${docUrl}" target="_blank"></a></li>`
      )
      $(`#${cid}`).text(doc.title)
    }
  } catch (err: any) {
    ctx.status = 404
    const url = ctx.get('x-request-url')
    if (url !== '') {
      $('#content').text(url + ' not found')
    }
  }

  ctx.vary('Accept-Language')
  ctx.type = 'text/html'
  ctx.body = $.html()
}

export async function renderPublication(ctx: Context): Promise<void> {
  const ctxheaders: Record<string, string> = {
    'x-request-id': ctx.get('x-request-id'),
    'x-auth-user': '000000000000000anon0',
    'x-auth-user-rating': ctx.get('x-auth-user-rating'),
    'x-auth-app': ctx.get('x-auth-app'),
    'x-language': ctx.get('x-language'),
  }

  const cid = ctx.params.id as string
  const { gid, language } = ctx.query
  const $ = cheerio.load(publicationTpl)

  try {
    const doc = await getPublication(
      ctxheaders,
      cid,
      (gid ?? '') as string,
      (language ?? '') as string
    )

    const docUrl = `${siteBase}/pub/${Xid.fromValue(doc.cid).toString()}`
    const groupUrl = `${siteBase}/group/${Xid.fromValue(doc.gid).toString()}`
    $('html').prop('lang', doc.language)
    $('meta[property="og:title"]').prop('content', doc.title)
    $('meta[property="og:url"]').prop('content', docUrl)

    $('#title').text(doc.title)
    const authors = $('#authors')
    authors.prop('href', groupUrl)
    authors.text(groupUrl)
    if (doc.authors != null && doc.authors.length > 0) {
      authors.text(doc.authors.join(', '))
    }

    const updated_at = new Date(doc.updated_at).toUTCString()
    $('#updated_time').text(updated_at)
    $('#version').text(doc.version.toString())

    const content = decode(doc.content) as Node
    $('#content').html(
      toHTML(content) +
        `\n<p><a href="${docUrl}" target="_blank">${docUrl}</a></p>`
    )

    ctx.set('last-modified', updated_at)
  } catch (err: any) {
    ctx.status = 404
    const url = ctx.get('x-request-url')
    if (url !== '') {
      $('#content').text(url + ' not found')
    }
  }

  ctx.vary('Accept-Language')
  ctx.type = 'text/html'
  ctx.body = $.html()
}

export async function renderGroup(ctx: Context) {
  const ctxheaders: Record<string, string> = {
    'x-request-id': ctx.get('x-request-id'),
    'x-auth-user': '000000000000000anon0',
    'x-auth-user-rating': ctx.get('x-auth-user-rating'),
    'x-auth-app': ctx.get('x-auth-app'),
    'x-language': ctx.get('x-language'),
  }

  const gid = ctx.params.id as string
  const $ = cheerio.load(groupTpl)

  try {
    const group = await getGroup(ctxheaders, gid)
    const groupUrl = `${siteBase}/group/${Xid.fromValue(group.id).toString()}`
    $('meta[property="og:title"]').prop('content', group.name)
    $('meta[property="og:description"]').prop('content', group.slogan)
    $('meta[property="og:url"]').prop('content', groupUrl)

    $('#group_name').text(group.name)
    $('#group_slogan').text(group.slogan)

    const docs = await listPublications(ctxheaders, Xid.fromValue(group.id))
    for (const doc of docs) {
      const cid = Xid.fromValue(doc.cid).toString()
      const docUrl = `${siteBase}/pub/${cid}?gid=${Xid.fromValue(
        doc.gid
      ).toString()}`
      $('ul').append(
        `<li><a id="${cid}" href="${docUrl}" target="_blank"></a></li>`
      )
      $(`#${cid}`).text(doc.title)
    }
  } catch (err: any) {
    ctx.status = 404
    const url = ctx.get('x-request-url')
    if (url !== '') {
      $('#content').text(url + ' not found')
    }
  }

  ctx.vary('Accept-Language')
  ctx.type = 'text/html'
  ctx.body = $.html()
}

interface GroupInfo {
  id: Uint8Array
  cn: string
  name: string
  logo: string
  slogan: string
  status: number
}

async function getGroup(
  headers: Record<string, string>,
  gid: string
): Promise<GroupInfo> {
  const api = new URL('/v1/group', userBase)
  if (isXid(gid)) {
    api.searchParams.append('id', gid)
  } else {
    api.searchParams.append('cn', gid)
  }

  api.searchParams.append('fields', 'cn,name,status,slogan')

  headers.accept = 'application/cbor'
  const res = await fetch(api, {
    headers,
  })

  if (res.status !== 200) {
    throw createError(res.status, await res.text())
  }

  const data = await res.arrayBuffer()
  const obj = decode(Buffer.from(data))
  return obj.result
}

interface PublicationOutput {
  gid: Uint8Array
  cid: Uint8Array
  language: string
  version: number
  rating?: number
  status: number
  created_at: number
  updated_at: number
  model: string
  original_url?: string
  from_language?: string
  title: string
  cover?: string
  authors?: string[]
  summary?: string
  content: Uint8Array
}

async function getPublication(
  headers: Record<string, string>,
  cid: string,
  gid: string,
  language: string
): Promise<PublicationOutput> {
  const api = new URL('/v1/publication/implicit_get', writingBase)
  api.searchParams.append('cid', cid)
  if (gid !== '') {
    api.searchParams.append('gid', gid)
  }
  if (language !== '') {
    api.searchParams.append('language', language)
  }
  api.searchParams.append('fields', 'title,updated_at,authors,content')

  headers.accept = 'application/cbor'
  const res = await fetch(api, {
    headers,
  })

  if (res.status !== 200) {
    throw createError(res.status, await res.text())
  }

  const data = await res.arrayBuffer()
  const obj = decode(Buffer.from(data))
  return obj.result
}

async function listPublications(
  headers: Record<string, string>,
  gid: Xid
): Promise<PublicationOutput[]> {
  const api = new URL('/v1/publication/list', writingBase)
  headers.accept = 'application/cbor'
  headers['content-type'] = 'application/cbor'
  const res = await fetch(api, {
    method: 'POST',
    headers,
    body: Buffer.from(
      encode({
        gid: gid.toBytes(),
        status: 2,
        fields: ['title', 'updated_at'],
      })
    ),
  })

  if (res.status !== 200) {
    throw createError(res.status, await res.text())
  }

  const data = await res.arrayBuffer()
  const obj = decode(Buffer.from(data))
  return obj.result
}

async function listIndex(
  headers: Record<string, string>
): Promise<PublicationOutput[]> {
  const api = new URL('/v1/search?q=', writingBase)
  headers.accept = 'application/cbor'
  headers['content-type'] = 'application/cbor'
  const res = await fetch(api, {
    headers,
  })

  if (res.status !== 200) {
    throw createError(res.status, await res.text())
  }

  const data = await res.arrayBuffer()
  const obj = decode(Buffer.from(data))
  return obj.result.hits
}

function isXid(id: string): boolean {
  try {
    Xid.parse(id)
    return true
  } catch (e) {}
  return false
}
