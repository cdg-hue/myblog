import type { Database } from '@/lib/repositories/schema'
import type { CategoryRow } from '@/lib/repositories/types'
import type { Language } from '@/lib/i18n'
import { TaxonomyError } from './tags'

// 获取所有分类
export async function getCategories(db: Database): Promise<CategoryRow[]> {
  const { results } = await db
    .prepare('SELECT id, name, slug, post_count, name_en, sort_order, show_in_nav FROM categories ORDER BY sort_order, id')
    .all<CategoryRow>()

  return results
}

export async function getPublicCategories(db: Database, language?: Language): Promise<CategoryRow[]> {
  const { results } = await db
    .prepare(
      `SELECT categories.id, categories.name, categories.slug, categories.name_en, categories.sort_order, categories.show_in_nav, COUNT(posts.id) as post_count
       FROM categories
       LEFT JOIN posts
         ON posts.category = categories.name
       AND posts.status = 'published'
         AND posts.password IS NULL
         AND posts.is_hidden = 0
         AND posts.deleted_at IS NULL
         ${language ? 'AND posts.language = ?' : ''}
       GROUP BY categories.name, categories.slug, categories.name_en
       HAVING categories.show_in_nav = 1 OR COUNT(posts.id) > 0
       ORDER BY categories.sort_order, categories.id`,
    )
    .bind(...(language ? [language] : []))
    .all<CategoryRow>()

  return results
}

// 创建分类
export async function createCategory(db: Database, name: string, slug: string, nameEn?: string, options?: { sort_order?: number; show_in_nav?: number }): Promise<void> {
  await db.prepare('INSERT INTO categories (name, slug, name_en, sort_order, show_in_nav) VALUES (?, ?, ?, ?, ?)').bind(name, slug, nameEn?.trim() || null, options?.sort_order ?? 100, options?.show_in_nav ?? 0).run()
}

// 更新分类
export async function updateCategory(db: Database, oldSlug: string, name: string, newSlug: string, nameEn?: string, options?: { sort_order?: number; show_in_nav?: number }): Promise<void> {
  const cat = await db
    .prepare('SELECT * FROM categories WHERE slug = ?')
    .bind(oldSlug)
    .first<CategoryRow>()

  if (!cat) throw new TaxonomyError('栏目不存在', 404)
  await db.batch([
    db.prepare('UPDATE categories SET name = ?, slug = ?, name_en = ?, sort_order = ?, show_in_nav = ? WHERE slug = ?')
      .bind(name, newSlug, nameEn === undefined ? cat.name_en ?? null : nameEn.trim() || null, options?.sort_order ?? cat.sort_order ?? 100, options?.show_in_nav ?? cat.show_in_nav ?? 0, oldSlug),
    db.prepare('UPDATE posts SET category = ? WHERE category = ?').bind(name, cat.name),
  ])
}

// 删除分类
export async function deleteCategory(db: Database, slug: string): Promise<void> {
  const used = await db.prepare('SELECT COUNT(*) AS count FROM posts JOIN categories ON posts.category = categories.name WHERE categories.slug = ?').bind(slug).first<{ count: number }>()
  if (used?.count) throw new TaxonomyError('该栏目仍有文章，请先移动文章或关闭导航显示', 409)
  await db.batch([
    db.prepare('DELETE FROM tags WHERE category_id = (SELECT id FROM categories WHERE slug = ?)').bind(slug),
    db.prepare('DELETE FROM categories WHERE slug = ?').bind(slug),
  ])
}
