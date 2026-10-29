import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createTestDatabase } from '../helpers/sqlite-d1'
import {
  createPost, getPostById, getPostBySlug, getPosts, getPostsCount,
  getPostsByCategory, getPostsCountByCategory, updatePost, restorePost,
} from '@/lib/repositories/posts'
import { createTranslation, getTranslations, linkTranslation, unlinkTranslation } from '@/lib/repositories/translations'
import { getPublicCategories } from '@/lib/repositories/categories'
import { searchPosts } from '@/lib/repositories/search'
import { getPostPath, localizePath, normalizeLanguage } from '@/lib/i18n'

describe('bilingual article publishing', () => {
  let testDb: ReturnType<typeof createTestDatabase>
  beforeEach(async () => {
    testDb = createTestDatabase()
    await testDb.db.prepare("INSERT INTO categories (name, slug, name_en) VALUES ('技术', 'tech', 'Technology')").run()
  })
  afterEach(() => testDb?.close())

  async function post(slug: string, extra: Partial<Parameters<typeof createPost>[1]> = {}) {
    return createPost(testDb.db, {
      slug, title: `Hello ${slug}`, content: `Content ${slug}`, html: '<p>Hello</p>',
      category: '技术', ...extra,
    })
  }

  it('defaults legacy clients to Chinese while preserving English on updates', async () => {
    const chinese = await post('chinese')
    const english = await post('english', { language: 'en' })
    await updatePost(testDb.db, english, { title: 'Edited English' })
    expect((await getPostById(testDb.db, chinese))?.language).toBe('zh-CN')
    expect((await getPostById(testDb.db, english))?.language).toBe('en')
  })

  it('filters lists, totals, categories and search before pagination', async () => {
    await post('chinese')
    await post('english', { language: 'en' })
    await post('english-private', { language: 'en', is_hidden: 1 })
    expect((await getPosts(testDb.db, 10, 0, false, false, false, false, 'en')).map(p => p.slug)).toEqual(['english'])
    expect(await getPostsCount(testDb.db, false, false, false, false, 'en')).toBe(1)
    expect((await getPostsByCategory(testDb.db, '技术', 10, 0, 'en')).map(p => p.slug)).toEqual(['english'])
    expect(await getPostsCountByCategory(testDb.db, '技术', 'en')).toBe(1)
    expect(await getPublicCategories(testDb.db, 'en')).toEqual([expect.objectContaining({ name_en: 'Technology', post_count: 1 })])
    expect((await searchPosts(testDb.db, 'Hello', 10, false, false, false, false, 'en')).map(p => p.slug)).toEqual(['english'])
  })

  it('creates an independent protected draft and reuses repeated translation requests', async () => {
    const sourceId = await post('original', { password: 'protected-value', is_hidden: 1, cover_image: '/cover.webp' })
    const first = await createTranslation(testDb.db, sourceId, 'en')
    const second = await createTranslation(testDb.db, sourceId, 'en')
    const source = await getPostById(testDb.db, sourceId)
    expect(first.post).toMatchObject({ language: 'en', status: 'draft', password: 'protected-value', is_hidden: 1, cover_image: '/cover.webp', view_count: 0 })
    expect(second.post.id).toBe(first.post.id)
    expect(second.created).toBe(false)
    expect(first.post.translation_group_id).toBe(source?.translation_group_id)
    expect((await getTranslations(testDb.db, source!)).map(p => p.id)).toEqual([first.post.id])
    expect(await getTranslations(testDb.db, source!, true)).toEqual([])
  })

  it('returns only published, visible, unprotected counterparts to public readers', async () => {
    const sourceId = await post('original')
    const { post: english } = await createTranslation(testDb.db, sourceId, 'en')
    const source = (await getPostById(testDb.db, sourceId))!
    expect(await getTranslations(testDb.db, source, true)).toEqual([])
    await updatePost(testDb.db, english.id, { status: 'published' })
    expect((await getTranslations(testDb.db, source, true)).map(p => p.id)).toEqual([english.id])
    await updatePost(testDb.db, english.id, { is_hidden: 1 })
    expect(await getTranslations(testDb.db, source, true)).toEqual([])
    await updatePost(testDb.db, english.id, { is_hidden: 0, password: 'secret' })
    expect(await getTranslations(testDb.db, source, true)).toEqual([])
  })

  it('supports explicit pairing, slug changes and unlinking without deleting content', async () => {
    const sourceId = await post('original')
    const targetId = await post('english', { language: 'en' })
    await linkTranslation(testDb.db, sourceId, targetId)
    await updatePost(testDb.db, targetId, { slug: 'renamed' })
    const source = (await getPostById(testDb.db, sourceId))!
    expect((await getTranslations(testDb.db, source))[0].slug).toBe('renamed')
    await unlinkTranslation(testDb.db, targetId)
    expect(await getTranslations(testDb.db, source)).toEqual([])
    expect(await getPostBySlug(testDb.db, 'renamed')).not.toBeNull()
  })

  it('rejects same-language pairing, group merging and changing paired article language', async () => {
    const sourceId = await post('one')
    const otherId = await post('two')
    await expect(linkTranslation(testDb.db, sourceId, otherId)).rejects.toThrow()
    const { post: english } = await createTranslation(testDb.db, sourceId, 'en')
    await expect(linkTranslation(testDb.db, otherId, english.id)).rejects.toThrow()
    await expect(updatePost(testDb.db, sourceId, { language: 'en' })).rejects.toThrow()
    expect((await getPostById(testDb.db, sourceId))?.language).toBe('zh-CN')
  })

  it('allows replacing a deleted translation but prevents conflicting restoration', async () => {
    const sourceId = await post('original')
    const { post: first } = await createTranslation(testDb.db, sourceId, 'en')
    await updatePost(testDb.db, first.id, { status: 'deleted' })
    const { post: replacement } = await createTranslation(testDb.db, sourceId, 'en')
    expect(replacement.id).not.toBe(first.id)
    await expect(restorePost(testDb.db, first.slug)).rejects.toThrow()
    await unlinkTranslation(testDb.db, first.id)
    await restorePost(testDb.db, first.slug)
    expect((await getPostById(testDb.db, first.id))?.status).toBe('draft')
  })
})

