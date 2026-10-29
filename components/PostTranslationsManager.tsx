'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Edit, Link2, Loader2, Plus, RefreshCw, Unlink, WandSparkles, X } from 'lucide-react'
import { languageLabel, type Language } from '@/lib/i18n'
import { Modal } from '@/components/Modal'
import { PostTranslationAssistant } from '@/components/PostTranslationAssistant'

export interface TranslationSummary {
  id: number
  slug: string
  title: string
  language: Language
  status: 'draft' | 'published' | 'deleted'
  is_hidden: number
  has_password: boolean
  updated_at: number
}

interface Props {
  slug: string | null
  language: Language
  status: 'draft' | 'published' | 'deleted'
  translationGroupId?: string | null
  refreshKey?: string
  disabled?: boolean
  onBeforeAction: () => Promise<string>
  onAfterAction: () => void
  onPairingChange: (paired: boolean, ready: boolean) => void
  onApplied: () => void
}

function statusLabel(post: TranslationSummary) {
  if (post.status === 'deleted') return '已删除'
  if (post.status === 'draft') return '草稿'
  if (post.has_password) return '已发布 · 加密'
  if (post.is_hidden) return '已发布 · 链接访问'
  return '已发布'
}

export function PostTranslationsManager({
  slug, language, status, translationGroupId, refreshKey, disabled = false,
  onBeforeAction, onAfterAction, onPairingChange, onApplied,
}: Props) {
  const [translations, setTranslations] = useState<TranslationSummary[]>([])
  const [candidates, setCandidates] = useState<TranslationSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null)
  const [targetId, setTargetId] = useState('')
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const [assistantSlug, setAssistantSlug] = useState<string | null>(null)
  const operationRef = useRef(false)
  const assistantHostRef = useRef<HTMLDivElement>(null)
  const groupedRef = useRef(Boolean(translationGroupId))
  const [grouped, setGrouped] = useState(Boolean(translationGroupId))
  const loadSeqRef = useRef(0)
  const otherLanguage: Language = language === 'en' ? 'zh-CN' : 'en'
  const otherLanguageName = otherLanguage === 'en' ? '英文' : '中文'

  const load = useCallback(async (savedSlug: string) => {
    const sequence = ++loadSeqRef.current
    setLoading(true)
    setError('')
    onPairingChange(false, false)
    try {
      const response = await fetch(`/api/admin/posts/${encodeURIComponent(savedSlug)}/translations`, {
        cache: 'no-store', credentials: 'same-origin',
      })
      const data = await response.json() as {
        error?: string; translation_group_id?: string | null; translations?: TranslationSummary[]; candidates?: TranslationSummary[]
      }
      if (!response.ok) throw new Error(data.error || '读取译文失败')
      if (!Array.isArray(data.translations) || !Array.isArray(data.candidates)) {
        throw new Error('译文数据不完整，请重试')
      }
      if (sequence !== loadSeqRef.current) return
      const paired = data.translations.filter((post) => post.slug !== savedSlug)
      setTranslations(paired)
      setCandidates(data.candidates.filter((post) => post.slug !== savedSlug && post.status !== 'deleted'))
      setLoadedSlug(savedSlug)
      setTargetId('')
      groupedRef.current = Boolean(data.translation_group_id)
      setGrouped(groupedRef.current)
      onPairingChange(groupedRef.current, true)
    } catch (err) {
      if (sequence !== loadSeqRef.current) return
      setError(err instanceof Error ? err.message : '读取译文失败')
      setLoadedSlug(null)
    } finally {
      if (sequence === loadSeqRef.current) setLoading(false)
    }
  }, [onPairingChange])

  useEffect(() => {
    if (slug) void load(slug)
    else onPairingChange(false, true)
    return () => { loadSeqRef.current += 1 }
  }, [slug, refreshKey, load, onPairingChange])

  const counterpart = loadedSlug === slug
    ? translations.find((post) => post.language !== language && post.status !== 'deleted')
      || translations.find((post) => post.language !== language)
    : undefined
  const ready = !slug || loadedSlug === slug
  const unavailable = disabled || loading || busy || Boolean(assistantSlug)
  const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--editor-line)] px-2.5 py-1.5 text-xs text-[var(--editor-ink)] hover:bg-[var(--editor-soft)] disabled:cursor-not-allowed disabled:opacity-50'

  const runAction = async (action: 'create' | 'link' | 'unlink' | 'edit' | 'assistant') => {
    if (operationRef.current || unavailable || (!ready && action !== 'edit')) return false
    if (status === 'deleted' && action !== 'unlink') return false
    if (action === 'link' && !candidates.some((post) => post.id === Number(targetId) && post.language === otherLanguage)) return false
    operationRef.current = true
    setBusy(true)
    setError('')
    let prepared = false
    let keepPaused = false
    try {
      const savedSlug = await onBeforeAction()
      prepared = true
      if (action === 'edit' && counterpart) {
        keepPaused = true
        window.location.assign(`/editor?edit=${encodeURIComponent(counterpart.slug)}`)
        return true
      }
      if (action === 'assistant' && counterpart) {
        keepPaused = true
        setAssistantSlug(savedSlug)
        return true
      }
      const response = await fetch(`/api/admin/posts/${encodeURIComponent(savedSlug)}/translations`, {
        method: action === 'create' ? 'POST' : action === 'link' ? 'PUT' : 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'create' ? JSON.stringify({ language: otherLanguage })
          : action === 'link' ? JSON.stringify({ target_id: Number(targetId) }) : undefined,
      })
      const data = await response.json() as { success?: boolean; slug?: string; error?: string }
      if (!response.ok || !data.success) throw new Error(data.error || '译文操作失败')
      if (action === 'create') {
        if (!data.slug) throw new Error('译文已保存，请刷新后打开对应版本')
        keepPaused = true
        window.location.assign(`/editor?edit=${encodeURIComponent(data.slug)}`)
      } else {
        groupedRef.current = action !== 'unlink'
        await load(savedSlug)
        setUnlinkOpen(false)
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : '译文操作失败')
      return false
    } finally {
      if (prepared && !keepPaused) onAfterAction()
      if (!keepPaused) {
        operationRef.current = false
        setBusy(false)
      }
    }
  }

  return (
    <section aria-label="译文管理" className="space-y-3 border-b border-[var(--editor-line)] pb-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-[var(--stone-gray)]">译文</h2>
        {slug && (
          <button type="button" title="刷新译文" aria-label="刷新译文" disabled={unavailable} onClick={() => void load(slug)} className="p-1 text-[var(--editor-muted)] disabled:opacity-50">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {error && <p role="alert" className="break-words text-xs text-rose-600">{error}</p>}
      {loading && <p role="status" className="text-xs text-[var(--editor-muted)]">正在读取译文…</p>}
      {status === 'deleted' ? (
        <p className="text-xs text-[var(--editor-muted)]">文章已删除；恢复冲突时可先解除译文关联。</p>
      ) : counterpart ? (
        <>
          <div className="min-w-0">
            <p className="break-words text-sm text-[var(--editor-ink)]">{counterpart.title}</p>
            <p className="mt-1 text-xs text-[var(--editor-muted)]">{languageLabel(counterpart.language)} · {statusLabel(counterpart)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {counterpart.status !== 'deleted' && (
              <a
                href={`/editor?edit=${encodeURIComponent(counterpart.slug)}`}
                aria-disabled={unavailable}
                onClick={(event) => { event.preventDefault(); void runAction('edit') }}
                className={`${buttonClass} ${unavailable ? 'pointer-events-none opacity-50' : ''}`}
              ><Edit className="h-3.5 w-3.5" />编辑对应版本</a>
            )}
          </div>
          {status === 'draft' && counterpart.status !== 'deleted' && (
            assistantSlug ? (
              <div ref={assistantHostRef} className="space-y-3">
                <p role="status" className="text-xs text-[var(--editor-muted)]">编辑已暂停，等待翻译结果。</p>
                <PostTranslationAssistant targetSlug={assistantSlug} sourceId={counterpart.id} onApplied={onApplied} />
                <button type="button" className={buttonClass} onClick={() => {
                  if (assistantHostRef.current?.querySelector('[aria-busy="true"]')) {
                    setError('请先取消翻译或等待保存完成，再返回手动编辑。')
                    return
                  }
                  onApplied()
                }}><X className="h-3.5 w-3.5" />返回手动编辑</button>
              </div>
            ) : (
              <button type="button" disabled={unavailable} onClick={() => void runAction('assistant')} className={buttonClass}>
                <WandSparkles className="h-3.5 w-3.5" />AI 翻译
              </button>
            )
          )}
        </>
      ) : ready && !loading ? (
        <>
          <p className="text-xs text-[var(--editor-muted)]">尚未关联{otherLanguageName}版本</p>
          <button type="button" disabled={unavailable} onClick={() => void runAction('create')} className={buttonClass}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {slug ? '新建' : '保存并新建'}{otherLanguageName}译文
          </button>
          {slug && (
            <div className="space-y-2">
              <select
                aria-label="选择已有译文"
                className="w-full min-w-0 rounded-md border border-[var(--editor-line)] bg-[var(--editor-panel)] px-2 py-1.5 text-xs text-[var(--editor-ink)]"
                value={targetId}
                disabled={unavailable}
                onChange={(event) => setTargetId(event.target.value)}
              >
                <option value="">{candidates.length ? '选择已有文章' : '暂无可关联文章'}</option>
                {candidates.filter((post) => post.language === otherLanguage).map((post) => (
                  <option key={post.id} value={post.id}>{post.title} · {statusLabel(post)}</option>
                ))}
              </select>
              <button type="button" disabled={unavailable || !targetId} onClick={() => void runAction('link')} className={buttonClass}>
                <Link2 className="h-3.5 w-3.5" />关联已有文章
              </button>
            </div>
          )}
        </>
      ) : null}
      {grouped && ready && !loading && (
        <button type="button" disabled={unavailable} onClick={() => setUnlinkOpen(true)} className={buttonClass}>
          <Unlink className="h-3.5 w-3.5" />解除关联
        </button>
      )}
      <Modal isOpen={unlinkOpen} onClose={() => setUnlinkOpen(false)} onConfirm={() => runAction('unlink')} title="解除译文关联" description="解除后，两篇文章仍会保留，读者将无法在它们之间切换语言。" confirmText="解除关联" type="warning" />
    </section>
  )
}
