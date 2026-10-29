export const LANGUAGES = ['zh-CN', 'en'] as const
export type Language = (typeof LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'zh-CN'
export const LANGUAGE_HEADER = 'x-blog-language'

export function isLanguage(value: unknown): value is Language {
  return value === 'zh-CN' || value === 'en'
}

export function normalizeLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE
}

export function getLanguageFromPathname(pathname: string): Language {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'zh-CN'
}

export function localizePath(path: string, language: Language): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path
  const url = new URL(path, 'https://blog.invalid')
  const pathname = url.pathname.replace(/^\/en(?=\/|$)/, '') || '/'
  url.pathname = language === 'en' ? `/en${pathname === '/' ? '' : pathname}` : pathname
  return `${url.pathname}${url.search}${url.hash}`
}

export function getPostPath(slug: string, language: unknown = DEFAULT_LANGUAGE): string {
  return localizePath(`/${encodeURIComponent(slug)}`, normalizeLanguage(language))
}

export function getOtherLanguage(language: Language): Language {
  return language === 'en' ? 'zh-CN' : 'en'
}

export function languageLabel(language: unknown): string {
  return normalizeLanguage(language) === 'en' ? 'English' : '中文'
}
