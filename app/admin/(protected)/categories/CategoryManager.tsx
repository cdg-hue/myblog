'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'
import { Modal } from '@/components/Modal'

interface Category {
  name: string
  name_en?: string | null
  slug: string
  post_count: number
  sort_order?: number
  show_in_nav?: number
}

export function CategoryManager({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories)
  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editNameEn, setEditNameEn] = useState('')
  const [editSlugVal, setEditSlugVal] = useState('')
  const [editOrder, setEditOrder] = useState(100)
  const [editVisible, setEditVisible] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{ slug: string; name: string } | null>(null)
  const router = useRouter()
  const toast = useToast()

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return

    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), name_en: nameEn.trim(), slug: slug.trim(), show_in_nav: 1 }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error || '创建失败')
      }
      setName('')
      setNameEn('')
      setSlug('')
      router.refresh()
      // Optimistic update
      setCategories((prev) => [...prev, { name: name.trim(), name_en: nameEn.trim(), slug: slug.trim(), post_count: 0, show_in_nav: 1, sort_order: 100 }])
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (catSlug: string, catName: string) => {
    setDeleteModal({ slug: catSlug, name: catName })
  }

  const confirmDelete = async () => {
    if (!deleteModal) return false

    try {
      const res = await fetch('/api/admin/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: deleteModal.slug }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error || '删除失败')
      }
      setCategories((prev) => prev.filter((c) => c.slug !== deleteModal.slug))
      toast.success('分类已删除')
      setDeleteModal(null)
      router.refresh()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
      return false
    }
  }

  const startEditing = (cat: Category) => {
    setEditingSlug(cat.slug)
    setEditName(cat.name)
    setEditNameEn(cat.name_en || '')
    setEditSlugVal(cat.slug)
    setEditOrder(cat.sort_order ?? 100)
    setEditVisible(cat.show_in_nav === 1)
  }

  const handleUpdate = async () => {
    if (loading || !editingSlug || !editName.trim() || !editSlugVal.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldSlug: editingSlug, name: editName.trim(), name_en: editNameEn.trim(), slug: editSlugVal.trim(), sort_order: editOrder, show_in_nav: editVisible ? 1 : 0 }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error || '更新失败')
      }
      setCategories((prev) =>
        prev.map((c) => c.slug === editingSlug ? { ...c, name: editName.trim(), name_en: editNameEn.trim(), slug: editSlugVal.trim(), sort_order: editOrder, show_in_nav: editVisible ? 1 : 0 } : c)
      )
      setEditingSlug(null)
      toast.success('分类已更新')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败')
    } finally {
      setLoading(false)
    }
  }

  // Auto-generate slug from name
  const handleNameChange = (val: string) => {
    setName(val)
    const autoSlug = val
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\u4e00-\u9fff-]/g, '')
    if (!slug || slug === name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\u4e00-\u9fff-]/g, '')) {
      setSlug(autoSlug)
    }
  }

  return (
    <div className="space-y-6">
      {/* 添加分类 */}
      <form onSubmit={handleAdd} className="bg-[var(--editor-panel)] rounded-xl border border-[var(--editor-line)] p-5">
        <h2 className="text-sm font-semibold text-[var(--editor-ink)] mb-3">添加分类</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-0 flex-1 basis-40">
            <label className="text-xs text-[var(--editor-muted)] mb-1 block">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="如：AI工具"
              className="w-full rounded-lg border border-[var(--editor-line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--editor-ink)] outline-none focus:border-[var(--editor-ink)] transition"
            />
          </div>
          <div className="min-w-0 flex-1 basis-40">
            <label htmlFor="category-name-en" className="text-xs text-[var(--editor-muted)] mb-1 block">英文名称（可选）</label>
            <input
              id="category-name-en"
              type="text"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="如：AI Tools"
              className="w-full rounded-lg border border-[var(--editor-line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--editor-ink)] outline-none focus:border-[var(--editor-ink)] transition"
            />
          </div>
          <div className="min-w-0 flex-1 basis-40">
            <label className="text-xs text-[var(--editor-muted)] mb-1 block">Slug</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="如：ai-tools"
              className="w-full rounded-lg border border-[var(--editor-line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--editor-ink)] outline-none focus:border-[var(--editor-ink)] transition"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !name.trim() || !slug.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-[var(--editor-ink)] text-white font-medium hover:brightness-110 transition disabled:opacity-50"
          >
            {loading ? '添加中…' : '添加'}
          </button>
        </div>
        {error && <p className="text-xs text-rose-500 mt-2">{error}</p>}
      </form>

      {/* 分类列表 */}
      <div className="bg-[var(--editor-panel)] rounded-xl border border-[var(--editor-line)] overflow-x-auto">
        <div className="min-w-[520px]">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-[var(--editor-line)] bg-[var(--editor-soft)]">
          <span className="text-xs font-semibold text-[var(--editor-muted)] uppercase tracking-wide">名称</span>
          <span className="text-xs font-semibold text-[var(--editor-muted)] uppercase tracking-wide">Slug</span>
          <span className="text-xs font-semibold text-[var(--editor-muted)] uppercase tracking-wide text-right">文章数</span>
          <span className="text-xs font-semibold text-[var(--editor-muted)] uppercase tracking-wide text-right">操作</span>
        </div>
        <div className="divide-y divide-[var(--editor-line)]">
          {categories.map((cat) => (
            <div key={cat.slug} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-5 py-3.5">
              {editingSlug === cat.slug ? (
                <>
                  <div className="min-w-0 space-y-2">
                    <input
                      type="text"
                      aria-label="分类名称"
                      value={editName}
                      disabled={loading}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full text-sm rounded border border-[var(--editor-line)] bg-[var(--background)] px-2 py-1 text-[var(--editor-ink)] outline-none focus:border-[var(--editor-ink)]"
                    />
                    <input
                      type="text"
                      aria-label="分类英文名称"
                      placeholder="英文名称（可选）"
                      value={editNameEn}
                      disabled={loading}
                      onChange={(e) => setEditNameEn(e.target.value)}
                      className="w-full text-sm rounded border border-[var(--editor-line)] bg-[var(--background)] px-2 py-1 text-[var(--editor-ink)] outline-none focus:border-[var(--editor-ink)]"
                    />
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editVisible} onChange={e => setEditVisible(e.target.checked)} />显示在导航</label>
                    <label className="flex items-center gap-2 text-xs">排序<input type="number" min="0" max="10000" value={editOrder} onChange={e => setEditOrder(Number(e.target.value))} className="w-20 border rounded px-2 py-1" /></label>
                  </div>
                  <input
                    type="text"
                    value={editSlugVal}
                    onChange={(e) => setEditSlugVal(e.target.value)}
                    className="text-xs font-mono rounded border border-[var(--editor-line)] bg-[var(--background)] px-2 py-1 text-[var(--editor-ink)] outline-none focus:border-[var(--editor-ink)]"
                  />
                  <span className="text-xs text-[var(--editor-muted)] text-right tabular-nums">{cat.post_count}</span>
                  <div className="flex gap-2">
                    <button type="button" disabled={loading || !editName.trim() || !editSlugVal.trim()} onClick={handleUpdate} className="text-xs text-emerald-600 hover:underline disabled:opacity-50">{loading ? '保存中…' : '保存'}</button>
                    <button type="button" disabled={loading} onClick={() => setEditingSlug(null)} className="text-xs text-[var(--editor-muted)] hover:underline">取消</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="min-w-0 break-words">
                    <span className="text-sm font-medium text-[var(--editor-ink)]">{cat.name}</span>
                    {cat.name_en && <div className="mt-0.5 text-xs text-[var(--editor-muted)]">{cat.name_en}</div>}
                  </div>
                  <span className="text-xs text-[var(--editor-muted)] font-mono">{cat.slug}</span>
                  <span className="text-xs text-[var(--editor-muted)] text-right tabular-nums">{cat.post_count}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => startEditing(cat)} className="text-xs text-[var(--editor-accent)] hover:underline">编辑</button>
                    <button type="button" onClick={() => handleDelete(cat.slug, cat.name)} className="text-xs text-rose-500 hover:underline">删除</button>
                  </div>
                </>
              )}
            </div>
          ))}
          {categories.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-[var(--editor-muted)]">暂无分类</div>
          )}
        </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onConfirm={confirmDelete}
        title="确认删除"
        description={`确定删除分类「${deleteModal?.name}」吗？`}
        confirmText="删除"
        type="danger"
      />
    </div>
  )
}
