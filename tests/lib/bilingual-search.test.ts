import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDatabase } from '../helpers/sqlite-d1'
import { createPost, getPostById } from '@/lib/repositories/posts'
import { getRelatedPosts, searchPostsWithStrategy } from '@/lib/related-content'

describe('bilingual search and related posts', () => {
  let testDb: ReturnType<typeof createTestDatabase>
  let currentId: number
  beforeEach(async () => {
    testDb = createTestDatabase()
    for (const [slug, language] of [['chinese', 'zh-CN'], ['english', 'en'], ['english-related', 'en']] as const) {
      const id = await createPost(testDb.db, { slug, language, title: 'Hello SQLite', content: 'SQLite database tutorial', html: '<p>SQLite</p>', category: '技术', tags: ['SQLite'] })
      if (slug === 'english') currentId = id
    }
  })
  afterEach(() => testDb.close())

  it('returns English FTS results and recommendations without Chinese articles', async () => {
    const search = await searchPostsWithStrategy(testDb.db, {}, 'Hello', { language: 'en' })
    expect(search.results.map(p => p.slug).sort()).toEqual(['english', 'english-related'])
    const current = (await getPostById(testDb.db, currentId))!
    const related = await getRelatedPosts(testDb.db, {}, current)
    expect(related.results.map(p => p.slug)).toEqual(['english-related'])
  })

  it('filters vector candidates against database language and visibility', async () => {
    const env = {
      ENABLE_VECTOR_SEARCH: 'true',
      VECTOR_INDEX: {
        describe: vi.fn().mockResolvedValue({ dimensions: 128 }),
        query: vi.fn().mockResolvedValue({ matches: [{ metadata: { slug: 'chinese' } }, { metadata: { slug: 'english-related' } }] }),
      },
    } as unknown as Partial<CloudflareEnv>
    const result = await searchPostsWithStrategy(testDb.db, env, 'Hello', { language: 'en' })
    expect(result.results.map(p => p.slug)).toEqual(['english-related'])
  })

  it('finds Chinese phrases inside a sentence when the default FTS tokenizer has no exact token', async () => {
    const id = await createPost(testDb.db, { slug: 'chinese-search', title: '我的双语博客发布流程', content: '记录中文和英文的写作过程。', html: '<p>正文</p>' })
    const result = await searchPostsWithStrategy(testDb.db, {}, '双语', { language: 'zh-CN' })
    expect(result.results.map(post => post.id)).toContain(id)
  })
})
