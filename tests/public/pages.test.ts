import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostWithTags } from '@/lib/db'

const mocks = vi.hoisted(() => ({
  getAppCloudflareEnv: vi.fn(), getPosts: vi.fn(), getPostsCount: vi.fn(),
  getPostBySlug: vi.fn(), getTranslations: vi.fn(), incrementViewCount: vi.fn(),
  getPublicCategories: vi.fn(), getPostsByCategory: vi.fn(), getPostsCountByCategory: vi.fn(),
  getSiteHeaderData: vi.fn(), getRelatedPosts: vi.fn(), searchPostsWithStrategy: vi.fn(),
  verifyPassword: vi.fn(),
  getCategoryTags: vi.fn(),
  frontPostAdminBoundary: vi.fn(({ children }: { children: unknown; category: string | null; password?: string | null }) => children),
  permanentRedirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`) }),
}))
vi.mock('@/lib/cloudflare', () => ({ getAppCloudflareEnv: mocks.getAppCloudflareEnv }))
vi.mock('@/lib/db', async importOriginal => ({ ...await importOriginal<object>(), ...mocks }))
vi.mock('@/lib/site', () => ({ getSiteHeaderData: mocks.getSiteHeaderData }))
vi.mock('@/lib/password', () => ({ verifyPassword: mocks.verifyPassword }))
vi.mock('@/lib/repositories/tags', () => ({ getCategoryTags: mocks.getCategoryTags }))
vi.mock('@/lib/related-content', () => ({ getRelatedPosts: mocks.getRelatedPosts, searchPostsWithStrategy: mocks.searchPostsWithStrategy }))
vi.mock('next/navigation', () => ({ permanentRedirect: mocks.permanentRedirect, notFound: () => { throw new Error('not-found') } }))
vi.mock('@/components/FrontPostAdminBoundary', () => ({ FrontPostAdminBoundary: mocks.frontPostAdminBoundary }))
vi.mock('@/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('@/lib/wechat-copy', () => ({ copyAsWechatArticleFormat: vi.fn(), downloadArticleAsPdf: vi.fn() }))
vi.mock('@/components/TwitterEmbedsEnhancer', () => ({ TwitterEmbedsEnhancer: () => null }))
vi.mock('@/components/SearchEntry', () => ({ SearchEntry: () => null }))
vi.mock('@/components/SiteFooter', () => ({ SiteFooter: () => null }))
vi.mock('@/components/HomeClient', () => ({ HomeClient: () => null }))

import PublicHomePage from '@/components/public/HomePage'
import PublicCategoryPage from '@/components/public/CategoryPage'
import PublicSearchPage from '@/components/public/SearchPage'
import PublicPostPage, { getPostMetadata } from '@/components/public/PostPage'
import EnglishPost, { dynamic as englishPostDynamic } from '@/app/en/[slug]/page'
import { dynamic as chinesePostDynamic } from '@/app/[slug]/page'
import { dynamic as englishHomeDynamic } from '@/app/en/page'
import { dynamic as chineseHomeDynamic } from '@/app/page'

const source: PostWithTags = {
  id: 1, slug: 'hello', title: '你好', language: 'zh-CN', translation_group_id: 'pair',
  status: 'published', deleted_at: null, password: null, is_hidden: 0,
  category: '技术', tags: [], html: '<p>Hello world</p>', content: 'Hello world',
  description: 'A story', is_pinned: 0, cover_image: null, published_at: 1710000000, updated_at: 1710000000, view_count: 3,
}
const translation: PostWithTags = { ...source, id: 2, slug: 'hello-en', title: 'Hello', language: 'en' }
const params = (slug: string) => Promise.resolve({ slug })

describe('bilingual public pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: {} })
    mocks.getSiteHeaderData.mockResolvedValue({ defaultTheme: 'default', navLinks: [], categories: [{ name: '技术', slug: 'tech', displayName: 'Technology' }] })
    mocks.getPostBySlug.mockResolvedValue(translation)
    mocks.getTranslations.mockResolvedValue([source])
    mocks.getRelatedPosts.mockResolvedValue({ results: [], source: 'rules' })
    mocks.incrementViewCount.mockResolvedValue(undefined)
    mocks.getPosts.mockResolvedValue([translation])
    mocks.getPostsCount.mockResolvedValue(30)
    mocks.getPublicCategories.mockResolvedValue([{ name: '技术', slug: 'tech', name_en: 'Technology' }])
    mocks.getPostsByCategory.mockResolvedValue([translation])
    mocks.getPostsCountByCategory.mockResolvedValue(30)
    mocks.searchPostsWithStrategy.mockResolvedValue({ results: [translation] })
    mocks.verifyPassword.mockResolvedValue(true)
    mocks.getCategoryTags.mockResolvedValue([])
  })

  it('passes the language into home queries before pagination and count', async () => {
    await PublicHomePage({ searchParams: Promise.resolve({ page: '2' }), language: 'en' })
    expect(mocks.getPosts).toHaveBeenCalledWith({}, 25, 25, false, false, false, false, 'en')
    expect(mocks.getPostsCount).toHaveBeenCalledWith({}, false, false, false, false, 'en')
    expect(mocks.getSiteHeaderData).toHaveBeenCalledWith({}, 'en')
  })

  it('uses source category names in queries and localized labels, links and pagination in the page', async () => {
    const tree = await PublicCategoryPage({ params: params('tech'), searchParams: Promise.resolve({ page: '2' }), language: 'en' })
    const html = renderToStaticMarkup(tree)
    expect(mocks.getPostsByCategory).toHaveBeenCalledWith({}, '技术', 25, 25, 'en')
    expect(mocks.getPostsCountByCategory).toHaveBeenCalledWith({}, '技术', 'en')
    expect(html).toContain('Technology')
    expect(html).toContain('30 articles')
    expect(html).toContain('href="/en/hello-en"')
    expect(html).toContain('href="/en/category/tech"')
    expect(html).toContain('href="/category/tech" hrefLang="zh-CN"')
  })

  it('filters a column by tag before pagination and preserves the tag in language and page links', async () => {
    mocks.getCategoryTags.mockResolvedValue([{ id: 4, slug: 'sim-cards', name: '手机卡', name_en: 'SIM Cards', post_count: 30 }])
    const tree = await PublicCategoryPage({ params: params('tech'), searchParams: Promise.resolve({ page: '2', tag: 'sim-cards' }), language: 'en' })
    const html = renderToStaticMarkup(tree)
    expect(mocks.getPostsByCategory).toHaveBeenCalledWith({}, '技术', 25, 25, 'en', 'sim-cards')
    expect(mocks.getPostsCountByCategory).toHaveBeenCalledWith({}, '技术', 'en', 'sim-cards')
    expect(html).toContain('SIM Cards')
    expect(html).toContain('/en/category/tech?tag=sim-cards&amp;page=2')
    expect(html).toContain('href="/category/tech?tag=sim-cards" hrefLang="zh-CN"')
  })

  it('passes locale to strategy search and preserves the query when switching languages', async () => {
    const tree = await PublicSearchPage({ searchParams: Promise.resolve({ q: 'hello world' }), language: 'en' })
    expect(mocks.searchPostsWithStrategy).toHaveBeenCalledWith({}, { DB: {} }, 'hello world', { limit: 100, language: 'en' })
    const html = renderToStaticMarkup(tree)
    expect(html).toContain('Search results')
    expect(html).toContain('href="/en/hello-en"')
    expect(html).toContain('href="/search?q=hello%20world" hrefLang="zh-CN"')
    expect(html.split('<main')[1]).toContain('href="/en/category/tech"')
  })

  it('renders a real full-load link to the corresponding article', async () => {
    const tree = await PublicPostPage({ params: params('hello-en'), searchParams: Promise.resolve({}), language: 'en' })
    const html = renderToStaticMarkup(tree)
    expect(html).toContain('href="/hello" hrefLang="zh-CN"')
    expect(html).not.toContain('href="/hello-en"')
    expect(html).toContain('1 min read')
    expect(html).toContain('3 views')
    expect(html).toContain('"inLanguage":"en"')
    expect(html).toContain('Technology')
    expect(mocks.frontPostAdminBoundary.mock.calls[0][0].category).toBe('技术')
  })

  it.each([
    { post: source, language: 'zh-CN' as const, views: '3 次阅读', readingTime: '约 1 分钟' },
    { post: translation, language: 'en' as const, views: '3 views', readingTime: '1 min read' },
  ])('keeps article metadata without copy or download controls in $language', async ({ post, language, views, readingTime }) => {
    mocks.getPostBySlug.mockResolvedValue(post)
    mocks.getTranslations.mockResolvedValue([])
    const tree = await PublicPostPage({ params: params(post.slug), searchParams: Promise.resolve({}), language })
    const html = renderToStaticMarkup(tree)
    const header = html.split('<article>')[1].split('</header>')[0]
    expect(header).toContain(post.title)
    expect(header).toContain('<time>')
    expect(header).toContain(views)
    expect(header).toContain(readingTime)
    expect(header).not.toContain('<button')
    expect(header).not.toContain('download=')
    expect(html).toContain('<p>Hello world</p>')
  })

  it('preserves the canonical category in the unlocked editor without passing the stored password', async () => {
    mocks.getPostBySlug.mockResolvedValue({ ...translation, password: 'stored-password-marker' })
    const tree = await PublicPostPage({ params: params('hello-en'), searchParams: Promise.resolve({ pwd: 'reader-input' }), language: 'en' })
    renderToStaticMarkup(tree)
    expect(mocks.frontPostAdminBoundary.mock.calls[0][0].category).toBe('技术')
    expect(mocks.frontPostAdminBoundary.mock.calls[0][0].password).toBeTruthy()
    expect(mocks.frontPostAdminBoundary.mock.calls[0][0].password).not.toBe('stored-password-marker')
  })

  it.each([undefined, 'incorrect'])('does not serialize protected content or credentials for locked readers: %s', async pwd => {
    mocks.verifyPassword.mockResolvedValue(false)
    mocks.getPostBySlug.mockResolvedValue({ ...translation, password: 'stored-password-marker', html: '<p>PRIVATE-BODY-MARKER</p>', content: 'PRIVATE-BODY-MARKER' })
    const tree = await PublicPostPage({ params: params('hello-en'), searchParams: Promise.resolve({ pwd }), language: 'en' })
    const payload = JSON.stringify(tree)
    expect(payload).not.toContain('PRIVATE-BODY-MARKER')
    expect(payload).not.toContain('stored-password-marker')
    expect(renderToStaticMarkup(tree)).toContain('Password-protected article')
    expect(mocks.frontPostAdminBoundary).not.toHaveBeenCalled()
  })

  it('handles repeated password parameters as a locked page without calling password verification', async () => {
    mocks.getPostBySlug.mockResolvedValue({ ...translation, password: 'private' })
    const tree = await PublicPostPage({ params: params('hello-en'), searchParams: Promise.resolve({ pwd: ['one', 'two'] }) as never, language: 'en' })
    expect(renderToStaticMarkup(tree)).toContain('Password-protected article')
    expect(mocks.verifyPassword).not.toHaveBeenCalled()
  })

  it('reads current article access flags without using a stale public KV copy', async () => {
    mocks.getAppCloudflareEnv.mockResolvedValue({ DB: {}, CACHE: { kind: 'stale-cache' } })
    await getPostMetadata({ params: params('hello-en') }, 'en')
    await PublicPostPage({ params: params('hello-en'), searchParams: Promise.resolve({}), language: 'en' })
    for (const call of mocks.getPostBySlug.mock.calls) expect(call).toEqual([{}, 'hello-en'])
  })

  it('emits only self hreflang for an article with no published translation', async () => {
    mocks.getTranslations.mockResolvedValue([])
    const metadata = await getPostMetadata({ params: params('hello-en') }, 'en')
    expect(metadata.alternates?.languages).toEqual({ en: expect.stringMatching(/\/en\/hello-en$/) })
  })

  it.each([{ password: 'private' }, { is_hidden: 1 }])('does not emit hreflang or query translations for a private source: %j', async changes => {
    mocks.getPostBySlug.mockResolvedValue({ ...translation, ...changes })
    const metadata = await getPostMetadata({ params: params('hello-en') }, 'en')
    expect(metadata.alternates?.languages).toBeUndefined()
    expect(metadata.robots).toMatchObject({ index: false })
    expect(mocks.getTranslations).not.toHaveBeenCalled()
  })

  it('escapes script-closing text inside article structured data', async () => {
    mocks.getPostBySlug.mockResolvedValue({ ...translation, title: '</script><script data-injected>example</script>' })
    const tree = await PublicPostPage({ params: params('hello-en'), searchParams: Promise.resolve({}), language: 'en' })
    expect(renderToStaticMarkup(tree)).not.toContain('</script><script data-injected>')
  })

  it('renders empty English search without categories and tolerates repeated query parameters', async () => {
    mocks.getSiteHeaderData.mockResolvedValue({ defaultTheme: 'default', navLinks: [], categories: [] })
    const tree = await PublicSearchPage({ searchParams: Promise.resolve({ q: ['one', 'two'] }) as never, language: 'en' })
    expect(renderToStaticMarkup(tree)).toContain('Enter a search term')
  })

  it('translates the built-in uncategorized label even when no categories are returned', async () => {
    mocks.getSiteHeaderData.mockResolvedValue({ defaultTheme: 'default', navLinks: [], categories: [] })
    mocks.searchPostsWithStrategy.mockResolvedValue({ results: [{ ...translation, category: '未分类' }] })
    const tree = await PublicSearchPage({ searchParams: Promise.resolve({ q: 'hello' }), language: 'en' })
    const html = renderToStaticMarkup(tree)
    expect(html).toContain('Uncategorized')
    expect(html).not.toContain('未分类')
  })

  it.each([{ status: 'draft' }, { is_hidden: 1 }, { password: 'private' }, { deleted_at: 12 }])('omits protected counterparts in both the UI and metadata: %j', async change => {
    mocks.getTranslations.mockResolvedValue([{ ...source, ...change }])
    const tree = await PublicPostPage({ params: params('hello-en'), searchParams: Promise.resolve({}), language: 'en' })
    expect(renderToStaticMarkup(tree)).not.toContain('href="/hello"')
    const metadata = await getPostMetadata({ params: params('hello-en') }, 'en')
    expect(metadata.alternates?.languages).not.toHaveProperty('zh-CN')
  })

  it('redirects a wrong-language slug to its own canonical without carrying passwords', async () => {
    await expect(PublicPostPage({ params: params('hello-en'), searchParams: Promise.resolve({ pwd: 'not-forwarded' }), language: 'zh-CN' })).rejects.toThrow('redirect:/en/hello-en')
    expect(mocks.permanentRedirect).toHaveBeenCalledWith('/en/hello-en')
  })

  it('gives each version its own canonical and reciprocal hreflang', async () => {
    const metadata = await getPostMetadata({ params: params('hello-en') }, 'en')
    expect(metadata.alternates?.canonical).toMatch(/\/en\/hello-en$/)
    expect(metadata.alternates?.languages).toMatchObject({ en: expect.stringMatching(/\/en\/hello-en$/), 'zh-CN': expect.stringMatching(/\/hello$/) })
    expect(metadata.openGraph).toMatchObject({ locale: 'en_US', siteName: 'Acheng', type: 'article' })
  })

  it('keeps public routes dynamic so a newly published translation appears without redeploying', () => {
    expect([englishPostDynamic, chinesePostDynamic, englishHomeDynamic, chineseHomeDynamic]).toEqual(Array(4).fill('force-dynamic'))
    expect(EnglishPost({ params: params('hello-en'), searchParams: Promise.resolve({}) }).props.language).toBe('en')
  })
})
