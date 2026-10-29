import type { MetadataRoute } from 'next'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import { getPosts, getPublicCategories } from '@/lib/db'
import { getSiteUrl } from '@/lib/site-config'
import { getPostPath, LANGUAGES } from '@/lib/i18n'
import { articleLanguages, publicPath } from '@/lib/public-i18n'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl()
  const entries: MetadataRoute.Sitemap = [
    ...LANGUAGES.map(language => ({
      url: `${baseUrl}${publicPath('/', language)}`,
      changeFrequency: 'daily' as const, priority: 1,
      alternates: { languages: { 'zh-CN': `${baseUrl}/`, en: `${baseUrl}/en` } },
    })),
  ]

  try {
    const env = await getAppCloudflareEnv()
    if (env?.DB) {
      // Only published, non-deleted, non-hidden, non-password posts
      const categories = await getPublicCategories(env.DB)
      const posts: Awaited<ReturnType<typeof getPosts>> = []
      for (const language of LANGUAGES) {
        for (let offset = 0; ; offset += 1000) {
          const batch = await getPosts(env.DB, 1000, offset, false, false, false, false, language)
          posts.push(...batch)
          if (batch.length < 1000) break
        }
      }
      const groups = new Map<string, typeof posts>()
      for (const post of posts) {
        if (!post.translation_group_id) continue
        const group = groups.get(post.translation_group_id) ?? []
        group.push(post)
        groups.set(post.translation_group_id, group)
      }
      for (const post of posts) {
        entries.push({
          url: `${baseUrl}${getPostPath(post.slug, post.language)}`,
          lastModified: new Date((post.updated_at || post.published_at) * 1000),
          alternates: { languages: articleLanguages(post, groups.get(post.translation_group_id || '') ?? []) },
          changeFrequency: 'weekly',
          priority: 0.8,
        })
      }

      for (const category of categories) {
        if (category.slug && category.name !== '未分类') {
          for (const language of LANGUAGES) {
            const path = `/category/${encodeURIComponent(category.slug)}`
            entries.push({
              url: `${baseUrl}${publicPath(path, language)}`,
              alternates: { languages: { 'zh-CN': `${baseUrl}${path}`, en: `${baseUrl}${publicPath(path, 'en')}` } },
              changeFrequency: 'weekly', priority: 0.6,
            })
          }
        }
      }
    }
  } catch {}
  return entries
}
