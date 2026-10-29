'use client'

import Link from 'next/link'
import { usePublicLocale } from '@/components/PublicLocale'
import type { SiteCategoryLink } from '@/lib/site'

export function ColumnLinks({ categories, activeSlug }: { categories?: SiteCategoryLink[]; activeSlug?: string | null }) {
  const locale = usePublicLocale()
  const columns = (categories ?? locale.categories).filter(category => category.show_in_nav === 1)
  if (!columns.length) return null
  return (
    <div role="group" aria-label={locale.t('栏目')} className="column-links flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold">
      {columns.map(category => (
        <Link key={category.slug} href={locale.path(`/category/${encodeURIComponent(category.slug)}`)}
          aria-current={activeSlug === category.slug ? 'page' : undefined}
          className={`whitespace-nowrap border-b-2 py-2 transition-colors hover:text-[var(--editor-accent)] ${activeSlug === category.slug ? 'border-[var(--editor-accent)] text-[var(--editor-accent)]' : 'border-transparent text-[var(--editor-ink)]'}`}>
          {category.displayName || category.name}
        </Link>
      ))}
    </div>
  )
}
