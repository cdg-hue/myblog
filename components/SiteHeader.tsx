'use client'

import Link from 'next/link'
import { useState, useSyncExternalStore } from 'react'
import { Menu, X } from 'lucide-react'
import { SearchEntry } from './SearchEntry'
import { getClientThemePreference, normalizeTheme, SITE_THEME, subscribeToThemeChange, type Theme } from '@/lib/appearance'
import type { SiteCategoryLink, SiteNavLink } from '@/lib/site'
import { LanguageSwitcher, usePublicLocale } from '@/components/PublicLocale'
import { ColumnLinks } from '@/components/ColumnLinks'

export type NavLink = SiteNavLink

interface SiteHeaderProps {
  navLinks?: NavLink[]
  categories?: SiteCategoryLink[]
  activeCategorySlug?: string | null
  stickyOnMobile?: boolean
  initialTheme?: Theme
}

const defaultNavLinks: NavLink[] = [
  { label: 'GitHub', url: 'https://github.com/joeseesun/', openInNewTab: true },
  { label: 'Twitter', url: 'https://x.com/vista8/', openInNewTab: true },
  { label: 'RSS', url: '/feed.xml', openInNewTab: false },
]

function getIssueInfo() {
  const now = new Date()
  return { vol: now.getFullYear() - 2023, month: now.getMonth() + 1, year: now.getFullYear() }
}

export function SiteHeader({
  navLinks,
  categories = [],
  activeCategorySlug = null,
  stickyOnMobile = true,
  initialTheme = SITE_THEME,
}: SiteHeaderProps) {
  const { language, t, path } = usePublicLocale()
  const links = navLinks && navLinks.length > 0 ? navLinks : defaultNavLinks
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const theme = useSyncExternalStore(
    subscribeToThemeChange,
    () => getClientThemePreference(initialTheme),
    () => normalizeTheme(initialTheme),
  )


  const renderLink = (link: NavLink, onClick?: () => void) => {
    const className = "text-[var(--editor-muted)] hover:text-[var(--editor-ink)] transition-colors duration-150"

    if (link.openInNewTab || link.url.startsWith('http')) {
      return (
        <a
          key={link.label}
          href={path(link.url)}
          target={link.openInNewTab ? '_blank' : undefined}
          rel={link.openInNewTab ? 'noopener noreferrer' : undefined}
          className={className}
          onClick={onClick}
        >
          {link.label}
        </a>
      )
    }

    return (
      <Link
        key={link.label}
        href={path(link.url)}
        className={className}
        onClick={onClick}
      >
        {link.label}
      </Link>
    )
  }

  // 终端主题：logo 区域显示终端提示符
  const renderLogo = () => {
    if (theme === 'terminal') {
      return (
        <Link
          href={path('/')}
          className="flex items-center gap-2 flex-shrink-0 text-[var(--editor-muted)] hover:text-[var(--editor-ink)] transition-colors duration-200"
          style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 13 }}
          suppressHydrationWarning
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', display: 'inline-block', boxShadow: '0 0 8px #4ade80', flexShrink: 0 }} />
          <span style={{ color: 'var(--editor-muted)' }}>acheng@blog:~$</span>
          <span style={{ color: 'var(--editor-ink)' }}>./home</span>
        </Link>
      )
    }

    if (theme === 'editorial') {
      const { vol, month, year } = getIssueInfo()
      return (
        <div className="flex items-baseline gap-4 flex-shrink-0" suppressHydrationWarning>
          <Link
            href={path('/')}
            className="text-lg tracking-tight text-[var(--editor-ink)] hover:text-[var(--editor-accent)] transition-colors duration-200 font-bold"
            style={{ fontFamily: 'var(--logo-font, "Noto Serif SC", Georgia, serif)' }}
          >
            {t('阿成')}
          </Link>
          <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.15em', color: 'var(--editor-muted)' }}>
            VOL.{vol} · {language === 'en' ? `${year}/${String(month).padStart(2, '0')}` : `${year}年${month}月`}
          </span>
        </div>
      )
    }

    return (
      <Link
        href={path('/')}
        className="text-lg tracking-tight text-[var(--editor-ink)] hover:text-[var(--editor-accent)] transition-colors duration-200 flex-shrink-0 font-bold"
        style={{ fontFamily: 'var(--logo-font, Georgia, "Noto Serif SC", serif)' }}
      >
        {t('阿成')}
      </Link>
    )
  }

  return (
    <header className={`site-header ${stickyOnMobile ? 'sticky' : 'sm:sticky'} top-0 z-40 border-b border-[var(--editor-line)] bg-[var(--background)]/95 backdrop-blur-sm`}>
      <div className="site-header-inner mx-auto max-w-3xl px-4 sm:px-6">
        <div className="min-h-16 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-3 lg:flex-nowrap lg:py-0">
          {renderLogo()}

          {/* Desktop nav */}
          <nav className="hidden lg:flex flex-wrap items-center justify-end gap-4 text-sm">
            <ColumnLinks categories={categories} activeSlug={activeCategorySlug} />
            {links.map(link => renderLink(link))}
            <LanguageSwitcher />
            <SearchEntry />
          </nav>

          {/* Mobile: search icon + hamburger */}
          <div className="lg:hidden ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <SearchEntry />
            <button
              className="p-2 text-[var(--editor-muted)] hover:text-[var(--editor-ink)] transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={t(mobileMenuOpen ? '关闭菜单' : '打开菜单')}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        <div className="lg:hidden"><ColumnLinks categories={categories} activeSlug={activeCategorySlug} /></div>
      </div>

      {/* Mobile dropdown menu */}
      <div
        className={`
          lg:hidden transition-all duration-300 ease-in-out
          ${mobileMenuOpen ? 'max-h-[70vh] overflow-visible border-t border-[var(--editor-line)]' : 'max-h-0 overflow-hidden'}
        `}
      >
        <div className="bg-[var(--background)]">
          {/* Mobile categories as horizontal pills */}
          {categories.length > 0 && (
            <div className="px-4 py-3 border-b border-[var(--editor-line)]">
              <div className="flex flex-wrap gap-2">
                <Link
                  href={path('/')}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeCategorySlug === null
                      ? 'bg-[var(--editor-accent)] text-white'
                      : 'bg-[var(--editor-panel)] text-[var(--editor-muted)]'
                  }`}
                >
                  {t('全部')}
                </Link>
                {categories.map((category) => (
                  <Link
                    key={category.slug}
                    href={path(`/category/${category.slug}`)}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeCategorySlug === category.slug
                        ? 'bg-[var(--editor-accent)] text-white'
                        : 'bg-[var(--editor-panel)] text-[var(--editor-muted)]'
                    }`}
                  >
                    {category.displayName || category.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <nav className="flex flex-col text-sm">
            {links.map(link => (
              <div key={link.label} className="px-4 py-3 border-b border-[var(--editor-line)]">
                {renderLink(link, () => setMobileMenuOpen(false))}
              </div>
            ))}
          </nav>
        </div>
      </div>
    </header>
  )
}
