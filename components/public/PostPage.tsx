import { getPostBySlug, incrementViewCount, isPubliclyAccessiblePost, isSearchIndexablePost, getTranslations } from '@/lib/db'
import { getAppCloudflareEnv } from '@/lib/cloudflare'
import { verifyPassword } from '@/lib/password'
import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { getCategoryTags } from '@/lib/repositories/tags'
import { FrontPostAdminBoundary } from '@/components/FrontPostAdminBoundary'
import { PasswordPrompt } from '@/components/PasswordPrompt'
import { TwitterEmbedsEnhancer } from '@/components/TwitterEmbedsEnhancer'
import { getSiteHeaderData } from '@/lib/site'
import { getRelatedPosts } from '@/lib/related-content'
import { getSiteUrl } from '@/lib/site-config'
import { resolvePostCoverImage } from '@/lib/default-cover-images'

import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { type Language, normalizeLanguage, getPostPath } from '@/lib/i18n'
import { articleLanguages, formatPublicDate, getPublicTranslations, publicMetadata, publicPath, publicText, readingMinutes as estimateReadingMinutes, readingTimeLabel, serializePublicJsonLd, viewsLabel } from '@/lib/public-i18n'
import { LanguageSwitcher, PublicLocaleProvider } from '@/components/PublicLocale'

export async function getPostMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}, language: Language = 'zh-CN'): Promise<Metadata> {
  const baseUrl = getSiteUrl()
  try {
    const env = await getAppCloudflareEnv()
    const { slug } = await params

    if (!env?.DB) return {}

    const post = await getPostBySlug(env.DB, slug).catch(() => null)
    if (!post || !isPubliclyAccessiblePost(post)) return {}
    const searchIndexable = isSearchIndexablePost(post)
    language = normalizeLanguage(post.language)
    const translations = searchIndexable ? getPublicTranslations(post, await getTranslations(env.DB, post, true)) : []
    const baseMetadata = publicMetadata(language, getPostPath(post.slug, language), post.title)

    const ogImage = resolvePostCoverImage(post, { baseUrl })

    // Password-protected articles should not expose metadata to crawlers.
    if (post.password) {
      return {
        ...baseMetadata,
        alternates: { canonical: `${baseUrl}${getPostPath(post.slug, language)}` },
        robots: { index: false, follow: false },
      }
    }

    return {
      ...baseMetadata,
      description: post.description,
      robots: searchIndexable ? undefined : { index: false, follow: false },
      authors: [{ name: publicText(language, '阿成') }],
      alternates: {
        ...baseMetadata.alternates,
        canonical: `${baseUrl}${getPostPath(post.slug, language)}`,
        languages: searchIndexable ? articleLanguages(post, translations) : undefined,
      },
      openGraph: {
        ...baseMetadata.openGraph,
        title: post.title,
        description: post.description || undefined,
        type: 'article',
        publishedTime: new Date(post.published_at * 1000).toISOString(),
        modifiedTime: new Date(post.updated_at * 1000).toISOString(),
        authors: [publicText(language, '阿成')],
        images: [{ url: ogImage }],
      },
      twitter: {
        card: 'summary_large_image' as const,
        site: '@vista8',
        creator: '@vista8',
        title: post.title,
        description: post.description || undefined,
        images: [ogImage],
      },
    }
  } catch {
    return {}
  }
}

