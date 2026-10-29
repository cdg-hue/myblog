import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'
import { articleLanguages, articleCount, getPublicTranslations, publicMetadata, publicPath, publicText, readingMinutes, serializePublicJsonLd } from '@/lib/public-i18n'
import { LANGUAGE_HEADER } from '@/lib/i18n'
import type { PostWithTags } from '@/lib/db'

const source = {
  id: 1, slug: 'hello', title: '你好', language: 'zh-CN', translation_group_id: 'pair',
  status: 'published', deleted_at: null, password: null, is_hidden: 0,
} as PostWithTags
const translation = { ...source, id: 2, slug: 'hello-en', language: 'en' } as PostWithTags

describe('public locale and translation links', () => {
  it('localizes public navigation, preserving query and fragment, without prefixing admin or assets', () => {
    expect(publicPath('/search?q=hello#results', 'en')).toBe('/en/search?q=hello#results')
    expect(publicPath('/en/category/notes?page=2', 'zh-CN')).toBe('/category/notes?page=2')
    expect(publicPath('/feed.xml', 'en')).toBe('/en/feed.xml')
    for (const path of ['/admin', '/editor?new=1', '/api/search', '/icon-512.png', 'https://example.org', 'mailto:hello@example.org']) {
      expect(publicPath(path, 'en')).toBe(path)
    }
  })

  it('uses each article own canonical and only real translated slugs for hreflang', () => {
    const links = articleLanguages(source, [translation])
    expect(links['zh-CN']).toMatch(/\/hello$/)
    expect(links.en).toMatch(/\/en\/hello-en$/)
    expect(articleLanguages(source, [])).not.toHaveProperty('en')
    expect(publicMetadata('en', '/en/hello-en').alternates?.canonical).toMatch(/\/en\/hello-en$/)
    expect(publicMetadata('en', '/').alternates?.canonical).toMatch(/\/en$/)
  })

  it('keeps dotted category routes localized rather than treating them as assets', () => {
    expect(publicPath('/category/next.js?page=2', 'en')).toBe('/en/category/next.js?page=2')
    expect(publicMetadata('en', '/category/next.js').alternates?.canonical).toMatch(/\/en\/category\/next.js$/)
  })

  it.each([
    { status: 'draft' }, { status: 'deleted' }, { deleted_at: 1 },
    { password: 'private' }, { is_hidden: 1 }, { language: 'zh-CN' },
    { translation_group_id: 'another-pair' },
  ])('does not link an unavailable or unrelated translation: %j', changes => {
    expect(getPublicTranslations(source, [{ ...translation, ...changes } as PostWithTags])).toEqual([])
  })

  it('does not advertise translations from protected or unpaired source articles', () => {
    expect(getPublicTranslations({ ...source, password: 'private' }, [translation])).toEqual([])
    expect(getPublicTranslations({ ...source, is_hidden: 1 }, [translation])).toEqual([])
    expect(getPublicTranslations({ ...source, translation_group_id: null }, [translation])).toEqual([])
  })

  it('formats counts, fixed copy and reading time in the current language', () => {
    expect(publicText('en', '还没有文章')).toBe('No articles yet')
    expect(publicText('zh-CN', '还没有文章')).toBe('还没有文章')
    expect(articleCount(1, 'en')).toBe('1 article')
    expect(articleCount(2, 'en')).toBe('2 articles')
    expect(readingMinutes('word '.repeat(401), 'en')).toBe(3)
    expect(readingMinutes('字'.repeat(801), 'zh-CN')).toBe(3)
  })

  it('round-trips structured data text without allowing HTML to close its script tag', () => {
    const data = { title: '</script><script>example</script>' }
    const serialized = serializePublicJsonLd(data)
    expect(serialized).not.toContain('<')
    expect(JSON.parse(serialized)).toEqual(data)
  })

  it('does not mistake object prototype properties for dictionary entries', () => {
    expect(publicText('en', 'constructor')).toBe('constructor')
    expect(publicText('en', 'toString')).toBe('toString')
  })
})

describe('public locale middleware', () => {
  it.each([['/', 'zh-CN'], ['/en', 'en'], ['/en/search?q=test', 'en'], ['/english', 'zh-CN'], ['/admin', 'zh-CN']])('derives %s locale from the URL rather than a supplied header', (path, language) => {
    const response = middleware(new NextRequest(`https://blog-acheng.com${path}`, { headers: { [LANGUAGE_HEADER]: 'spoofed' } }))
    expect(response.headers.get(`x-middleware-request-${LANGUAGE_HEADER}`)).toBe(language)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('preserves the English path and query in the www redirect', () => {
    const response = middleware(new NextRequest('http://www.blog-acheng.com/en/search?q=hello&page=2'))
    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toBe('https://blog-acheng.com/en/search?q=hello&page=2')
  })

  it('drops noncanonical ports while preserving the English path and query', () => {
    const response = middleware(new NextRequest('http://www.blog-acheng.com:8080/en/search?q=hello'))
    expect(response.headers.get('location')).toBe('https://blog-acheng.com/en/search?q=hello')
  })
})
