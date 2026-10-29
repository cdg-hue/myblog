import { getAppCloudflareEnv } from '@/lib/cloudflare'
import { getSiteUrl } from '@/lib/site-config'
import { getPostPath, type Language } from '@/lib/i18n'
import { publicPath, publicText } from '@/lib/public-i18n'

const SITE_URL = getSiteUrl()

interface RssPost {
  slug: string
  title: string
  description: string | null
  html: string | null
  category: string | null
  published_at: number
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function getPublicFeed(language: Language) {
  let posts: RssPost[] = []

  try {
    const env = await getAppCloudflareEnv()
    if (env?.DB) {
      // RSS needs html field; query directly to include it
      const { results } = await env.DB
        .prepare(
          `SELECT posts.slug, posts.title, posts.description, posts.html,
             CASE WHEN ? = 'en' THEN COALESCE(NULLIF(categories.name_en, ''), posts.category) ELSE posts.category END AS category,
             posts.published_at
           FROM posts LEFT JOIN categories ON categories.name = posts.category
           WHERE posts.status = 'published' AND posts.deleted_at IS NULL AND posts.password IS NULL AND posts.is_hidden = 0
             AND COALESCE(posts.language, 'zh-CN') = ?
           ORDER BY posts.published_at DESC
           LIMIT 50`
        )
        .bind(language, language)
        .all()
      posts = results as unknown as RssPost[]
    }
  } catch (error) {
    console.error('RSS: failed to fetch posts', error)
    return new Response('Feed temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }

  const items = posts
    .map((p) => {
      const pubDate = new Date(p.published_at * 1000).toUTCString()
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${escapeXml(`${SITE_URL}${getPostPath(p.slug, language)}`)}</link>
      <guid isPermaLink="true">${escapeXml(`${SITE_URL}${getPostPath(p.slug, language)}`)}</guid>
      <description>${escapeXml(p.description || '')}</description>
      <content:encoded><![CDATA[${(p.html || '').replaceAll(']]>', ']]]]><![CDATA[>')}]]></content:encoded>
      <category>${escapeXml(publicText(language, p.category || '未分类'))}</category>
      <pubDate>${pubDate}</pubDate>
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${publicText(language, '阿成')}</title>
    <link>${SITE_URL}${publicPath('/', language)}</link>
    <description>${publicText(language, '记录思考，分享所学，留住当下。')}</description>
    <language>${language}</language>
    <atom:link href="${SITE_URL}${publicPath('/feed.xml', language)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