export default async function PublicPostPage({
  params,
  searchParams,
  language = 'zh-CN',
}: {
  language?: Language
  params: Promise<{ slug: string }>
  searchParams: Promise<{ pwd?: string }>
}) {
  const { slug } = await params
  const { pwd: suppliedPassword } = await searchParams
  const pwd = typeof suppliedPassword === 'string' ? suppliedPassword : undefined

  let env: Awaited<ReturnType<typeof getAppCloudflareEnv>> | undefined
  try {
    env = await getAppCloudflareEnv()
  } catch {
    notFound()
  }
  if (!env?.DB) notFound()
  const db = env!.DB

  // Access flags must be current even immediately after protecting or withdrawing a post.
  const post = await getPostBySlug(db, slug).catch(() => null)
  if (!post) notFound()
  if (!isPubliclyAccessiblePost(post)) notFound()

  const postLanguage = normalizeLanguage(post.language)
  if (postLanguage !== language) permanentRedirect(getPostPath(post.slug, postLanguage))
  const headerData = await getSiteHeaderData(db, language)
  const translations = isSearchIndexablePost(post)
    ? getPublicTranslations(post, await getTranslations(db, post, true)) : []
  const switchHref = translations[0] ? getPostPath(translations[0].slug, translations[0].language) : null
  const withLocale = (children: ReactNode) => <PublicLocaleProvider language={language} categories={headerData.categories} switchHref={switchHref}>{children}</PublicLocaleProvider>
  const t = (text: string) => publicText(language, text)
  const categoryName = (name: string | null) => headerData.categories.find(category => category.name === name)?.displayName || t(name || '未分类')
  const categorySlugMap = new Map(headerData.categories.map((category) => [category.name, category.slug]))
  const activeCategorySlug = headerData.categories.find((category) => category.name === post.category)?.slug ?? null

  // 密码保护逻辑保持公开路径纯粹，由前台管理员增强层在客户端接管编辑能力
  let passwordError: string | undefined
  const needsPassword = Boolean(post.password)

  if (needsPassword) {
    if (!pwd) {
      return withLocale(
        <div className="min-h-screen bg-[var(--background)] flex flex-col">
          <SiteHeader
            initialTheme={headerData.defaultTheme}
            navLinks={headerData.navLinks}
            categories={headerData.categories}
            activeCategorySlug={activeCategorySlug}
            stickyOnMobile={false}
          />
          <main className="page-main mx-auto w-full max-w-3xl px-4 sm:px-6 flex-1 py-8 sm:py-12">
            <PasswordPrompt />
          </main>
          <SiteFooter />
        </div>
      )
    }

    const isValid = await verifyPassword(pwd, post.password!)
    if (!isValid) {
      passwordError = t('密码错误，请重试')
      return withLocale(
        <div className="min-h-screen bg-[var(--background)] flex flex-col">
          <SiteHeader
            initialTheme={headerData.defaultTheme}
            navLinks={headerData.navLinks}
            categories={headerData.categories}
            activeCategorySlug={activeCategorySlug}
            stickyOnMobile={false}
          />
          <main className="page-main mx-auto w-full max-w-3xl px-4 sm:px-6 flex-1 py-8 sm:py-12">
            <PasswordPrompt error={passwordError} />
          </main>
          <SiteFooter />
        </div>
      )
    }
  }

  // 异步增加阅读计数，不阻塞渲染
  void incrementViewCount(db, slug).catch(console.error)

  const readingMinutes = estimateReadingMinutes(post.content || '', language)
  const searchIndexable = isSearchIndexablePost(post)
  const related = !post.password
    ? await getRelatedPosts(db, env, post, 3).catch(() => ({ strategy: 'fts' as const, source: 'rules' as const, results: [] }))
    : { strategy: 'fts' as const, source: 'rules' as const, results: [] }
  const contentContainerId = `post-content-${post.slug}`
  const articleTags = activeCategorySlug && post.tags.length ? (await getCategoryTags(db, activeCategorySlug, language)).filter(tag => post.tags.includes(tag.name)) : []

  return withLocale(
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      <SiteHeader
        initialTheme={headerData.defaultTheme}
        navLinks={headerData.navLinks}
        categories={headerData.categories}
        activeCategorySlug={activeCategorySlug}
        stickyOnMobile={false}
      />

      <main className="page-main mx-auto w-full max-w-3xl px-4 sm:px-6 flex-1 py-8 sm:py-12">
        {searchIndexable && (() => {
          const baseUrl = getSiteUrl()
          const ogImage = resolvePostCoverImage(post, { baseUrl })
          const jsonLd = {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            inLanguage: language,
            description: post.description || '',
            image: ogImage,
            author: { '@type': 'Person', name: t('阿成'), url: `${baseUrl}${publicPath('/', language)}` },
            publisher: { '@type': 'Organization', name: t('阿成'), url: baseUrl, logo: { '@type': 'ImageObject', url: `${baseUrl}/icon-512.png` } },
            datePublished: new Date(post.published_at * 1000).toISOString(),
            dateModified: new Date(post.updated_at * 1000).toISOString(),
            mainEntityOfPage: { '@type': 'WebPage', '@id': `${baseUrl}${getPostPath(post.slug, language)}` },
            url: `${baseUrl}${getPostPath(post.slug, language)}`,
          }
          const breadcrumbLd = {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: t('首页'), item: `${baseUrl}${publicPath('/', language)}` },
              ...(post.category && activeCategorySlug
                ? [{ '@type': 'ListItem', position: 2, name: categoryName(post.category), item: `${baseUrl}${publicPath(`/category/${activeCategorySlug}`, language)}` }]
                : []),
              { '@type': 'ListItem', position: post.category && activeCategorySlug ? 3 : 2, name: post.title, item: `${baseUrl}${getPostPath(post.slug, language)}` },
            ],
          }
          return (
            <>
              <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializePublicJsonLd(jsonLd) }} />
              <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializePublicJsonLd(breadcrumbLd) }} />
            </>
          )
        })()}
        <FrontPostAdminBoundary
          slug={post.slug}
          title={post.title}
          html={post.html}
          category={post.category}
          tags={post.tags}
          coverImage={post.cover_image}
          password={post.password ? 'protected' : null}
          publishedAt={post.published_at}
          viewCount={post.view_count}
          content={post.content}
        >
          <article>
            <header className="mb-10 sm:mb-12">
              <h1
                data-admin-edit-trigger
                className="article-display-title text-2xl sm:text-3xl lg:text-4xl font-bold text-[var(--editor-ink)] leading-snug mb-4 sm:mb-5"
              >
                {post.title}
              </h1>
              {switchHref && <div className="mb-4 text-[var(--editor-muted)]"><LanguageSwitcher /></div>}
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--stone-gray)]">
                {post.category && (
                  <>
                    {activeCategorySlug ? (
                      <Link
                        href={publicPath(`/category/${activeCategorySlug}`, language)}
                        className="px-2 py-0.5 rounded-full bg-[var(--editor-accent)]/8 text-[var(--editor-accent)] font-medium border border-[var(--editor-accent)]/15 hover:bg-[var(--editor-accent)]/12 transition-colors"
                      >
                        {categoryName(post.category)}
                      </Link>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-[var(--editor-accent)]/8 text-[var(--editor-accent)] font-medium border border-[var(--editor-accent)]/15">
                        {categoryName(post.category)}
                      </span>
                    )}
                    <span aria-hidden>·</span>
                  </>
                )}
                <time>
                  {formatPublicDate(post.published_at, language)}
                </time>
                <span aria-hidden>·</span>
                <span>{viewsLabel(post.view_count, language)}</span>
                <span aria-hidden>·</span>
                <span>{readingTimeLabel(readingMinutes, language)}</span>
              </div>
              {articleTags.length > 0 && activeCategorySlug && <nav aria-label={t('标签')} className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--editor-muted)]">
                {articleTags.map(tag => <Link key={tag.id} href={publicPath(`/category/${encodeURIComponent(activeCategorySlug)}?tag=${encodeURIComponent(tag.slug)}`, language)} className="hover:text-[var(--editor-accent)] hover:underline">{language === 'en' ? tag.name_en || tag.name : tag.name}</Link>)}
              </nav>}
            </header>

            <div
              id={contentContainerId}
              data-admin-edit-trigger
              className="rich-content"
              dangerouslySetInnerHTML={{ __html: post.html }}
            />
            <TwitterEmbedsEnhancer containerId={contentContainerId} html={post.html} />

            {related.results.length > 0 && (
              <section className="mt-14 sm:mt-16 border-t border-[var(--editor-line)] pt-8 sm:pt-10">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-[var(--editor-ink)]">{t('继续阅读')}</h2>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {related.results.map((item) => {
                    const itemCategorySlug = item.category ? categorySlugMap.get(item.category) : null
                    return (
                      <Link
                        key={item.slug}
                        href={getPostPath(item.slug, language)}
                        className="group rounded-2xl border border-[var(--editor-line)] bg-[var(--editor-panel)]/55 p-4 transition-colors hover:border-[var(--editor-accent)]/35 hover:bg-[var(--editor-panel)]"
                      >
                        <div className="text-xs text-[var(--stone-gray)] mb-3 flex items-center gap-2 flex-wrap">
                          {item.category && (
                            itemCategorySlug ? (
                              <span className="rounded-full border border-[var(--editor-accent)]/15 bg-[var(--editor-accent)]/8 px-2 py-0.5 text-[var(--editor-accent)]">
                                {categoryName(item.category)}
                              </span>
                            ) : (
                              <span>{categoryName(item.category)}</span>
                            )
                          )}
                          <time>
                            {formatPublicDate(item.published_at, language)}
                          </time>
                        </div>
                        <h3 className="text-base font-semibold leading-snug text-[var(--editor-ink)] group-hover:text-[var(--editor-accent)] transition-colors">
                          {item.title}
                        </h3>
                        {item.description && (
                          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-[var(--editor-muted)]">
                            {item.description}
                          </p>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </section>
            )}
          </article>
        </FrontPostAdminBoundary>
      </main>

      <SiteFooter />
    </div>
  )
}
