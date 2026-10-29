import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LANGUAGE_HEADER } from '@/lib/i18n'

const mocks = vi.hoisted(() => ({ headers: vi.fn() }))
vi.mock('next/headers', () => ({ headers: mocks.headers }))
vi.mock('next/font/local', () => ({ default: () => ({ variable: 'test-font' }) }))
vi.mock('@/lib/cloudflare', () => ({ getAppCloudflareEnv: async () => ({}) }))
import RootLayout, { generateMetadata } from '@/app/layout'

describe('server document language', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(['zh-CN', 'en'])('renders %s on the initial server HTML', async language => {
    mocks.headers.mockResolvedValue(new Headers({ [LANGUAGE_HEADER]: language }))
    const layout = await RootLayout({ children: createElement('main', null, 'Article') })
    expect(layout.type).toBe('html')
    expect(layout.props.lang).toBe(language)
    expect(layout.props['data-theme']).toBe('editorial')
    const metadata = await generateMetadata()
    expect(metadata.title).toMatchObject({ default: language === 'en' ? 'Acheng' : '阿成' })
    expect(metadata.alternates?.types).toEqual({ 'application/rss+xml': language === 'en' ? '/en/feed.xml' : '/feed.xml' })
    expect(metadata.alternates?.languages).toBeUndefined()
  })
})
