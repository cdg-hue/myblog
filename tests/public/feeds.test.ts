import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostWithTags } from '@/lib/db'

const mocks = vi.hoisted(() => ({ getAppCloudflareEnv: vi.fn(), getPosts: vi.fn(), getPublicCategories: vi.fn() }))
vi.mock('@/lib/cloudflare', () => ({ getAppCloudflareEnv: mocks.getAppCloudflareEnv }))
vi.mock('@/lib/db', () => ({ getPosts: mocks.getPosts, getPublicCategories: mocks.getPublicCategories }))
import { GET as chineseFeed } from '@/app/feed.xml/route'
import { GET as englishFeed } from '@/app/en/feed.xml/route'
import sitemap from '@/app/sitemap'

describe('public bilingual feeds and sitemap', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([['zh-CN', chineseFeed], ['en', englishFeed]] as const)('binds %s for RSS and emits valid escaped localized article URLs', async (language, getFeed) => {
    const all = vi.fn().mockResolvedValue({ results: [{ slug: 'hello', title: '<Hello & world>', description: 'A & B', html: '<p>Example ]]></p>', category: 'Technology', published_at: 1710000000 }] })
    const bind = vi.fn().mockReturnValue({ all })
    const prepare = vi.fn().mockReturnValue({ bind })
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: { prepare } })
    const response = await getFeed()
    const xml = await response.text()
    expect(bind).toHaveBeenCalledWith(language, language)
    expect(prepare.mock.calls[0][0]).toContain('posts.password IS NULL AND posts.is_hidden = 0')
    expect(prepare.mock.calls[0][0]).toContain("posts.deleted_at IS NULL")
    expect(xml).toContain(`<language>${language}</language>`)
    expect(xml).toContain('&lt;Hello &amp; world&gt;')
    expect(xml).toContain('<![CDATA[<p>Example ]]]]><![CDATA[></p>]]>')
    expect(xml).toContain(language === 'en' ? '/en/hello</link>' : '/hello</link>')
    expect(xml).toContain(language === 'en' ? '/en/feed.xml" rel="self"' : '/feed.xml" rel="self"')
    expect(response.headers.get('Cache-Control')).toContain('must-revalidate')
  })

  it('does not cache a misleading empty feed when the database query fails', async () => {
    mocks.getAppCloudflareEnv.mockRejectedValue(new Error('Unavailable'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await englishFeed()
    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    log.mockRestore()
  })

  it('includes both languages and only links actual public translation pairs in sitemap', async () => {
    const zh = { slug: 'hello', language: 'zh-CN', translation_group_id: 'pair', status: 'published', deleted_at: null, password: null, is_hidden: 0, published_at: 1710000000 } as PostWithTags
    const en = { ...zh, slug: 'hello-en', language: 'en' } as PostWithTags
    const solo = { ...en, slug: 'solo', translation_group_id: null }
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: {} })
    mocks.getPosts.mockImplementation((_db, _limit, _offset, _drafts, _encrypted, _hidden, _deleted, language) => Promise.resolve(language === 'en' ? [en, solo] : [zh]))
    mocks.getPublicCategories.mockResolvedValue([{ name: '技术', slug: 'tech' }])
    const entries = await sitemap()
    expect(mocks.getPosts).toHaveBeenCalledWith({}, 1000, 0, false, false, false, false, 'en')
    expect(mocks.getPosts).toHaveBeenCalledWith({}, 1000, 0, false, false, false, false, 'zh-CN')
    expect(entries.find(entry => entry.url.endsWith('/en/hello-en'))?.alternates?.languages).toMatchObject({
      en: expect.stringMatching(/\/en\/hello-en$/), 'zh-CN': expect.stringMatching(/\/hello$/),
    })
    expect(entries.find(entry => entry.url.endsWith('/en/solo'))?.alternates?.languages).not.toHaveProperty('zh-CN')
    expect(entries.some(entry => entry.url.endsWith('/en/category/tech'))).toBe(true)
    expect(entries.some(entry => entry.url.endsWith('/category/tech'))).toBe(true)
  })
})
