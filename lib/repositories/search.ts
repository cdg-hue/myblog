import { mapPostWithTags } from '@/lib/repositories/post-mappers'
import type { Database } from '@/lib/repositories/schema'
import type { Post, PostWithTags } from '@/lib/repositories/types'
import type { Language } from '@/lib/i18n'

// 全文搜索（FTS5，回退 LIKE）
export async function searchPosts(
  db: Database,
  query: string,
  limit = 20,
  includeDrafts = false,
  includeEncrypted = false,
  includeHidden = false,
  includeDeleted = false,
  language?: Language,
): Promise<PostWithTags[]> {
  let results: Post[]

  const conditions: string[] = []
  if (!includeDrafts) conditions.push("posts.status = 'published'")
  if (!includeEncrypted) conditions.push('posts.password IS NULL')
  if (!includeHidden) conditions.push('posts.is_hidden = 0')
  if (!includeDeleted) conditions.push('posts.deleted_at IS NULL')
  if (language) conditions.push('posts.language = ?')
  const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : ''

  try {
    const ftsResult = await db
      .prepare(
        `SELECT posts.* FROM posts_fts
         JOIN posts ON posts.id = posts_fts.rowid
         WHERE posts_fts MATCH ?
         ${whereClause}
         ORDER BY rank
         LIMIT ?`,
      )
      .bind(query, ...(language ? [language] : []), limit)
      .all<Post>()
    results = ftsResult.results
  } catch {
    results = []
  }
  // unicode61 treats uninterrupted Chinese as one token; also match phrases within it.
  if (results.length === 0) {
    const pattern = `%${query}%`
    const likeResult = await db
      .prepare(
        `SELECT * FROM posts
         WHERE (title LIKE ? OR content LIKE ?)
         ${whereClause}
         ORDER BY published_at DESC
         LIMIT ?`,
      )
      .bind(pattern, pattern, ...(language ? [language] : []), limit)
      .all<Post>()
    results = likeResult.results
  }

  return results.map(mapPostWithTags)
}
