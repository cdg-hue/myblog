import { getPosts, getPostsCount } from '@/lib/db'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import { SITE_THEME, type Theme } from '@/lib/appearance'
import type { SiteCategoryLink, SiteNavLink } from '@/lib/site'
import { getSiteHeaderData } from '@/lib/site'
import { HomeClient } from '@/components/HomeClient'
import { getSiteUrl } from '@/lib/site-config'

import { type Language, getOtherLanguage } from '@/lib/i18n'
import { publicPath, publicText, serializePublicJsonLd } from '@/lib/public-i18n'
import { PublicLocaleProvider } from '@/components/PublicLocale'

const PAGE_SIZE = 25
const BASE_URL = getSiteUrl()

export default async function PublicHomePage({
  searchParams,
  language = 'zh-CN',
}: {
  language?: Language
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageStr } = await searchParams
  const currentPage = Math.max(1, parseInt(pageStr ?? '1', 10) || 1)

  let posts: Awaited<ReturnType<typeof getPosts>> = []
  let totalCount = 0
  let navLinks: SiteNavLink[] = []
  let categories: SiteCategoryLink[] = []
  let defaultTheme: Theme = SITE_THEME
  try {
    const env = await getAppCloudflareEnv()
    if (env?.DB) {
      const headerData = await getSiteHeaderData(env.DB, language)
      ;[posts, totalCount] = await Promise.all([
        getPosts(env.DB, PAGE_SIZE, (currentPage - 1) * PAGE_SIZE, false, false, false, false, language),
        getPostsCount(env.DB, false, false, false, false, language),
      ])
      navLinks = headerData.navLinks
      categories = headerData.categories
      defaultTheme = headerData.defaultTheme
    }
  } catch (e) {
    console.error('Homepage: failed to fetch posts', e)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const categorySlugMap: Record<string, string> = Object.fromEntries(
    categories.map((cat) => [cat.name, cat.slug])
  )

  return (
    <PublicLocaleProvider language={language} categories={categories} switchHref={publicPath('/', getOtherLanguage(language))}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializePublicJsonLd({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: publicText(language, '阿成'),
            url: `${BASE_URL}${publicPath('/', language)}`,
            description: publicText(language, '记录思考，分享所学，留住当下。技术、生活、读书笔记的数字花园。'),
            inLanguage: language,
            potentialAction: {
              '@type': 'SearchAction',
              target: { '@type': 'EntryPoint', urlTemplate: `${BASE_URL}${publicPath('/search', language)}?q={search_term_string}` },
              'query-input': 'required name=search_term_string',
            },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializePublicJsonLd({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: publicText(language, '阿成'),
            url: `${BASE_URL}${publicPath('/', language)}`,
            logo: { '@type': 'ImageObject', url: `${BASE_URL}/icon-512.png` },
          }),
        }}
      />
      <HomeClient
        initialTheme={defaultTheme}
        posts={posts}
        categories={categories}
        navLinks={navLinks}
        currentPage={currentPage}
        totalPages={totalPages}
        categorySlugMap={categorySlugMap}
      />
    </PublicLocaleProvider>
  )
}
