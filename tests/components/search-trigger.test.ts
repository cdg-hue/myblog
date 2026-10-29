import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PublicLocaleProvider } from '@/components/PublicLocale'
import { SearchTrigger } from '@/components/SearchTrigger'

describe.each(['zh-CN', 'en'] as const)('visible search entry in %s', language => {
  it('provides a labeled, large link before interactive search loads', () => {
    const html = renderToStaticMarkup(createElement(PublicLocaleProvider, { language }, createElement(SearchTrigger)))
    expect(html).toContain(language === 'en' ? 'href="/en/search"' : 'href="/search"')
    expect(html).toContain(language === 'en' ? '>Search articles<' : '>搜索文章<')
    expect(html).toContain('h-11')
    expect(html).toContain('w-[22px]')
  })

  it('uses the same visible label for the interactive search button', () => {
    const html = renderToStaticMarkup(createElement(PublicLocaleProvider, { language }, createElement(SearchTrigger, { onClick: () => {} })))
    expect(html).toContain('<button')
    expect(html).toContain(language === 'en' ? 'aria-label="Search articles"' : 'aria-label="搜索文章"')
    expect(html).toContain(language === 'en' ? '>Search articles<' : '>搜索文章<')
  })
})
