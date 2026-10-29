'use client'

import dynamic from 'next/dynamic'
import { SearchTrigger } from '@/components/SearchTrigger'

function SearchFallback() {
  return <SearchTrigger />
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
