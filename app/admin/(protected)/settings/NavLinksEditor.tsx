'use client'

import { useState } from 'react'
import { ArrowUp, ArrowDown, Plus, Save, Trash2 } from 'lucide-react'

interface NavLink {
  label: string
  label_en?: string
  url: string
  openInNewTab: boolean
}

interface Props {
  initialValue: string
  onSave: (value: string) => void
  saving: boolean
}

const defaultLinks: NavLink[] = [
  { label: 'GitHub', url: 'https://github.com/joeseesun/', openInNewTab: true },
  { label: 'Twitter', url: 'https://x.com/vista8/', openInNewTab: true },
  { label: 'About', url: '/about', openInNewTab: false },
  { label: 'RSS', url: '/feed.xml', openInNewTab: false },
]

export function NavLinksEditor({ initialValue, onSave, saving }: Props) {
  const parsed = initialValue ? (() => { try { return JSON.parse(initialValue) } catch { return null } })() : null
  const [links, setLinks] = useState<NavLink[]>(parsed && Array.isArray(parsed) ? parsed : defaultLinks)

  const update = (idx: number, field: keyof NavLink, value: string | boolean) => {
    setLinks((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)))
  }

  const remove = (idx: number) => setLinks((prev) => prev.filter((_, i) => i !== idx))

  const add = () => setLinks((prev) => [...prev, { label: '', url: '', openInNewTab: false }])

  const moveUp = (idx: number) => {
    if (idx <= 0) return
    setLinks((prev) => { const n = [...prev]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n })
  }

  const moveDown = (idx: number) => {
    if (idx >= links.length - 1) return
    setLinks((prev) => { const n = [...prev]; [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; return n })
  }

  const inputCls = 'h-9 rounded-lg border border-[var(--editor-line)] bg-[var(--background)] px-3 text-sm text-[var(--editor-ink)] placeholder:text-[var(--editor-muted)] outline-none focus:border-[var(--editor-accent)] transition-colors'
  const btnCls = 'h-9 px-3 rounded-lg text-sm font-medium transition-colors'

  return (
    <div className="space-y-3">
      {links.map((link, idx) => (
        <div key={idx} className="flex items-center gap-2 flex-wrap">
          <input
            className={`${inputCls} w-24`}
            placeholder="名称"
            aria-label={`导航 ${idx + 1} 名称`}
            value={link.label}
            onChange={(e) => update(idx, 'label', e.target.value)}
          />
          <input
            className={`${inputCls} w-36`}
            placeholder="英文名称（可选）"
            aria-label={`导航 ${idx + 1} 英文名称`}
            value={link.label_en || ''}
            onChange={(e) => update(idx, 'label_en', e.target.value)}
          />
          <input
            className={`${inputCls} flex-1 min-w-[180px]`}
            placeholder="URL"
            value={link.url}
            onChange={(e) => update(idx, 'url', e.target.value)}
          />
          <label className="flex items-center gap-1.5 text-xs text-[var(--editor-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={link.openInNewTab}
              onChange={(e) => update(idx, 'openInNewTab', e.target.checked)}
              className="accent-[var(--editor-accent)]"
            />
            新窗口
          </label>
          <button type="button" onClick={() => moveUp(idx)} disabled={idx === 0 || saving} title="上移" aria-label="上移" className={`${btnCls} bg-[var(--editor-soft)] text-[var(--editor-muted)] hover:text-[var(--editor-ink)] disabled:opacity-30`}><ArrowUp className="h-4 w-4" /></button>
          <button type="button" onClick={() => moveDown(idx)} disabled={idx === links.length - 1 || saving} title="下移" aria-label="下移" className={`${btnCls} bg-[var(--editor-soft)] text-[var(--editor-muted)] hover:text-[var(--editor-ink)] disabled:opacity-30`}><ArrowDown className="h-4 w-4" /></button>
          <button type="button" onClick={() => remove(idx)} disabled={saving} title="删除导航" aria-label="删除导航" className={`${btnCls} text-red-500 hover:bg-rose-500/10`}><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={add} disabled={saving} className={`${btnCls} inline-flex items-center gap-1.5 bg-[var(--editor-soft)] text-[var(--editor-ink)] hover:bg-[var(--border-warm)]`}>
          <Plus className="h-4 w-4" /> 添加链接
        </button>
        <button
          onClick={() => onSave(JSON.stringify(links))}
          disabled={saving}
          className={`${btnCls} inline-flex items-center gap-1.5 bg-[var(--editor-accent)] text-[var(--editor-accent-ink)] hover:brightness-105 disabled:opacity-60`}
        >
          <Save className="h-4 w-4" />
          {saving ? '保存中…' : '保存导航'}
        </button>
      </div>
    </div>
  )
}
