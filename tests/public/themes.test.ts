import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { HomeProps } from '@/components/HomeClient'

vi.mock('@/components/SiteFooter', () => ({ SiteFooter: () => null }))
vi.mock('@/components/SearchEntry', () => ({ SearchEntry: () => null }))

import { PublicLocaleProvider } from '@/components/PublicLocale'
import { HomeDefault } from '@/components/themes/HomeDefault'
import { HomeVariantA } from '@/components/themes/HomeVariantA'
import { HomeVariantB } from '@/components/themes/HomeVariantB'
import { HomeVariantC } from '@/components/themes/HomeVariantC'
import { HomeClient } from '@/components/HomeClient'
import { SiteHeader } from '@/components/SiteHeader'

const categories = [{ name: '技术', slug: 'tech', displayName: 'Technology' }]
const props: HomeProps = {
  initialTheme: 'default', categories, navLinks: [], currentPage: 1, totalPages: 2, categorySlugMap: { 技术: 'tech' },
  posts: [{
    id: 1, slug: 'story-en', title: 'A story', category: '技术', description: 'A description',
    published_at: 1710000000, updated_at: 1710000000, tags: [], is_pinned: 1,
    language: 'en', translation_group_id: null, status: 'published', deleted_at: null,
    html: '<p>A story</p>', content: 'A story', password: null, is_hidden: 0,
    cover_image: null, view_count: 0,
  }],
}

describe.each(['zh-CN', 'en'] as const)('fixed editorial public interface in %s', language => {
  it.each(['default', 'refined', 'editorial', 'terminal'] as const)('uses editorial even with old %s initial settings', initialTheme => {
    const html = renderToStaticMarkup(createElement(PublicLocaleProvider, { language, categories }, createElement(HomeClient, { ...props, initialTheme })))
    expect(html).toContain('theme-home-editorial')
    expect(html).toContain('href="https://github.com/')
    expect(html).toContain(language === 'en' ? 'href="/en/feed.xml"' : 'href="/feed.xml"')
    expect(html).toContain(language === 'en' ? 'href="/" hrefLang="zh-CN"' : 'href="/en" hrefLang="en"')
    expect(html).not.toContain('>Theme<')
    expect(html).not.toContain('>主题<')
  })

  it('keeps article navigation without desktop or mobile theme menus', () => {
    const html = renderToStaticMarkup(createElement(PublicLocaleProvider, { language, categories }, createElement(SiteHeader, { initialTheme: 'default' })))
    expect(html).toContain('VOL.')
    expect(html).toContain('GitHub')
    expect(html).toContain(language === 'en' ? 'href="/en/feed.xml"' : 'href="/feed.xml"')
    expect(html).not.toContain('>Theme<')
    expect(html).not.toContain('>主题<')
  })
})

describe.each([HomeDefault, HomeVariantA, HomeVariantB, HomeVariantC])('public theme %s', Theme => {
  it('keeps article, RSS, pagination and language links consistent in English', () => {
    const html = renderToStaticMarkup(createElement(PublicLocaleProvider, { language: 'en', categories }, createElement(Theme, props)))
    expect(html).toContain('href="/en/story-en"')
    expect(html).toContain('Technology')
    expect(html).toContain('href="/en/feed.xml"')
    expect(html).toContain('href="/en?page=2"')
    expect(html).toContain('href="/" hrefLang="zh-CN"')
    expect(html).not.toContain('还没有文章')
    expect(html).not.toContain('>阿成<')
  })

  it('renders a localized empty state', () => {
    const html = renderToStaticMarkup(createElement(PublicLocaleProvider, { language: 'en', categories }, createElement(Theme, { ...props, posts: [] })))
    expect(html).toContain('No articles yet')
  })
})

it('retains independent category links in default home article rows without nested anchors', () => {
  const html = renderToStaticMarkup(createElement(PublicLocaleProvider, { language: 'en', categories }, createElement(HomeDefault, props)))
  const main = html.split('<main')[1]
  expect(main).toContain('href="/en/category/tech"')
  let depth = 0
  for (const [anchor] of main.matchAll(/<\/?a\b[^>]*>/g)) {
    depth += anchor.startsWith('</') ? -1 : 1
    expect(depth).toBeGreaterThanOrEqual(0)
    expect(depth).toBeLessThanOrEqual(1)
  }
})
