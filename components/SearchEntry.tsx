'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { usePublicLocale } from '@/components/PublicLocale'

function SearchFallback() {
  const { t, path } = usePublicLocale()
  return <Link href={path('/search')} className="inline-flex p-2 text-[var(--editor-muted)] hover:text-[var(--editor-ink)] transition-colors" aria-label={t('搜索')} title={t('搜索')}>
    <Search className="w-[18px] h-[18px]" />
  </Link>
}

const SearchBar = dynamic(
  () => import('@/components/SearchBar').then((module) => module.SearchBar),
  {
    ssr: false,
    loading: SearchFallback,
  },
)

export function SearchEntry() {
  return <SearchBar />
}
