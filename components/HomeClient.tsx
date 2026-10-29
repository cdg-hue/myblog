'use client'

import { useEffect } from 'react'
import type { Theme } from '@/lib/appearance'
import type { PostWithTags } from '@/lib/db'
import type { SiteCategoryLink, SiteNavLink } from '@/lib/site'
import { HomeVariantB } from '@/components/themes/HomeVariantB'

export type { Theme }

export interface HomeProps {
  initialTheme: Theme
  posts: PostWithTags[]
  categories: SiteCategoryLink[]
  navLinks: SiteNavLink[]
  currentPage: number
  totalPages: number
  categorySlugMap: Record<string, string>
}

function injectFont(id: string, href: string) {
  if (typeof document === 'undefined') return
  if (!document.getElementById(id)) {
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
  }
}

export function HomeClient(props: HomeProps) {
  // Inject fonts on demand
  useEffect(() => {
    injectFont(
      'qm-jetbrains-mono',
      'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap',
    )
    injectFont(
      'qm-noto-serif-sc',
      'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700;900&display=swap',
    )
  }, [])

  return <HomeVariantB {...props} />
}
