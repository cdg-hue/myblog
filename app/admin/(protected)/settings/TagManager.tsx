'use client'

import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

type Column = { name: string; slug: string }
type Tag = { id: number; name: string; name_en: string | null; slug: string; post_count: number }

export function TagManager({ categories }: { categories: Column[] }) {
  const [category, setCategory] = useState(categories[0]?.slug || '')
  const [tags, setTags] = useState<Tag[]>([])
  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!category) return
    const controller = new AbortController()
    fetch(`/api/admin/tags?category=${encodeURIComponent(category)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('加载标签失败')
        const data = await response.json() as { tags?: Tag[] }
        if (!Array.isArray(data.tags)) throw new Error('标签数据格式错误')
        return data.tags
      })
      .then(setTags)
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '加载标签失败') })
    return () => controller.abort()
  }, [category, revision])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!category || !name.trim()) return
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/admin/tags', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing, category, name: name.trim(), name_en: nameEn.trim() }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || '保存失败')
      setName(''); setNameEn(''); setEditing(null); setRevision(n => n + 1)
    } catch (err) { setError(err instanceof Error ? err.message : '保存失败') }
    finally { setLoading(false) }
  }

  async function remove(tag: Tag) {
    if (!window.confirm(`删除“${tag.name}”会同时移除文章上的该标签，文章内容不会删除。确定继续？`)) return
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/admin/tags', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: tag.id }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || '删除失败')
      setRevision(n => n + 1)
    } catch (err) { setError(err instanceof Error ? err.message : '删除失败') }
    finally { setLoading(false) }
  }

  return <section className="space-y-4">
    <label className="block text-sm font-medium">栏目 <select value={category} onChange={e => { setCategory(e.target.value); setTags([]); setEditing(null); setName(''); setNameEn(''); setError('') }} className="ml-3 rounded border border-[var(--editor-line)] bg-[var(--background)] px-3 py-2">{categories.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
    <form onSubmit={save} className="flex flex-wrap items-end gap-3">
      <label className="text-xs">标签名称<input value={name} onChange={e => setName(e.target.value)} maxLength={60} className="mt-1 block rounded border border-[var(--editor-line)] bg-[var(--background)] px-3 py-2 text-sm" /></label>
      <label className="text-xs">英文名称<input value={nameEn} onChange={e => setNameEn(e.target.value)} maxLength={120} className="mt-1 block rounded border border-[var(--editor-line)] bg-[var(--background)] px-3 py-2 text-sm" /></label>
      <button disabled={loading || !category || !name.trim()} className="inline-flex items-center gap-2 rounded bg-[var(--editor-ink)] px-3 py-2 text-sm text-white disabled:opacity-50"><Plus className="h-4 w-4" />{editing ? '保存' : '添加标签'}</button>
      {editing && <button type="button" onClick={() => { setEditing(null); setName(''); setNameEn('') }} className="px-2 py-2 text-sm">取消</button>}
    </form>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="divide-y border-y border-[var(--editor-line)]">{tags.map(tag => <div key={tag.id} className="flex flex-wrap items-center gap-3 py-3 text-sm"><span className="min-w-32 flex-1">{tag.name}{tag.name_en && <span className="ml-2 text-xs text-[var(--editor-muted)]">{tag.name_en}</span>}</span><span className="text-xs text-[var(--editor-muted)]">{tag.post_count} 篇公开文章</span><button type="button" title="编辑标签" aria-label={`编辑 ${tag.name}`} onClick={() => { setEditing(tag.id); setName(tag.name); setNameEn(tag.name_en || '') }}><Pencil className="h-4 w-4" /></button><button type="button" disabled={loading} title="删除标签" aria-label={`删除 ${tag.name}`} onClick={() => void remove(tag)}><Trash2 className="h-4 w-4" /></button></div>)}</div>
    {!tags.length && <p className="text-sm text-[var(--editor-muted)]">暂无标签</p>}
  </section>
}
