'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { getOtherLanguage, getPostPath, languageLabel, type Language } from '@/lib/i18n'
import { publicPath, publicText } from '@/lib/public-i18n'
import type { SiteCategoryLink } from '@/lib/site'

const LocaleContext = createContext<{
  language: Language
  categories: SiteCategoryLink[]
  switchHref?: string | null
}>({ language: 'zh-CN', categories: [] })

export function PublicLocaleProvider({ language, categories = [], switchHref, children }: {
  language: Language
  categories?: SiteCategoryLink[]
  switchHref?: string | null
  children?: ReactNode
}) {
  return <LocaleContext.Provider value={{ language, categories, switchHref }}>{children}</LocaleContext.Provider>
}

export function usePublicLocale() {
  const context = useContext(LocaleContext)
  return {
    ...context,
    t: (text: string) => publicText(context.language, text),
    path: (path: string) => publicPath(path, context.language),
    postPath: (slug: string) => getPostPath(slug, context.language),
    categoryName: (name: string | null) => {
      const category = context.categories.find(item => item.name === name)
      return category?.displayName || publicText(context.language, name || '未分类')
    },
  }
}

export function LanguageSwitcher() {
  const { language, switchHref, t } = usePublicLocale()
  const other = getOtherLanguage(language)
  const href = switchHref === undefined ? publicPath('/', other) : switchHref
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap" aria-label={t('文章语言')}>
      <span lang={language} aria-current="true">{languageLabel(language)}</span>
      {href && <>
        <span aria-hidden="true" className="opacity-40">/</span>
        <a href={href} hrefLang={other} lang={other} className="hover:underline underline-offset-4">{languageLabel(other)}</a>
      </>}
    </span>
  )
}
