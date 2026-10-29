import { nanoid } from 'nanoid'
import type { Language } from '@/lib/i18n'
import type { Database } from './schema'

export class TaxonomyError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export interface TagRow {
  id: number
  category_id: number
  name: string
  name_en: string | null
  slug: string
  sort_order: number
  post_count: number
}

async function requireCategory(db: Database, category: string) {
  const row = await db.prepare('SELECT id, name FROM categories WHERE slug = ? OR name = ?').bind(category, category).first<{ id: number; name: string }>()
  if (!row) throw new TaxonomyError('栏目不存在，请先在后台创建栏目', 404)
  return row
}

export async function getCategoryTags(db: Database, category: string, language?: Language): Promise<TagRow[]> {
  const { results } = await db.prepare(`SELECT t.*, COUNT(p.id) AS post_count FROM tags t
    JOIN categories c ON c.id = t.category_id
    LEFT JOIN post_tags pt ON pt.tag_id = t.id
    LEFT JOIN posts p ON p.id = pt.post_id AND p.status = 'published' AND p.deleted_at IS NULL
      AND p.password IS NULL AND p.is_hidden = 0 ${language ? 'AND p.language = ?' : ''}
    WHERE c.slug = ? OR c.name = ? GROUP BY t.id ORDER BY t.sort_order, t.id`)
    .bind(...(language ? [language] : []), category, category).all<TagRow>()
  return results
}

function tagName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 60) throw new TaxonomyError('标签名称需要为 1～60 个字符')
  return value.trim().normalize('NFKC')
}

function englishName(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 120) throw new TaxonomyError('英文名称格式不正确')
  return value.trim() || null
}

function order(value: unknown): number {
  if (value === undefined) return 100
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 10000) throw new TaxonomyError('排序需要为 0～10000 的整数')
  return Number(value)
}

export async function createTag(db: Database, category: string, input: { name: unknown; name_en?: unknown; slug?: unknown; sort_order?: unknown }) {
  const column = await requireCategory(db, category)
  const name = tagName(input.name)
  const slug = input.slug === undefined ? `tag-${nanoid(12).toLowerCase().replace(/[^a-z0-9]/g, 'a')}` : input.slug
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) throw new TaxonomyError('标签地址请使用英文、数字和连字符')
  await db.prepare('INSERT INTO tags (category_id, name, name_en, slug, sort_order) VALUES (?, ?, ?, ?, ?)')
    .bind(column.id, name, englishName(input.name_en), slug, order(input.sort_order)).run()
}

export async function updateTag(db: Database, id: number, input: { name: unknown; name_en?: unknown; sort_order?: unknown }) {
  const tag = await db.prepare('SELECT t.*, c.name AS category FROM tags t JOIN categories c ON c.id = t.category_id WHERE t.id = ?').bind(id).first<TagRow & { category: string }>()
  if (!tag) throw new TaxonomyError('标签不存在', 404)
  const name = tagName(input.name)
  await db.batch([
    db.prepare('UPDATE tags SET name = ?, name_en = ?, sort_order = ? WHERE id = ?')
      .bind(name, input.name_en === undefined ? tag.name_en : englishName(input.name_en), input.sort_order === undefined ? tag.sort_order : order(input.sort_order), id),
    db.prepare(`UPDATE posts SET tags = (SELECT json_group_array(CASE WHEN value = ? THEN ? ELSE value END)
      FROM json_each(CASE WHEN json_valid(posts.tags) THEN posts.tags ELSE '[]' END))
      WHERE category = ? AND EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(posts.tags) THEN posts.tags ELSE '[]' END) WHERE value = ?)`)
      .bind(tag.name, name, tag.category, tag.name),
  ])
}

export async function deleteTag(db: Database, id: number) {
  const tag = await db.prepare('SELECT t.*, c.name AS category FROM tags t JOIN categories c ON c.id = t.category_id WHERE t.id = ?').bind(id).first<TagRow & { category: string }>()
  if (!tag) throw new TaxonomyError('标签不存在', 404)
  await db.batch([
    db.prepare(`UPDATE posts SET tags = (SELECT json_group_array(value) FROM json_each(CASE WHEN json_valid(posts.tags) THEN posts.tags ELSE '[]' END) WHERE value != ?)
      WHERE category = ? AND id IN (SELECT post_id FROM post_tags WHERE tag_id = ?)`)
      .bind(tag.name, tag.category, id),
    db.prepare('DELETE FROM tags WHERE id = ?').bind(id),
  ])
}

export async function normalizeArticleTags(db: Database, category: string, value: unknown): Promise<string[]> {
  if (category !== '未分类') await requireCategory(db, category)
  if (!Array.isArray(value) || value.length > 10) throw new TaxonomyError('文章最多选择 10 个标签')
  const names = [...new Set(value.map(tagName))]
  if (!names.length) return []
  if (category === '未分类') {
    await db.prepare("INSERT OR IGNORE INTO categories (name, slug) VALUES ('未分类', 'uncategorized')").run()
    await requireCategory(db, category)
  }
  const tags = await getCategoryTags(db, category)
  return [...new Set(names.map(name => tags.find(tag => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase())?.name || tags.find(tag => [tag.name_en, tag.slug].some(label => label?.toLocaleLowerCase() === name.toLocaleLowerCase()))?.name || name))]
}
