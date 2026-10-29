'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LoaderCircle, Search, X } from 'lucide-react'
import { usePublicLocale } from '@/components/PublicLocale'
import { SearchTrigger } from '@/components/SearchTrigger'

interface SearchResult {
  slug: string
  title: string
  description: string | null
  category: string | null
  published_at: number
  password: boolean
}

export function SearchBar() {
  const { language, t, path, postPath, categoryName } = usePublicLocale()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      document.body.style.overflow = 'hidden'
    } else {
      setQuery('')
      setResults([])
      setSelectedIndex(0)
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      setError(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(false)
    setResults([])
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&language=${language}`, { signal: controller.signal })
        if (!res.ok) throw new Error('Search request failed')
        const data = (await res.json()) as { results?: SearchResult[] }
        if (controller.signal.aborted) return
        setResults(data.results || [])
        setSelectedIndex(0)
      } catch {
        if (controller.signal.aborted) return
        setResults([])
        setError(true)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)

    return () => { clearTimeout(timer); controller.abort() }
  }, [query, language])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (results.length > 0 && results[selectedIndex]) {
      router.push(postPath(results[selectedIndex].slug))
      setIsOpen(false)
    } else if (query.trim()) {
      router.push(path(`/search?q=${encodeURIComponent(query.trim())}`))
      setIsOpen(false)
    }
  }

  const handleKeyNav = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    }
  }

  const formatDate = (ts: number) => {
    const date = new Date(ts * 1000)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return t('今天')
    if (diffDays === 1) return t('昨天')
    if (diffDays > 1 && diffDays < 7) return language === 'en' ? `${diffDays} days ago` : `${diffDays}天前`
    return date.toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric' })
  }

  return (
    <>
      <SearchTrigger onClick={() => setIsOpen(true)} />

      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[100]"
          onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false) }}
        >
          {/* 遮罩 */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setIsOpen(false)} />

          {/* 搜索面板 */}
          <div role="dialog" aria-modal="true" aria-label={t('搜索文章')} className="relative mx-auto mt-[12vh] sm:mt-[18vh] w-[92vw] max-w-[640px]">
            <div className="bg-[var(--background)] rounded-lg shadow-[0_25px_60px_-12px_rgba(0,0,0,0.25)] border border-[var(--editor-line)] overflow-hidden">

              {/* 输入区 */}
              <form onSubmit={handleSubmit} onKeyDown={handleKeyNav}>
                <div className="flex items-center gap-3 px-5 py-4">
                  <Search className="w-6 h-6 text-[var(--editor-ink)] flex-shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('搜索文章...')}
                    aria-label={t('搜索')}
                    className="min-w-0 flex-1 py-1 text-lg bg-transparent outline-none placeholder:text-[var(--editor-muted)] text-[var(--editor-ink)]"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {loading && <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-[var(--editor-accent)] shrink-0" />}
                  <button type="button" onClick={() => setIsOpen(false)} aria-label={t('关闭')} title={t('关闭')} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--editor-muted)] hover:bg-[var(--editor-soft)] hover:text-[var(--editor-ink)]"><X className="h-5 w-5" /></button>
                </div>
              </form>

              {/* 分割线 */}
              {(results.length > 0 || (query.trim() && !loading)) && (
                <div className="border-t border-[var(--editor-line)]" />
              )}

              {/* 搜索结果 */}
              {results.length > 0 && (
                <div className="max-h-[50vh] overflow-y-auto py-2">
                  {results.map((result, index) => (
                    <Link
                      key={result.slug}
                      href={postPath(result.slug)}
                      onClick={() => setIsOpen(false)}
                      className={`block mx-2 px-3 py-2.5 rounded-lg transition-colors ${
                        index === selectedIndex
                          ? 'bg-[var(--editor-accent)]/[0.06]'
                          : 'hover:bg-[var(--editor-panel)]'
                      }`}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-base font-semibold text-[var(--editor-ink)] flex-1 line-clamp-1">
                          {result.title}
                        </h3>
                        <span className="text-[11px] text-[var(--stone-gray)] tabular-nums flex-shrink-0">
                          {formatDate(result.published_at)}
                        </span>
                      </div>
                      {result.description && (
                        <p className="text-sm text-[var(--editor-muted)] line-clamp-2 leading-relaxed">
                          {result.description}
                        </p>
                      )}
                      {result.category && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-[var(--editor-accent)]/8 text-[var(--editor-accent)]">
                          {categoryName(result.category)}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}

              {/* 无结果 */}
              {query.trim() && results.length === 0 && !loading && (
                <div className="px-5 py-10 text-center">
                  <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[var(--editor-soft)] flex items-center justify-center">
                    <Search className="w-5 h-5 text-[var(--stone-gray)]" />
                  </div>
                  <p className="text-sm text-[var(--editor-muted)]" role={error ? 'alert' : undefined}>{t(error ? '搜索失败，请重试' : '没有找到相关文章')}</p>
                  {!error && <p className="text-xs text-[var(--stone-gray)] mt-1">{t('试试其他关键词')}</p>}
                </div>
              )}

              {/* 底部快捷键提示 */}
              {results.length > 0 && (
                <div className="flex items-center gap-4 px-5 py-2.5 border-t border-[var(--editor-line)] bg-[var(--editor-panel)]/50">
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--stone-gray)]">
                    <kbd className="px-1 py-0.5 bg-white border border-[var(--editor-line)] rounded text-[10px] font-mono">↑↓</kbd>
                    <span>{t('选择')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--stone-gray)]">
                    <kbd className="px-1 py-0.5 bg-white border border-[var(--editor-line)] rounded text-[10px] font-mono">↵</kbd>
                    <span>{t('打开')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--stone-gray)]">
                    <kbd className="px-1 py-0.5 bg-white border border-[var(--editor-line)] rounded text-[10px] font-mono">esc</kbd>
                    <span>{t('关闭')}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
