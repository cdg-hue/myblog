import { normalizeTheme, type Theme } from '@/lib/appearance'
import { getPublicCategories, getSetting } from '@/lib/db'
import { type Language } from '@/lib/i18n'
import { publicPath } from '@/lib/public-i18n'

export interface SiteNavLink {
  label: string
  label_en?: string
  url: string
  openInNewTab: boolean
}

export interface SiteCategoryLink {
  name: string
  slug: string
  displayName?: string
  name_en?: string | null
  show_in_nav?: number
}

export async function getSiteHeaderData(db: D1Database, language: Language = 'zh-CN'): Promise<{
  navLinks: SiteNavLink[]
  categories: SiteCategoryLink[]
  defaultTheme: Theme
}> {
  let navLinks: SiteNavLink[] = []
  let categories: SiteCategoryLink[] = []
  let defaultTheme: Theme = normalizeTheme(null)

  try {
    const [navJson, categoryRows, themeValue] = await Promise.all([
      getSetting(db, 'nav_links'),
      getPublicCategories(db, language),
      getSetting(db, 'default_theme'),
    ])

    if (navJson) {
      try {
        const parsed = JSON.parse(navJson)
        if (Array.isArray(parsed)) {
          navLinks = parsed
            .filter((link): link is SiteNavLink => Boolean(link && typeof link.label === 'string' && typeof link.url === 'string'))
            .map(link => ({ ...link,
              label: language === 'en' && typeof link.label_en === 'string' ? link.label_en.trim() || link.label : link.label,
              url: publicPath(link.url, language),
            }))
        }
      } catch {}
    }

    categories = categoryRows
      .filter((category) => category.slug && category.name && category.name !== '未分类')
      .map((category) => ({
        name: category.name,
        slug: category.slug,
        name_en: category.name_en,
        show_in_nav: category.show_in_nav,
        displayName: language === 'en' ? category.name_en?.trim() || category.name : category.name,
      }))

    defaultTheme = normalizeTheme(themeValue)
  } catch {
    // Keep graceful fallback behavior for public pages
  }

  return { navLinks, categories, defaultTheme }
}
