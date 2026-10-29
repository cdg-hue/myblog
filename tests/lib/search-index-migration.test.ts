import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createTestDatabase } from '../helpers/sqlite-d1'
import { createPost, updatePost } from '@/lib/repositories/posts'
import { searchPosts } from '@/lib/repositories/search'

describe('repairing the existing full-text search index', () => {
  it('rebuilds missing synchronization and tracks content changes, metadata updates and deletes', async () => {
    const testDb = createTestDatabase()
    try {
      testDb.sqlite.exec('DROP TRIGGER posts_ai; DROP TRIGGER posts_au; DROP TRIGGER posts_ad;')
      const id = await createPost(testDb.db, { slug: 'index-test', title: 'Originalneedle', content: 'Original content', html: '<p>Original content</p>', language: 'en' })
      const indexedIds = (term: string) => testDb.sqlite.prepare('SELECT rowid FROM posts_fts WHERE posts_fts MATCH ?').all(term).map(row => row.rowid)
      expect(indexedIds('Originalneedle')).toEqual([])
      testDb.sqlite.exec(readFileSync(new URL('../../db/migrations/006_repair_search_index.sql', import.meta.url), 'utf8'))
      expect((await searchPosts(testDb.db, 'Originalneedle')).map(p => p.id)).toEqual([id])
      expect(indexedIds('Originalneedle')).toEqual([id])
      await updatePost(testDb.db, id, { title: 'Replacementneedle', content: 'Changed content' })
      expect(await searchPosts(testDb.db, 'Originalneedle')).toEqual([])
      expect(indexedIds('Originalneedle')).toEqual([])
      expect((await searchPosts(testDb.db, 'Replacementneedle')).map(p => p.id)).toEqual([id])
      expect(indexedIds('Replacementneedle')).toEqual([id])
      for (let index = 0; index < 3; index++) await updatePost(testDb.db, id, { is_pinned: index % 2 })
      expect((await searchPosts(testDb.db, 'Replacementneedle')).map(p => p.id)).toEqual([id])
      await testDb.db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run()
      expect(await searchPosts(testDb.db, 'Replacementneedle')).toEqual([])
      expect(indexedIds('Replacementneedle')).toEqual([])
    } finally { testDb.close() }
  })
})