describe('language URLs and migration', () => {
  it('keeps query strings and hashes while adding or removing only the language prefix', () => {
    expect(localizePath('/search?q=hello&page=2#results', 'en')).toBe('/en/search?q=hello&page=2#results')
    expect(localizePath('/en/search?q=hello', 'zh-CN')).toBe('/search?q=hello')
    expect(localizePath('https://example.com/en', 'en')).toBe('https://example.com/en')
    expect(getPostPath('english', 'en')).toBe('/en/english')
    expect(normalizeLanguage(undefined)).toBe('zh-CN')
  })

  it('upgrades existing articles without losing content or changing public slugs', () => {
    const testDb = createTestDatabase(false)
    try {
      testDb.sqlite.exec("CREATE TABLE posts (id INTEGER PRIMARY KEY, slug TEXT UNIQUE, title TEXT, content TEXT, status TEXT, deleted_at INTEGER, published_at INTEGER); CREATE TABLE categories (name TEXT, slug TEXT); INSERT INTO posts VALUES (1, 'old-link', '旧标题', '旧正文', 'published', NULL, 1)")
      testDb.sqlite.exec(readFileSync(new URL('../../db/migrations/005_add_post_languages.sql', import.meta.url), 'utf8'))
      expect(testDb.sqlite.prepare('SELECT * FROM posts').get()).toMatchObject({ slug: 'old-link', content: '旧正文', language: 'zh-CN', translation_group_id: null })
    } finally { testDb.close() }
  })
})
