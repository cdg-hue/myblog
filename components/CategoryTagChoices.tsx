'use client'

import { useEffect, useState } from 'react'

type Tag = { id: number; name: string; name_en: string | null }

export function CategoryTagChoices({ category, value, onChange }: { category: string; value: string[]; onChange: (value: string[]) => void }) {
  const [state, setState] = useState<{ category: string; tags: Tag[]; error: boolean }>({ category: '', tags: [], error: false })
  useEffect(() => {
    if (!category || category === '未分类') return
    const controller = new AbortController()
    fetch(`/api/admin/tags?category=${encodeURIComponent(category)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Failed to load tags')
        return response.json() as Promise<{ tags: Tag[] }>
      })
      .then(data => {
        if (!Array.isArray(data.tags)) throw new Error('Invalid tag response')
        setState({ category, tags: data.tags, error: false })
      })
      .catch(() => { if (!controller.signal.aborted) setState({ category, tags: [], error: true }) })
    return () => controller.abort()
  }, [category])

  if (!category || category === '未分类') return <p className="text-xs text-[var(--editor-muted)]">请先选择栏目</p>
  if (state.category !== category) return <p className="text-xs text-[var(--editor-muted)]">正在加载标签…</p>
  if (state.error) return <p role="alert" className="text-xs text-red-700">标签加载失败，请刷新页面重试。</p>
  if (!state.tags.length) return <p className="text-xs text-[var(--editor-muted)]">当前栏目暂无标签</p>
  return <fieldset className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
    <legend className="mb-2 text-xs text-[var(--editor-muted)]">当前栏目的标签</legend>
    {state.tags.map(tag => <label key={tag.id} className="inline-flex items-center gap-1.5 text-sm text-[var(--editor-ink)]">
      <input type="checkbox" checked={value.includes(tag.name)} disabled={!value.includes(tag.name) && value.length >= 10}
        onChange={event => onChange(event.target.checked ? [...value, tag.name] : value.filter(item => item !== tag.name))} />
      {tag.name}
    </label>)}
  </fieldset>
}
