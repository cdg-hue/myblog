import { NextRequest, NextResponse } from 'next/server'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import { searchPostsWithStrategy } from '@/lib/related-content'
import { normalizeLanguage } from '@/lib/i18n'

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get('q')

    if (!query || !query.trim()) {
      return NextResponse.json({ results: [] })
    }

    const env = await getAppCloudflareEnv()

    if (!env?.DB) {
      return NextResponse.json({ results: [] })
    }

    const language = normalizeLanguage(req.nextUrl.searchParams.get('language'))
    const result = await searchPostsWithStrategy(env.DB, env, query.trim(), { limit: 50, language })

    return NextResponse.json({
      strategy: result.strategy,
      source: result.source,
      results: result.results.map((p) => ({
        slug: p.slug,
        title: p.title,
        description: p.description,
        category: p.category,
        published_at: p.published_at,
        password: !!p.password,
        language: normalizeLanguage(p.language),
      })),
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ results: [] })
  }
}
