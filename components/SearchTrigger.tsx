'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import { usePublicLocale } from '@/components/PublicLocale'

export function SearchTrigger({ onClick }: { onClick?: () => void }) {
  const { t, path } = usePublicLocale()
  const label = t('搜索文章')
  const className = 'inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[var(--editor-ink)]/30 bg-[var(--editor-panel)] px-3 text-base font-semibold text-[var(--editor-ink)] transition-colors hover:border-[var(--editor-ink)] hover:bg-[var(--editor-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--editor-accent)]'
  const content = <><Search aria-hidden="true" className="h-[22px] w-[22px] shrink-0" /><span>{label}</span></>

  return onClick ? (
    <button type="button" onClick={onClick} className={className} aria-label={label} title={label}>{content}</button>
  ) : (
    <Link href={path('/search')} className={className} aria-label={label} title={label}>{content}</Link>
  )
}
