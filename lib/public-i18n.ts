import type { Metadata } from 'next'
import { getPostPath, localizePath, normalizeLanguage, type Language } from '@/lib/i18n'
import { getSiteUrl } from '@/lib/site-config'
import type { PostWithTags } from '@/lib/db'
import { resolveDefaultSiteCoverImage } from '@/lib/default-cover-images'

const english: Record<string, string> = {
  '阿成': 'Acheng',
  '记录思考，分享所学，留住当下。技术、生活、读书笔记的数字花园。': 'Thoughts, discoveries, and moments worth keeping. A digital garden of technology, life, and reading.',
  '记录思考，分享所学，留住当下。': 'Thoughts, discoveries, and moments worth keeping.',
  '首页': 'Home', '分类': 'Categories', '全部文章': 'All articles', '全部': 'All',
  '栏目': 'Columns', '标签': 'Tags', '这个栏目下还没有公开文章': 'No public articles in this column yet.', '该标签下还没有公开文章': 'No public articles with this tag yet.',
  '未分类': 'Uncategorized', '还没有文章': 'No articles yet',
  '开始写作，记录思考': 'New stories are on their way.',
  '这个分类下还没有公开文章': 'No public articles in this category yet.',
  '返回首页': 'Back to home', '阅读全文': 'Read article', '置顶': 'Pinned',
  '搜索': 'Search', '搜索文章': 'Search articles', '搜索结果': 'Search results', '搜索文章...': 'Search articles...',
  '请输入搜索关键词': 'Enter a search term', '未找到相关文章': 'No articles found',
  '没有找到相关文章': 'No articles found', '试试其他关键词': 'Try another search term',
  '搜索失败，请重试': 'Search failed. Please try again.',
  '今天': 'Today', '昨天': 'Yesterday', '选择': 'Select', '打开': 'Open', '关闭': 'Close',
  '分页导航': 'Pagination', '上一页': 'Previous', '下一页': 'Next',
  '关闭菜单': 'Close menu', '打开菜单': 'Open menu',
  '主题': 'Theme', '默认': 'Default', '精致极简': 'Refined', '杂志编辑': 'Editorial', 'AI 终端': 'Terminal',
  '此文章已加密': 'Password-protected article', '请输入密码查看内容': 'Enter the password to read this article',
  '请输入密码': 'Enter password', '解锁文章': 'Unlock article', '密码错误，请重试': 'Incorrect password. Please try again.',
  '继续阅读': 'Keep reading',
  '下载 Markdown': 'Download Markdown', '复制公众号格式': 'Copy for WeChat', '下载 PDF': 'Download PDF',
  '已复制公众号格式': 'Copied for WeChat', '复制公众号格式失败': 'Could not copy the article', '导出 PDF 失败': 'Could not export PDF',
  '★ HEADLINE · 头条': 'HEADLINE', 'THE INDEX · 文章一览': 'THE INDEX',
  '独立 · 不商业化 · RSS 友好': 'Independent · Non-commercial · RSS friendly',
  '独立 · AI · 产品 · 思考': 'Independent · AI · Product · Ideas',
  '感谢阅读，保持思考。': 'Thanks for reading. Stay curious.',
  '文章语言': 'Article language', '暂无公开译文': 'No published translation yet',
}

export function publicText(language: Language, text: string): string {
  return language === 'en' && Object.hasOwn(english, text) ? english[text] : text
}

// Admin, APIs, and assets remain outside the public language prefixes.
export function publicPath(path: string, language: Language): string {
  if (/^\/(?:admin|api|editor|_next)(?:[/?#]|$)/.test(path)) return path
  if (/^\/(?:en\/)?category(?:[/?#]|$)/.test(path)) return localizePath(path, language)
  if (/^\/[^?#]*\.[^/?#]+(?:[?#]|$)/.test(path) && !/^\/(?:en\/)?feed\.xml(?:[?#]|$)/.test(path)) return path
  return localizePath(path, language)
}

export function serializePublicJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function formatPublicDate(timestamp: number, language: Language, options: Intl.DateTimeFormatOptions = {}) {
  return new Date(timestamp * 1000).toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai', ...options,
  })
}

export function articleCount(count: number, language: Language) {
  return language === 'en' ? `${count} ${count === 1 ? 'article' : 'articles'}` : `共 ${count} 篇文章`
}

export function readingMinutes(content: string, language: Language) {
  return Math.max(1, Math.ceil(language === 'en' ? (content.trim().match(/\S+/g)?.length ?? 0) / 200 : content.length / 400))
}

export function readingTimeLabel(minutes: number, language: Language) {
  return language === 'en' ? `${minutes} min read` : `约 ${minutes} 分钟`
}

export function viewsLabel(count: number, language: Language) {
  return language === 'en' ? `${count} ${count === 1 ? 'view' : 'views'}` : `${count} 次阅读`
}

export function getPublicTranslations(post: PostWithTags, candidates: PostWithTags[]) {
  if (!isIndexable(post) || !post.translation_group_id) return []
  return candidates.filter(candidate =>
    isIndexable(candidate) && candidate.translation_group_id === post.translation_group_id &&
    candidate.slug !== post.slug && normalizeLanguage(candidate.language) !== normalizeLanguage(post.language),
  )
}

function isIndexable(post: PostWithTags) {
  return post.status === 'published' && post.deleted_at == null && post.password == null && post.is_hidden === 0
}

export function articleLanguages(post: PostWithTags, translations: PostWithTags[]) {
  if (!isIndexable(post)) return {}
  return Object.fromEntries([post, ...getPublicTranslations(post, translations)].map(item => [
    normalizeLanguage(item.language), `${getSiteUrl()}${getPostPath(item.slug, item.language)}`,
  ]))
}

export function publicMetadata(language: Language, path: string, title?: string): Metadata {
  const name = publicText(language, '阿成')
  const description = publicText(language, '记录思考，分享所学，留住当下。技术、生活、读书笔记的数字花园。')
  const url = `${getSiteUrl()}${publicPath(path, language)}`
  const image = resolveDefaultSiteCoverImage(getSiteUrl())
  return {
    title: { absolute: title ? `${title} · ${name}` : name },
    description,
    alternates: {
      canonical: url,
      languages: { 'zh-CN': `${getSiteUrl()}${publicPath(path, 'zh-CN')}`, en: `${getSiteUrl()}${publicPath(path, 'en')}` },
      types: { 'application/rss+xml': publicPath('/feed.xml', language) },
    },
    openGraph: {
      title: title ?? name, description, siteName: name, url, locale: language === 'en' ? 'en_US' : 'zh_CN',
      images: [{ url: image, width: 1280, height: 720, alt: name }],
    },
    twitter: { card: 'summary_large_image', title: title ?? name, description, images: [image] },
  }
}
