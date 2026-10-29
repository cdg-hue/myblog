import type { Database } from '@/lib/repositories/schema'
import type { CategoryRow } from '@/lib/repositories/types'
import type { Language } from '@/lib/i18n'

// 获取所有分类
export async function getCategories(db: Database): Promise<CategoryRow[]> {
  const { results } = await db
    .prepare('SELECT name, slug, post_count, name_en FROM categories ORDER BY name')
    .all<CategoryRow>()

  return results
}

export async function getPublicCategories(db: Database, language?: Language): Promise<CategoryRow[]> {
  const { results } = await db
    .prepare(
      `SELECT categories.name, categories.slug, categories.name_en, COUNT(posts.id) as post_count
       FROM categories
       JOIN posts
         ON posts.category = categories.name
       WHERE posts.status = 'published'
         AND posts.password IS NULL
         AND posts.is_hidden = 0
         AND posts.deleted_at IS NULL
         ${language ? 'AND posts.language = ?' : ''}
       GROUP BY categories.name, categories.slug, categories.name_en
       ORDER BY categories.name`,
    )
    .bind(...(language ? [language] : []))
    .all<CategoryRow>()

  return results
}

// 创建分类
export async function createCategory(db: Database, name: string, slug: string, nameEn?: string): Promise<void> {
  await db.prepare('INSERT OR IGNORE INTO categories (name, slug, name_en) VALUES (?, ?, ?)').bind(name, slug, nameEn?.trim() || null).run()
}

// 更新分类
export async function updateCategory(db: Database, oldSlug: string, name: string, newSlug: string, nameEn?: string): Promise<void> {
  const cat = await db
    .prepare('SELECT name FROM categories WHERE slug = ?')
    .bind(oldSlug)
    .first<Pick<CategoryRow, 'name'>>()

  if (cat) {
    await db.prepare('UPDATE posts SET category = ? WHERE category = ?').bind(name, cat.name).run()
  }

  if (nameEn !== undefined) {
    await db.prepare('UPDATE categories SET name = ?, slug = ?, name_en = ? WHERE slug = ?').bind(name, newSlug, nameEn.trim() || null, oldSlug).run()
  } else {
    await db.prepare('UPDATE categories SET name = ?, slug = ? WHERE slug = ?').bind(name, newSlug, oldSlug).run()
  }
}

// 删除分类
export async function deleteCategory(db: Database, slug: string): Promise<void> {
  await db.prepare('DELETE FROM categories WHERE slug = ?').bind(slug).run()
}
