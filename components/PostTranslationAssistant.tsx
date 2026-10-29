'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Languages, Loader2, RotateCcw, Square } from 'lucide-react'
import type { Language } from '@/lib/i18n'
import type { TranslationCandidate, TranslationSegment } from '@/lib/post-translation'

export interface PostTranslationAssistantProps {
  targetSlug: string
  sourceId: number
  onApplied: () => void
}

interface TranslationSession {
  revisions: { sourceRevision: string; targetRevision: string }
  chunkCount: number
  source: { id: number; title: string; language: Language }
  target: { id: number; title: string; language: Language }
}

type Phase = 'idle' | 'translating' | 'previewing' | 'ready' | 'applying' | 'error' | 'cancelled' | 'applied'

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

function previewDocument(candidate: TranslationCandidate, language: Language): string {
  const imageOrigin = typeof window === 'undefined' ? '' : window.location.origin
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data: ${imageOrigin}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:14px/1.8 system-ui,sans-serif;margin:16px;color:#222;overflow-wrap:anywhere}img,video{max-width:100%;height:auto}pre{overflow:auto;white-space:pre-wrap}table{max-width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:4px}a{pointer-events:none}iframe,object,embed,script,form{display:none}</style>
</head><body>${candidate.html}</body></html>`
}

function TranslationFlow({ targetSlug, sourceId, onApplied }: PostTranslationAssistantProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [candidate, setCandidate] = useState<TranslationCandidate | null>(null)
  const [targetLanguage, setTargetLanguage] = useState<Language>('en')
  const sessionRef = useRef<TranslationSession | null>(null)
  const resultsRef = useRef<TranslationSegment[][]>([])
  const activeRequestRef = useRef<AbortController | null>(null)

  useEffect(() => () => {
    activeRequestRef.current?.abort()
    activeRequestRef.current = null
  }, [])

  async function call<T>(body: Record<string, unknown>, signal: AbortSignal): Promise<T> {
    const response = await fetch(`/api/admin/posts/${encodeURIComponent(targetSlug)}/translate`, {
      method: 'POST', credentials: 'same-origin', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...body, sourceId }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new RequestError(payload?.error || '翻译请求失败，请重试', response.status)
    if (!payload) throw new RequestError('翻译服务返回了无效响应', 502)
    return payload as T
  }

  async function translate(restart: boolean) {
    if (activeRequestRef.current) return
    const controller = new AbortController()
    activeRequestRef.current = controller
    if (restart) {
      sessionRef.current = null
      resultsRef.current = []
      setProgress({ completed: 0, total: 0 })
      setCandidate(null)
    }
    setPhase('translating')
    setError('')
    setConflict(false)
    try {
      if (!sessionRef.current) {
        const session = await call<TranslationSession>({ action: 'prepare' }, controller.signal)
        if (controller.signal.aborted) return
        sessionRef.current = session
        setTargetLanguage(session.target.language)
        setProgress({ completed: 0, total: session.chunkCount })
      }
      const session = sessionRef.current
      for (let index = resultsRef.current.length; index < session.chunkCount; index++) {
        const result = await call<{ segments: TranslationSegment[] }>({
          action: 'chunk', ...session.revisions, chunkIndex: index,
        }, controller.signal)
        if (controller.signal.aborted) return
        resultsRef.current.push(result.segments)
        setProgress({ completed: index + 1, total: session.chunkCount })
      }
      setPhase('previewing')
      const preview = await call<{ candidate: TranslationCandidate }>({
        action: 'preview', ...session.revisions, segments: resultsRef.current.flat(),
      }, controller.signal)
      if (controller.signal.aborted) return
      setCandidate(preview.candidate)
      setPhase('ready')
    } catch (err) {
      if (activeRequestRef.current !== controller) return
      if (controller.signal.aborted) {
        setPhase('cancelled')
      } else {
        setPhase('error')
        setError(err instanceof Error ? err.message : '翻译失败，请重试')
        setConflict(err instanceof RequestError && [404, 409].includes(err.status))
      }
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null
        if (controller.signal.aborted) setPhase('cancelled')
      }
    }
  }

  async function apply() {
    const session = sessionRef.current
    if (!candidate || !session || activeRequestRef.current) return
    const controller = new AbortController()
    activeRequestRef.current = controller
    setPhase('applying')
    setError('')
    let applied = false
    try {
      await call({ action: 'apply', ...session.revisions, segments: resultsRef.current.flat() }, controller.signal)
      if (activeRequestRef.current !== controller) return
      setPhase('applied')
      setCandidate(null)
      sessionRef.current = null
      resultsRef.current = []
      applied = true
    } catch (err) {
      if (activeRequestRef.current !== controller) return
      setPhase('ready')
      setError(err instanceof Error ? err.message : '保存失败，请重试')
      setConflict(err instanceof RequestError && [404, 409].includes(err.status))
    } finally {
      if (activeRequestRef.current === controller) activeRequestRef.current = null
    }
    if (applied) onApplied()
  }

  const busy = ['translating', 'previewing', 'applying'].includes(phase)
  const buttonClass = 'inline-flex min-h-8 items-center justify-center gap-1.5 rounded border border-[var(--editor-line)] px-2.5 py-1.5 text-xs font-medium transition hover:bg-[var(--editor-soft)] disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <section className="min-w-0 space-y-3 text-[var(--editor-ink)]" aria-label="AI 译文草稿" aria-busy={busy}>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium"><Languages className="h-4 w-4" aria-hidden="true" />AI 译文草稿</h3>
        {['idle', 'applied'].includes(phase) && (
          <button type="button" className={buttonClass} onClick={() => void translate(true)}>
            <Languages className="h-3.5 w-3.5" aria-hidden="true" />开始翻译
          </button>
        )}
        {['translating', 'previewing'].includes(phase) && (
          <button type="button" className={buttonClass} onClick={() => activeRequestRef.current?.abort()}>
            <Square className="h-3.5 w-3.5" aria-hidden="true" />取消
          </button>
        )}
      </div>

      <div className="text-xs text-[var(--editor-muted)]" role="status" aria-live="polite">
        {phase === 'translating' && <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />正在翻译 {progress.completed}/{progress.total || '…'}</span>}
        {phase === 'previewing' && '正在生成预览'}
        {phase === 'cancelled' && `已取消，已完成 ${progress.completed}/${progress.total} 段`}
        {phase === 'applying' && '正在保存草稿'}
        {phase === 'applied' && '译文已保存为草稿'}
      </div>
      {progress.total > 0 && !['idle', 'applied'].includes(phase) && (
        <progress className="block h-1.5 w-full accent-[var(--editor-accent)]" max={progress.total} value={progress.completed} aria-label="翻译进度" />
      )}
      {error && <p className="break-words text-xs leading-5 text-rose-600" role="alert">{error}</p>}

      {candidate && (
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-medium text-[var(--editor-muted)]">候选译文 · {targetLanguage === 'en' ? 'English' : '中文'}</p>
          <h4 className="break-words text-sm font-semibold">{candidate.title}</h4>
          {candidate.description && <p className="break-words text-xs leading-5 text-[var(--editor-muted)]">{candidate.description}</p>}
          <iframe
            title="候选译文正文预览"
            sandbox=""
            referrerPolicy="no-referrer"
            className="h-72 w-full min-w-0 rounded border border-[var(--editor-line)] bg-white"
            srcDoc={previewDocument(candidate, targetLanguage)}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} disabled={busy || conflict} onClick={() => void apply()}>
              {phase === 'applying' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}应用到草稿
            </button>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => void translate(true)}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />重新翻译
            </button>
          </div>
        </div>
      )}
      {['error', 'cancelled'].includes(phase) && !candidate && (
        <button type="button" className={buttonClass} onClick={() => void translate(conflict)}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{conflict ? '重新开始' : '重试并继续'}
        </button>
      )}
    </section>
  )
}

export function PostTranslationAssistant(props: PostTranslationAssistantProps) {
  return <TranslationFlow key={`${props.targetSlug}:${props.sourceId}`} {...props} />
}

export default PostTranslationAssistant
