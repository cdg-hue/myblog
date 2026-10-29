import { describe, expect, it } from 'vitest'
import { parseFragment, serializeOuter, type DefaultTreeAdapterMap } from 'parse5'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'
import {
  assembleTranslationCandidate,
  createTranslationDocument,
  getTranslationRevision,
  parseTranslationChunk,
  type TranslationSegment,
} from '@/lib/post-translation'

const source = {
  id: 1, slug: 'source', title: '中文标题', description: '中文摘要',
  content: '正文', html: '<p>正文</p>', language: 'zh-CN' as const,
  translation_group_id: 'pair', status: 'published' as const,
  password: null, is_hidden: 0, updated_at: 100,
}

function translationsFor(document: ReturnType<typeof createTranslationDocument>) {
  return document.chunks.flat().map(({ id, text }) => ({ id, text: `English: ${text}` }))
}

describe('post translation documents', () => {
  it('translates title, description and visible text while preserving exact markup and resources', () => {
    const protectedHtml = [
      '<IMG src="/图.png" alt="中文图片" width="42">',
      '<pre class="language-js"><code>const 中文 = "&lt;原样&gt;"</code></pre>',
      '<a href="/files/说明.pdf" download="说明.pdf"><span>中文附件.pdf</span></a>',
      '<div data-type="fileAttachment" data-url="/file"><span>文件名</span></div>',
      '<iframe src="https://example.com/embed">中文嵌入</iframe>',
      '<blockquote class="twitter-tweet"><p>中文推文</p></blockquote>',
      '<script>const 原样 = 1</script><style>.中文 { color: red }</style>',
      '<div contenteditable="false">不可编辑组件</div>',
    ].join('')
    const html = '<H2 id=heading>中文标题</H2><!-- 注释 -->' + protectedHtml
      + '<p>  中文 &amp; 正文 <a HREF="/目标?q=1&amp;x=2">普通链接</a></p>'
    const document = createTranslationDocument({ ...source, html })
    const inputs = document.chunks.flat().map(segment => segment.text)

    expect(inputs).toEqual(['中文标题', '中文摘要', '中文标题', '中文 & 正文', '普通链接'])
    const candidate = assembleTranslationCandidate(document, translationsFor(document))
    expect(candidate.html).toContain(protectedHtml)
    expect(candidate.html).toContain('<H2 id=heading>English: 中文标题</H2><!-- 注释 -->')
    expect(candidate.html).toContain('<a HREF="/目标?q=1&amp;x=2">English: 普通链接</a>')
    expect(candidate.html).toContain('<p>  English: 中文 &amp; 正文 ')
    expect(candidate.title).toBe('English: 中文标题')
    expect(candidate.description).toBe('English: 中文摘要')
    expect(candidate.content).toContain('const 中文 = "<原样>"')
    expect(candidate.content).not.toContain('const 原样 = 1')
    expect(candidate.content).toContain('![中文图片](/图.png)')
    expect(candidate.content).toContain('[English: 普通链接](/目标?q=1&x=2)')
    expect(candidate.content).toContain('```js\nconst 中文 = "<原样>"\n```')
    expect(candidate.content).toContain('<iframe src="https://example.com/embed">中文嵌入</iframe>')
    expect(candidate.content).toContain('<a href="/files/说明.pdf" download="说明.pdf"><span>中文附件.pdf</span></a>')
  })

  it('handles documents over 12k and splits a single long text node without losing its tail', () => {
    const text = '很长的段落和一个表情😀。'.repeat(1800) + '最后的结尾'
    const document = createTranslationDocument({ ...source, html: `<p>${text}</p>` })
    expect(document.chunks.length).toBeGreaterThan(8)
    expect(document.chunks.flat().slice(2).map(segment => segment.text).join('')).toBe(text)
    expect(document.chunks.every(chunk => chunk.reduce((sum, segment) => sum + segment.text.length, 0) <= 2000)).toBe(true)
    expect(document.chunks.flat().some(segment => /[\uD800-\uDBFF]$/.test(segment.text))).toBe(false)
    const candidate = assembleTranslationCandidate(document, document.chunks.flat())
    expect(candidate.html).toBe(`<p>${text}</p>`)
    expect(candidate.content).toContain('最后的结尾')
  })

  it('escapes model generated HTML instead of inserting executable markup', () => {
    const document = createTranslationDocument(source)
    const results = translationsFor(document)
    results[2].text = '<script>alert(1)</script><img src=x onerror="alert(2)">&value'
    const candidate = assembleTranslationCandidate(document, results)
    expect(candidate.html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror="alert(2)"&gt;&amp;value</p>')
    expect(candidate.html).not.toContain('<script>')
    expect(candidate.content).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(candidate.content).not.toContain('<script>')
  })

  it('uses saved plain content when HTML is absent and does not drop an empty description', () => {
    const document = createTranslationDocument({ ...source, html: '', content: '第一行\n\n最后一行', description: null })
    const candidate = assembleTranslationCandidate(document, document.chunks.flat())
    expect(candidate.content).toContain('最后一行')
    expect(candidate.html).toContain('第一行\n\n最后一行')
    expect(candidate.description).toBeNull()
  })

  it('rejects oversized inputs rather than silently truncating them', () => {
    expect(() => createTranslationDocument({ ...source, html: `<p>${'字'.repeat(120001)}</p>` })).toThrow(/过长|上限/)
  })

  it('keeps Markdown headings, lists, inline code, safe code fences, tables and empty embeds', () => {
    const html = '<h2>标题</h2><ul><li>列表文字</li></ul><p><code>inline &lt;code&gt;</code></p>'
      + '<pre><code class="language-markdown">```\n![image](/original.png)\n```</code></pre>'
      + '<table><tr><th>列名</th></tr><tr><td>单元格</td></tr></table>'
      + '<object data="/file.pdf"></object><embed src="/embed.pdf">'
      + '<div data-type="fileAttachment" data-name="文件名">附件文字</div>'
    const document = createTranslationDocument({ ...source, html })
    const candidate = assembleTranslationCandidate(document, translationsFor(document))
    expect(candidate.content).toContain('## English: 标题')
    expect(candidate.content).toMatch(/-\s+English: 列表文字/)
    expect(candidate.content).toContain('`inline <code>`')
    expect(candidate.content).toContain('````markdown\n```\n![image](/original.png)\n```\n````')
    expect(candidate.content).toContain('<table><tr><th>English: 列名</th></tr><tr><td>English: 单元格</td></tr></table>')
    expect(candidate.content).toContain('<object data="/file.pdf"></object>')
    expect(candidate.content).toContain('<embed src="/embed.pdf">')
    expect(candidate.content).toContain('<div data-type="fileAttachment" data-name="文件名">附件文字</div>')
  })

  it('does not collide with author HTML placeholders or let indented code close its Markdown fence', () => {
    const html = '<x-blog-translation-preserved data-index="0">普通文字</x-blog-translation-preserved>'
      + '<iframe src="/embed"></iframe><pre><code class="language-text">  ``````\ncode</code></pre>'
    const document = createTranslationDocument({ ...source, html })
    const candidate = assembleTranslationCandidate(document, translationsFor(document))
    expect(candidate.content).toContain('English: 普通文字')
    expect(candidate.content.match(/<iframe src="\/embed"><\/iframe>/g)).toHaveLength(1)
    expect(candidate.content).toContain('```````text\n  ``````\ncode\n```````')
  })

  it('round-trips protected resource trees through Markdown without changing their attributes or inline placement', async () => {
    const inlineAttachment = '<a data-resource-id="inline-file" href="/files/book.pdf?q=1&amp;x=2" download="book.pdf"><span>附件</span></a>'
    const html = `<p>前面 ${inlineAttachment} 后面</p>`
      + '<div data-resource-id="attachment" data-type="fileAttachment" data-name="file.zip"><a href="/file.zip">文件</a></div>'
      + '<div data-resource-id="video" contenteditable="false"><iframe src="https://video.test/watch?id=1&amp;lang=zh" allowfullscreen></iframe></div>'
      + '<blockquote data-resource-id="social" class="twitter-tweet"><p>原推文</p><a href="https://social.test/post/1">原链接</a></blockquote>'
      + '<audio data-resource-id="audio" controls><source src="/song.mp3" type="audio/mpeg"></audio>'
      + '<object data-resource-id="object" data="/document.pdf"><embed src="/fallback.pdf"></object>'
      + '<table data-resource-id="table"><tr><th>名称</th><th>链接</th></tr><tr><td>中文</td><td><a href="/original">原地址</a></td></tr></table>'
    const document = createTranslationDocument({ ...source, html })
    const candidate = assembleTranslationCandidate(document, document.chunks.flat())
    const rendered = String(await remark().use(remarkGfm).use(remarkHtml, { sanitize: false }).process(candidate.content))
    const resourceTrees = (input: string) => {
      const resources: Record<string, string> = {}
      const visit = (node: DefaultTreeAdapterMap['node']) => {
        if ('tagName' in node) {
          const id = node.attrs.find(attribute => attribute.name === 'data-resource-id')?.value
          if (id) resources[id] = serializeOuter(node)
        }
        if ('childNodes' in node) node.childNodes.forEach(visit)
      }
      visit(parseFragment(input))
      return resources
    }
    expect(resourceTrees(candidate.html)).toEqual(resourceTrees(html))
    expect(resourceTrees(rendered)).toEqual(resourceTrees(html))
    expect(rendered).toContain(`<p>前面 ${inlineAttachment} 后面</p>`)
    expect(candidate.content).not.toContain('<x-blog-translation-preserved')
  })
})

describe('strict AI translation responses', () => {
  const expected: TranslationSegment[] = [{ id: 't0', text: '标题' }, { id: 'b0', text: '正文' }]

  it('accepts a complete JSON array and restores deterministic ID ordering', () => {
    expect(parseTranslationChunk('[{"id":"b0","text":"Body"},{"id":"t0","text":"Title"}]', expected))
      .toEqual([{ id: 't0', text: 'Title' }, { id: 'b0', text: 'Body' }])
  })

  it.each([
    '[{"id":"t0","text":"Title"}',
    '[{"id":"t0","text":"Title"}]',
    '[{"id":"t0","text":"Title"},{"id":"b0","text":"Body"},{"id":"extra","text":"evil"}]',
    '[{"id":"t0","text":"Title"},{"id":"t0","text":"Duplicate"}]',
    '[{"id":"t0","text":1},{"id":"b0","text":"Body"}]',
    '[{"id":"t0","text":""},{"id":"b0","text":"Body"}]',
    '[{"id":"t0","text":"Title","html":"<script>"},{"id":"b0","text":"Body"}]',
    '```json\n[{"id":"t0","text":"Title"},{"id":"b0","text":"Body"}]\n```',
  ])('rejects malformed, truncated, missing, duplicate, extra or non-string output: %s', output => {
    expect(() => parseTranslationChunk(output, expected)).toThrow()
  })

  it('requires all server-derived segments again before building a candidate', () => {
    const document = createTranslationDocument(source)
    expect(() => assembleTranslationCandidate(document, translationsFor(document).slice(1))).toThrow()
    expect(() => assembleTranslationCandidate(document, [{ id: 'html', text: '<p>injected</p>' }])).toThrow()
  })

  it('hashes source and target content, pairing and privacy but ignores readership', async () => {
    const revision = await getTranslationRevision(source)
    expect(await getTranslationRevision({ ...source, view_count: 200 })).toBe(revision)
    for (const patch of [{ content: '变更' }, { title: '变更' }, { html: '<p>变更</p>' }, { description: '变更' }, { password: 'secret' }, { translation_group_id: 'other' }, { language: 'en' }]) {
      expect(await getTranslationRevision({ ...source, ...patch } as typeof source)).not.toBe(revision)
    }
  })
})
