import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '../helpers/sqlite-d1'
import { createPost, getPostById, getPostsByCategory, getPostsCountByCategory, updatePost } from '@/lib/repositories/posts'
import { getPublicCategories, updateCategory } from '@/lib/repositories/categories'
import { createTag, deleteTag, getCategoryTags, updateTag } from '@/lib/repositories/tags'
import { readFileSync } from 'node:fs'

describe('column-owned article tags', () => {
  let test: ReturnType<typeof createTestDatabase>
  beforeEach(() => {
    test = createTestDatabase()
    test.sqlite.exec("INSERT INTO categories (name, slug, show_in_nav, sort_order) VALUES ('软件测评', 'reviews', 1, 10), ('出海基建', 'global-setup', 1, 30)")
  })
  afterEach(() => test.close())
  const post = (slug: string, extra = {}) => createPost(test.db, { slug, title: slug, content: 'Article body', html: '<p>Article body</p>', category: '出海基建', tags: ['手机卡'], ...extra })

  it('keeps configured empty columns visible with zero public articles', async () => {
    const columns = await getPublicCategories(test.db, 'en')
    expect(columns.map(c => c.name)).toEqual(['软件测评', '出海基建'])
    expect(columns.every(c => c.post_count === 0)).toBe(true)
  })

  it('registers manual tags only under the selected column and keeps stable IDs', async () => {
    await post('phone')
    const tags = await getCategoryTags(test.db, 'global-setup')
    expect(tags).toEqual([expect.objectContaining({ name: '手机卡', post_count: 1 })])
    expect(await getCategoryTags(test.db, 'reviews')).toEqual([])
    await createTag(test.db, 'reviews', { name: '手机卡', slug: 'sim' })
    expect((await getCategoryTags(test.db, 'reviews'))[0].id).not.toBe(tags[0].id)
  })

  it('filters by column, tag and language before pagination and counts', async () => {
    await createTag(test.db, 'global-setup', { name: '手机卡', name_en: 'SIM cards', slug: 'sim' })
    await post('phone-en', { language: 'en' })
    await post('phone-zh')
    await post('hidden', { is_hidden: 1, language: 'en' })
    await post('protected', { password: 'private', language: 'en' })
    await post('draft', { status: 'draft', language: 'en' })
    await post('bank', { tags: ['银行卡'], language: 'en' })
    expect((await getPostsByCategory(test.db, '出海基建', 1, 0, 'en', 'sim')).map(p => p.slug)).toEqual(['phone-en'])
    expect(await getPostsCountByCategory(test.db, '出海基建', 'en', 'sim')).toBe(1)
    expect(await getPostsCountByCategory(test.db, '软件测评', 'en', 'sim')).toBe(0)
    expect(await getCategoryTags(test.db, 'global-setup', 'en')).toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'sim', post_count: 1 })]))
  })

  it('maps English tag labels to the same managed tag', async () => {
    await createTag(test.db, 'global-setup', { name: '手机卡', name_en: 'SIM cards', slug: 'sim' })
    const id = await post('english-label', { tags: ['SIM cards'], language: 'en' })
    expect((await getPostById(test.db, id))?.tags).toEqual(['手机卡'])
    expect(await getCategoryTags(test.db, 'global-setup')).toHaveLength(1)
  })

  it('renames tags atomically without breaking their URLs or article content', async () => {
    await createTag(test.db, 'global-setup', { name: '手机卡', slug: 'sim' })
    const id = await post('phone')
    const tag = (await getCategoryTags(test.db, 'global-setup'))[0]
    await updateTag(test.db, tag.id, { name: '海外手机卡', name_en: 'SIM cards' })
    expect((await getCategoryTags(test.db, 'global-setup'))[0]).toMatchObject({ id: tag.id, slug: 'sim', name: '海外手机卡', post_count: 1 })
    expect(await getPostById(test.db, id)).toMatchObject({ tags: ['海外手机卡'], content: 'Article body' })
  })

  it('removes tag associations but not articles when deleting a tag', async () => {
    const id = await post('phone', { tags: ['手机卡', '银行卡'] })
    const tag = (await getCategoryTags(test.db, 'global-setup')).find(t => t.name === '手机卡')!
    await deleteTag(test.db, tag.id)
    expect(await getPostById(test.db, id)).toMatchObject({ tags: ['银行卡'], content: 'Article body' })
    expect(test.sqlite.prepare('SELECT COUNT(*) AS count FROM post_tags WHERE tag_id = ?').get(tag.id)?.count).toBe(0)
  })

  it('keeps tag IDs and article associations when renaming a column', async () => {
    const id = await post('phone')
    const tag = (await getCategoryTags(test.db, 'global-setup'))[0]
    await updateCategory(test.db, 'global-setup', '跨境基建', 'global-setup', 'Global Setup')
    expect((await getCategoryTags(test.db, 'global-setup'))[0].id).toBe(tag.id)
    expect(await getPostById(test.db, id)).toMatchObject({ category: '跨境基建', tags: ['手机卡'] })
  })

  it('requires an explicit tag decision when moving an article', async () => {
    const id = await post('phone')
    await expect(updatePost(test.db, id, { category: '软件测评' })).rejects.toThrow('标签')
    await updatePost(test.db, id, { category: '软件测评', tags: [] })
    expect(await getPostById(test.db, id)).toMatchObject({ category: '软件测评', tags: [] })
    expect(await getCategoryTags(test.db, 'reviews')).toEqual([])
  })

  it('rejects malformed tags and unknown columns without changing articles', async () => {
    await expect(post('invalid-tags', { tags: ['x'.repeat(61)] })).rejects.toThrow()
    await expect(post('unknown', { category: 'Unknown' })).rejects.toThrow()
    expect(test.sqlite.prepare('SELECT COUNT(*) AS count FROM posts').get()?.count).toBe(0)
  })
})

it('migrates existing article tags without changing article content or creating a navigation item for legacy columns', () => {
  const test = createTestDatabase(false)
  try {
    test.sqlite.exec(`CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT UNIQUE, slug TEXT UNIQUE, post_count INTEGER DEFAULT 0, name_en TEXT);
      CREATE TABLE posts (id INTEGER PRIMARY KEY, slug TEXT, category TEXT, tags TEXT, content TEXT);
      INSERT INTO categories VALUES (1, '随笔', 'notes', 1, NULL);
      INSERT INTO posts VALUES (1, 'old-post', '随笔', '["个人"]', 'original content');`)
    test.sqlite.exec(readFileSync(new URL('../../db/migrations/007_add_column_tags.sql', import.meta.url), 'utf8'))
    expect(test.sqlite.prepare('SELECT slug, category, tags, content FROM posts WHERE id = 1').get()).toMatchObject({ slug: 'old-post', category: '随笔', tags: '["个人"]', content: 'original content' })
    expect(test.sqlite.prepare('SELECT show_in_nav FROM categories WHERE name = ?').get('随笔')?.show_in_nav).toBe(0)
    expect(test.sqlite.prepare('SELECT COUNT(*) AS count FROM post_tags WHERE post_id = 1').get()?.count).toBe(1)
    expect(test.sqlite.prepare('SELECT COUNT(*) AS count FROM categories WHERE show_in_nav = 1').get()?.count).toBe(3)
  } finally { test.close() }
})
