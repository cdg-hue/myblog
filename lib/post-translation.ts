import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import TurndownService from 'turndown'
import type { Language } from '@/lib/i18n'

export interface TranslationSegment {
  id: string
  text: string
}

export interface TranslationCandidate {
  title: string
  description: string | null
  html: string
  content: string
}

export interface TranslationSnapshot {
  id: number
  slug: string
  title: string
  content: string
  html: string
  description: string | null
  language?: Language
  translation_group_id?: string | null
  status: string
  deleted_at?: number | null
  password?: string | null
  is_hidden?: number
  is_pinned?: number
  category?: string | null
  cover_image?: string | null
  tags?: string[]
  published_at?: number
  updated_at?: number
  view_count?: number
}

type TextPart = { id?: string; before: string; after: string }
type TextReplacement = { start: number; end: number; parts: TextPart[] }

export interface TranslationDocument {
  html: string
  chunks: TranslationSegment[][]
  title: TextPart[]
  description: TextPart[] | null
  replacements: TextReplacement[]
}

const MAX_HTML_LENGTH = 500_000
const MAX_TEXT_LENGTH = 120_000
const MAX_SEGMENTS = 4000
const PART_LENGTH = 900
const CHUNK_LENGTH = 2000
const PROTECTED_TAGS = new Set([
  'pre', 'code', 'script', 'style', 'iframe', 'embed', 'object', 'video', 'audio',
  'svg', 'math', 'template', 'noscript', 'textarea', 'plaintext', 'form', 'title',
])
const INLINE_RESOURCE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'del', 'dfn', 'em', 'i', 'img', 'ins',
  'kbd', 'label', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
])

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function isProtectedElement(node: DefaultTreeAdapterMap['element']): boolean {
  if (PROTECTED_TAGS.has(node.tagName)) return true
  const attrs = Object.fromEntries(node.attrs.map(attribute => [attribute.name, attribute.value]))
  return attrs.contenteditable === 'false'
    || attrs.translate === 'no'
    || Object.hasOwn(attrs, 'download')
    || /attachment|embed|youtube|file[-_]?attachment/i.test(attrs['data-type'] || attrs['data-node-type'] || '')
    || /(?:twitter-tweet|instagram-media|tiktok-embed)/.test(attrs.class || '')
    || (node.tagName === 'a' && /(?:\/files\/|\.(?:pdf|zip|rar|7z|epub|docx?|xlsx?|pptx?)(?:[?#]|$))/i.test(attrs.href || ''))
}

export function createTranslationDocument(
  source: Pick<TranslationSnapshot, 'title' | 'description' | 'html' | 'content'>,
): TranslationDocument {
  const html = source.html || `<p>${escapeText(source.content)}</p>`
  if (html.length > MAX_HTML_LENGTH) throw new Error('文章 HTML 过长，请拆分文章后翻译')
  const segments: TranslationSegment[] = []
  let textLength = 0

  const split = (value: string, prefix: string): TextPart[] => {
    textLength += value.length
    if (textLength > MAX_TEXT_LENGTH) throw new Error('待翻译文字超过 120000 字符上限，请拆分文章')
    const parts: TextPart[] = []
    for (let start = 0; start < value.length;) {
      let end = Math.min(start + PART_LENGTH, value.length)
      if (end < value.length) {
        if (/[\uD800-\uDBFF]/.test(value[end - 1])) end--
        const slice = value.slice(start, end)
        const boundaries = [...slice.matchAll(/[\s。！？.!?;；]/g)]
        const last = boundaries[boundaries.length - 1]?.index
        if (last !== undefined && last > PART_LENGTH / 2) end = start + last + 1
      }
      const raw = value.slice(start, end)
      const text = raw.trim()
      if (text) {
        const id = `${prefix}:${parts.length}`
        segments.push({ id, text })
        if (segments.length > MAX_SEGMENTS) throw new Error('文章文本节点过多，超过翻译上限')
        parts.push({ id, before: raw.slice(0, raw.indexOf(text)), after: raw.slice(raw.indexOf(text) + text.length) })
      } else {
        parts.push({ before: raw, after: '' })
      }
      start = end
    }
    return parts
  }

  const title = split(source.title, 'title')
  const description = source.description === null ? null : split(source.description, 'description')
  const replacements: TextReplacement[] = []
  const root = parseFragment(html, { sourceCodeLocationInfo: true })
  const visit = (node: DefaultTreeAdapterMap['node']) => {
    if ('tagName' in node && isProtectedElement(node)) return
    if ('value' in node && node.nodeName === '#text' && node.value.trim()) {
      const location = node.sourceCodeLocation
      if (!location) throw new Error('无法定位文章文字，不能安全保留原始格式')
      replacements.push({
        start: location.startOffset,
        end: location.endOffset,
        parts: split(node.value, `body${replacements.length}`),
      })
    }
    if ('childNodes' in node) node.childNodes.forEach(visit)
  }
  visit(root)

  const chunks: TranslationSegment[][] = []
  let length = 0
  for (const segment of segments) {
    const current = chunks[chunks.length - 1]
    if (!current || length + segment.text.length > CHUNK_LENGTH || current.length >= 24) {
      chunks.push([segment])
      length = segment.text.length
    } else {
      current.push(segment)
      length += segment.text.length
    }
  }
  if (!chunks.length) throw new Error('文章没有可翻译的文字')
  return { html, title, description, replacements, chunks }
}

function validateSegments(value: unknown, expected: TranslationSegment[]): TranslationSegment[] {
  if (!Array.isArray(value) || value.length !== expected.length) {
    throw new Error('译文不完整或包含额外文本，请重试当前分段')
  }
  const expectedById = new Map(expected.map(segment => [segment.id, segment]))
  const translated = new Map<string, string>()
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || Object.keys(item).length !== 2 || typeof item.id !== 'string' || typeof item.text !== 'string'
      || !item.text.trim() || /\u0000/.test(item.text)) {
      throw new Error('AI 返回的译文格式不正确，请重试当前分段')
    }
    const original = expectedById.get(item.id)
    if (!original || translated.has(item.id) || item.text.length > Math.max(1024, original.text.length * 12)) {
      throw new Error('译文文本标识重复、未知或长度异常，请重试当前分段')
    }
    translated.set(item.id, item.text.trim())
  }
  return expected.map(segment => ({ id: segment.id, text: translated.get(segment.id)! }))
}

export function parseTranslationChunk(output: string, expected: TranslationSegment[]): TranslationSegment[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    throw new Error('AI 返回的 JSON 不完整或已截断，请重试当前分段')
  }
  return validateSegments(parsed, expected)
}

function htmlToMarkdown(html: string): string {
  const preserved: Array<{ html: string; inline: boolean }> = []
  const replacements: Array<{ start: number; end: number; id: number }> = []
  const elementNames = new Set<string>()
  const visit = (node: DefaultTreeAdapterMap['node']) => {
    if ('tagName' in node) elementNames.add(node.tagName)
    if ('tagName' in node && node.sourceCodeLocation
      && (node.tagName === 'table' || (isProtectedElement(node)
        && !['pre', 'code', 'script', 'style', 'noscript', 'template'].includes(node.tagName)))) {
      const { startOffset: start, endOffset: end } = node.sourceCodeLocation
      const id = preserved.push({ html: html.slice(start, end), inline: INLINE_RESOURCE_TAGS.has(node.tagName) }) - 1
      replacements.push({ start, end, id })
      return
    }
    if ('childNodes' in node) node.childNodes.forEach(visit)
  }
  visit(parseFragment(html, { sourceCodeLocationInfo: true }))
  let marker = 'x-blog-translation-preserved'
  while (elementNames.has(marker)) marker += 'x'
  const pieces: string[] = []
  let offset = 0
  for (const replacement of replacements.sort((a, b) => a.start - b.start)) {
    pieces.push(html.slice(offset, replacement.start), `<${marker} data-index="${replacement.id}">preserved</${marker}>`)
    offset = replacement.end
  }
  pieces.push(html.slice(offset))
  const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' })
  const escapeMarkdown = turndown.escape.bind(turndown)
  // Literal model text must remain literal when the Markdown is rendered again.
  turndown.escape = value => escapeMarkdown(escapeText(value))
  turndown.remove(['script', 'style', 'noscript', 'template'])
  turndown.addRule('preserved-translation-html', {
    filter: node => node.nodeName.toLowerCase() === marker,
    replacement: (_, node) => {
      const resource = preserved[Number(node.getAttribute('data-index'))]
      return resource.inline ? resource.html : `\n\n${resource.html}\n\n`
    },
  })
  turndown.addRule('translation-code-fences', {
    filter: 'pre',
    replacement: (_, node) => {
      const code = node.querySelector('code') || node
      const className = `${code.getAttribute('class') || ''} ${node.getAttribute('class') || ''}`
      const language = className.match(/\blanguage-([\w+.-]+)/)?.[1] || ''
      const text = code.textContent || ''
      const fenceLength = [...text.matchAll(/^ {0,3}(`{3,})/gm)].reduce((length, match) => Math.max(length, match[1].length + 1), 3)
      const fence = '`'.repeat(fenceLength)
      return `\n\n${fence}${language}\n${text.replace(/\n$/, '')}\n${fence}\n\n`
    },
  })
  return turndown.turndown(pieces.join(''))
}

export function assembleTranslationCandidate(document: TranslationDocument, results: unknown): TranslationCandidate {
  const translated = new Map(validateSegments(results, document.chunks.flat()).map(segment => [segment.id, segment.text]))
  const render = (parts: TextPart[]) => parts.map(part => part.before + (part.id ? translated.get(part.id)! : '') + part.after).join('')
  const pieces: string[] = []
  let offset = 0
  // Keep original source ranges; serializing the parsed tree would change untouched markup.
  for (const replacement of [...document.replacements].sort((a, b) => a.start - b.start)) {
    if (replacement.start < offset) throw new Error('文章文本范围重叠，不能安全保留原始格式')
    pieces.push(document.html.slice(offset, replacement.start), escapeText(render(replacement.parts)))
    offset = replacement.end
  }
  pieces.push(document.html.slice(offset))
  const html = pieces.join('')
  if (html.length > 1_500_000) throw new Error('生成的译文超过长度上限')
  return {
    title: render(document.title),
    description: document.description === null ? null : render(document.description),
    html,
    content: htmlToMarkdown(html),
  }
}

// These fields also form the SQL compare-and-swap guard. Readership is deliberately excluded.
export function getTranslationSnapshot(post: TranslationSnapshot) {
  return {
    id: post.id, slug: post.slug, title: post.title, content: post.content, html: post.html,
    description: post.description ?? null, language: post.language ?? 'zh-CN',
    translation_group_id: post.translation_group_id ?? null, status: post.status,
    deleted_at: post.deleted_at ?? null, password: post.password ?? null,
    is_hidden: post.is_hidden ?? 0, is_pinned: post.is_pinned ?? 0,
    category: post.category ?? null, cover_image: post.cover_image ?? null,
    tags: JSON.stringify(post.tags ?? []), published_at: post.published_at ?? 0, updated_at: post.updated_at ?? 0,
  }
}

export async function getTranslationRevision(post: TranslationSnapshot): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(getTranslationSnapshot(post)))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}
