import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPostsByCategory, getPostsCountByCategory, getPublicCategories } from '@/lib/db'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { getCategoryTags } from '@/lib/repositories/tags'
import { Pagination } from '@/components/Pagination'
import { getSiteHeaderData } from '@/lib/site'

import { type Language, getOtherLanguage, getPostPath } from '@/lib/i18n'
import { articleCount, formatPublicDate, publicMetadata, publicPath, publicText } from '@/lib/public-i18n'
import { PublicLocaleProvider } from '@/components/PublicLocale'

const PAGE_SIZE = 25

export async function getCategoryMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}, language: Language = 'zh-CN') {
  const { slug } = await params

  try {
    const env = await getAppCloudflareEnv()
    if (!env?.DB) return {}

    const categories = await getPublicCategories(env.DB)
    const category = categories.find((item) => item.slug === slug)
    if (!category) return {}

    return publicMetadata(language, `/category/${encodeURIComponent(slug)}`, language === 'en' ? category.name_en?.trim() || publicText(language, category.name) : category.name)
  } catch {
    return {}
  }
}

export default async function PublicCategoryPage({
  params,
  searchParams,
  language = 'zh-CN',
}: {
  language?: Language
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string; tag?: string }>
}) {
  const { slug } = await params
  const { page: pageStr, tag } = await searchParams
  const tagSlug = typeof tag === 'string' ? tag : undefined
  const currentPage = Math.max(1, parseInt(pageStr ?? '1', 10) || 1)

  const env = await getAppCloudflareEnv()
  if (!env?.DB) notFound()

  const categories = await getPublicCategories(env.DB)
  const category = categories.find((item) => item.slug === slug)
  if (!category) notFound()

  const [posts, totalCount, headerData, tags] = await Promise.all([
    getPostsByCategory(env.DB, category.name, PAGE_SIZE, (currentPage - 1) * PAGE_SIZE, language, ...(tagSlug ? [tagSlug] : [])),
    getPostsCountByCategory(env.DB, category.name, language, ...(tagSlug ? [tagSlug] : [])),
    getSiteHeaderData(env.DB, language),
    getCategoryTags(env.DB, slug, language),
  ])
  if (tagSlug && !tags.some(item => item.slug === tagSlug)) notFound()
  const tagQuery = tagSlug ? `?tag=${encodeURIComponent(tagSlug)}` : ''

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const t = (text: string) => publicText(language, text)
  const categoryLabel = language === 'en' ? category.name_en?.trim() || t(category.name) : category.name
  return (
    <PublicLocaleProvider language={language} categories={headerData.categories} switchHref={publicPath(`/category/${encodeURIComponent(slug)}${tagQuery}`, getOtherLanguage(language))}>
    <div className="min-h-full flex flex-col bg-[var(--background)]">
      <SiteHeader
        initialTheme={headerData.defaultTheme}
        navLinks={headerData.navLinks}
        categories={headerData.categories}
        activeCategorySlug={slug}
      />

      <main className="page-main flex-1 mx-auto max-w-3xl w-full px-4 sm:px-6 py-10 sm:py-14">
        <div className="mb-8 border-b border-[var(--editor-line)] pb-6">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--stone-gray)] mb-3">
            {t('栏目')}
          </div>
          <h1 className="article-display-title text-3xl sm:text-4xl font-bold text-[var(--editor-ink)] leading-tight">
            {categoryLabel}
          </h1>
          <p className="mt-3 text-sm text-[var(--editor-muted)]">
            {articleCount(totalCount, language)}
          </p>
        </div>

        <nav aria-label={t('标签')} className="mb-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--editor-line)]">
          <Link href={publicPath(`/category/${encodeURIComponent(slug)}`, language)} aria-current={!tagSlug ? 'page' : undefined} className={`border-b-2 py-3 text-sm font-medium ${!tagSlug ? 'border-[var(--editor-accent)] text-[var(--editor-accent)]' : 'border-transparent text-[var(--editor-muted)]'}`}>{t('全部')}</Link>
          {tags.filter(item => item.post_count > 0 || item.slug === tagSlug).map(item => (
            <Link key={item.id} href={publicPath(`/category/${encodeURIComponent(slug)}?tag=${encodeURIComponent(item.slug)}`, language)} aria-current={item.slug === tagSlug ? 'page' : undefined} className={`border-b-2 py-3 text-sm ${item.slug === tagSlug ? 'border-[var(--editor-accent)] font-semibold text-[var(--editor-accent)]' : 'border-transparent text-[var(--editor-muted)] hover:text-[var(--editor-ink)]'}`}>
              {language === 'en' ? item.name_en || item.name : item.name} <span className="text-xs tabular-nums">{item.post_count}</span>
            </Link>
          ))}
        </nav>

        {posts.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-[var(--editor-muted)] mb-2">{t(tagSlug ? '该标签下还没有公开文章' : '这个栏目下还没有公开文章')}</p>
            <Link
              href={publicPath('/', language)}
              className="text-sm text-[var(--editor-accent)] hover:underline underline-offset-2"
            >
              {t('返回首页')}
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-0">
              {posts.map((post, index) => (
                <article
                  key={post.slug}
                  className="group border-t border-[var(--editor-line)] first:border-t-0"
                  style={{ animation: `fadeInUp 0.4s ease-out ${index * 0.05}s both` }}
                >
                  <Link
                    href={getPostPath(post.slug, language)}
                    className="block py-6 sm:py-7 transition-all duration-200 hover:bg-[var(--editor-panel)] border-l-2 border-l-transparent hover:border-l-[var(--editor-accent)] pl-4"
                  >
                    <h2 className="text-xl sm:text-2xl font-bold text-[var(--editor-ink)] leading-snug mb-2 group-hover:text-[var(--editor-accent)] transition-colors duration-200">
                      {post.title}
                    </h2>
                    {post.description ? (
                      <p className="text-sm text-[var(--editor-muted)] leading-relaxed line-clamp-2 mb-2.5">
                        {post.description}
                      </p>
                    ) : null}
                    <div className="flex items-center gap-2 text-xs text-[var(--stone-gray)]">
                      <time>{formatPublicDate(post.published_at, language)}</time>
                      <span aria-hidden>·</span>
                      <span className="px-2 py-0.5 rounded-full bg-[var(--editor-accent)]/8 text-[var(--editor-accent)] font-medium border border-[var(--editor-accent)]/15">
                        {categoryLabel}
                      </span>
                    </div>
                  </Link>
                </article>
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              basePath={publicPath(`/category/${encodeURIComponent(slug)}${tagQuery}`, language)}
              language={language}
            />
          </>
        )}
      </main>

      <SiteFooter />
    </div>
    </PublicLocaleProvider>
  )
}
