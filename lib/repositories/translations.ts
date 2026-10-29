import { nanoid } from 'nanoid'
import { normalizeLanguage, type Language } from '@/lib/i18n'
import { getPostById, getPostBySlug } from '@/lib/repositories/posts'
import { mapPostWithTags } from '@/lib/repositories/post-mappers'
import type { Database } from '@/lib/repositories/schema'
import type { Post, PostWithTags } from '@/lib/repositories/types'

export class TranslationError extends Error {
  constructor(message: string, public status = 409) { super(message) }
}

export function isTranslationConflict(error: unknown): boolean {
  return error instanceof TranslationError || (error instanceof Error && /UNIQUE constraint failed: posts\.(translation_group_id|language)/i.test(error.message))
}

export async function getTranslations(
  db: Database,
  post: Pick<Post, 'id' | 'language' | 'translation_group_id'>,
  publicOnly = false,
): Promise<PostWithTags[]> {
  if (!post.translation_group_id) return []
  const { results } = await db.prepare(
    `SELECT * FROM posts WHERE translation_group_id = ? AND id != ? AND language != ?
     AND deleted_at IS NULL AND status != 'deleted'
     ${publicOnly ? "AND status = 'published' AND password IS NULL AND is_hidden = 0" : ''}
     ORDER BY language`,
  ).bind(post.translation_group_id, post.id, normalizeLanguage(post.language)).all<Post>()
  return results.map(mapPostWithTags)
}

async function requireActivePost(db: Database, id: number) {
  const post = await getPostById(db, id)
  if (!post || post.deleted_at != null || post.status === 'deleted') {
    throw new TranslationError('文章不存在或已删除', 404)
  }
  return post
}

export async function createTranslation(db: Database, sourceId: number, language: Language) {
  const source = await requireActivePost(db, sourceId)
  if (normalizeLanguage(source.language) === language) throw new TranslationError('译文语言必须与原文不同', 400)
  const existing = (await getTranslations(db, source)).find(post => post.language === language)
  if (existing) return { post: existing, created: false }

  const suffix = language === 'en' ? 'en' : 'zh'
  const baseSlug = `${source.slug}-${suffix}`
  const slug = await getPostBySlug(db, baseSlug) ? `${baseSlug}-${nanoid(6)}` : baseSlug
  const group = source.translation_group_id || nanoid()
  try {
    const results = await db.batch([
      db.prepare(`UPDATE posts SET translation_group_id = COALESCE(translation_group_id, ?)
        WHERE id = ? AND deleted_at IS NULL AND language != ?`).bind(group, sourceId, language),
      db.prepare(`INSERT INTO posts
        (slug, title, content, html, description, category, tags, status, password, is_hidden, cover_image, language, translation_group_id)
        SELECT ?, title, content, html, description, category, tags, 'draft', password, is_hidden, cover_image, ?, translation_group_id
        FROM posts AS source WHERE id = ? AND deleted_at IS NULL AND language != ?
        AND NOT EXISTS (SELECT 1 FROM posts AS target WHERE target.translation_group_id = source.translation_group_id
          AND target.language = ? AND target.deleted_at IS NULL) RETURNING id`)
        .bind(slug, language, sourceId, language, language),
      db.prepare('UPDATE categories SET post_count = post_count + changes() WHERE name = ?').bind(source.category),
    ])
    const latestSource = await requireActivePost(db, sourceId)
    const counterpart = (await getTranslations(db, latestSource)).find(post => post.language === language)
    if (!counterpart) throw new TranslationError('原文已发生变化，请刷新后重试')
    return { post: counterpart, created: Boolean(results[1].results?.length) }
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
      const latestSource = await requireActivePost(db, sourceId)
      const counterpart = (await getTranslations(db, latestSource)).find(post => post.language === language)
      if (counterpart) return { post: counterpart, created: false }
      throw new TranslationError('译文创建冲突，请刷新后重试')
    }
    throw error
  }
}

export async function linkTranslation(db: Database, sourceId: number, targetId: number): Promise<void> {
  const source = await requireActivePost(db, sourceId)
  const target = await requireActivePost(db, targetId)
  if (normalizeLanguage(source.language) === normalizeLanguage(target.language)) {
    throw new TranslationError('只能关联不同语言的文章', 400)
  }
  if (source.translation_group_id && target.translation_group_id && source.translation_group_id !== target.translation_group_id) {
    throw new TranslationError('文章已关联其他译文，请先解除原有关联')
  }
  if (source.translation_group_id && source.translation_group_id === target.translation_group_id) return

  const group = source.translation_group_id || target.translation_group_id || nanoid()
  try {
    // Materialize the expected pair before either row changes, then update both atomically.
    const result = await db.prepare(`WITH candidates AS MATERIALIZED (
      SELECT id FROM posts WHERE deleted_at IS NULL AND status != 'deleted' AND
        ((id = ? AND language = ? AND translation_group_id IS ?)
        OR (id = ? AND language = ? AND translation_group_id IS ?))
      ) UPDATE posts SET translation_group_id = ?, updated_at = strftime('%s', 'now')
      WHERE id IN (SELECT id FROM candidates) AND (SELECT COUNT(*) FROM candidates) = 2 RETURNING id`)
      .bind(source.id, normalizeLanguage(source.language), source.translation_group_id ?? null,
        target.id, normalizeLanguage(target.language), target.translation_group_id ?? null, group).all<{ id: number }>()
    if (result.results.length !== 2) throw new TranslationError('文章关联已变化，请刷新后重试')
  } catch (error) {
    if (isTranslationConflict(error)) throw new TranslationError('文章已有同语言译文，请先解除原有关联')
    throw error
  }
}

export async function unlinkTranslation(db: Database, id: number): Promise<void> {
  const post = await getPostById(db, id)
  if (!post) throw new TranslationError('文章不存在', 404)
  await db.prepare("UPDATE posts SET translation_group_id = NULL, updated_at = strftime('%s', 'now') WHERE id = ?").bind(id).run()
}
