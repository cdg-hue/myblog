import { createRequire } from 'node:module'
import { act, createElement as h, Fragment, useEffect, type ComponentType, type ReactNode } from 'react'
import type { Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(), open: vi.fn(), assign: vi.fn(), replace: vi.fn(),
  html: '<p>Original body</p>', onUpdate: null as null | (() => void),
  editable: vi.fn(), fetch: vi.fn(),
  query: 'q=hello&status=draft&category=notes',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}))
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode }) => h('a', props, children) }))
vi.mock('@/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('@/components/InputModal', () => ({ InputModal: () => null }))
vi.mock('@/components/CategorySelector', () => ({ CategorySelector: () => null }))
vi.mock('@/components/ImageGenerationModal', () => ({ ImageGenerationModal: () => null }))
vi.mock('@/components/ImageCropModal', () => ({ ImageCropModal: () => null }))
vi.mock('@/components/WeChatPublishModal', () => ({ WeChatPublishModal: () => null }))
vi.mock('@/components/PasswordModal', () => ({ PasswordModal: () => null }))
vi.mock('@/lib/ai-modal', () => ({ AIModal: () => null }))
vi.mock('@/lib/editor-extensions', () => ({
  createEditorExtensions: () => [], buildEditorProps: () => ({}), FormattingBubble: () => null, SlashMenu: () => null,
}))
vi.mock('@/lib/editor-file-upload', () => ({}))
vi.mock('@/lib/wechat-copy', () => ({}))
vi.mock('@/components/PostTranslationAssistant', () => ({
  PostTranslationAssistant: ({ onApplied }: { onApplied: () => void }) => h('button', { onClick: onApplied }, '应用模拟译文'),
}))
vi.mock('novel', () => ({
  EditorRoot: ({ children }: { children: ReactNode }) => h(Fragment, null, children),
  EditorContent: ({ onCreate, onUpdate }: {
    onCreate: (event: { editor: unknown }) => void
    onUpdate: (event: { editor: unknown }) => void
  }) => {
    useEffect(() => {
      const editor = {
        getHTML: () => mocks.html,
        getText: () => mocks.html.replace(/<[^>]*>/g, ''),
        getJSON: () => ({ type: 'doc' }),
        storage: {}, setEditable: mocks.editable,
        commands: { setContent: (html: string) => { mocks.html = html; onUpdate({ editor }) } },
      }
      onCreate({ editor })
      mocks.onUpdate = () => onUpdate({ editor })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
    return h('div', { 'data-testid': 'editor-body' })
  },
}))

let createRoot: typeof import('react-dom/client').createRoot
let NovelEditor: ComponentType<NonNullable<Parameters<typeof import('@/components/NovelEditor').NovelEditor>[0]>>
let PostTranslationsManager: typeof import('@/components/PostTranslationsManager').PostTranslationsManager
let FilterBar: typeof import('@/app/admin/(protected)/posts/FilterBar').FilterBar
let PostRow: typeof import('@/app/admin/(protected)/posts/PostRow').PostRow
let NavLinksEditor: typeof import('@/app/admin/(protected)/settings/NavLinksEditor').NavLinksEditor
let CategoryManager: typeof import('@/app/admin/(protected)/categories/CategoryManager').CategoryManager
let root: Root | null = null
let container: HTMLDivElement
let browserWindow: Window & typeof globalThis
const storage = new Map<string, string>()

beforeAll(async () => {
  // Domino is already bundled by turndown; no test-only dependency is added.
  const domino = createRequire(import.meta.url)('@mixmark-io/domino') as { createWindow: (html: string) => Window & typeof globalThis }
  browserWindow = domino.createWindow('<!doctype html><html><body></body></html>')
  vi.stubGlobal('window', browserWindow)
  vi.stubGlobal('document', browserWindow.document)
  vi.stubGlobal('HTMLElement', browserWindow.HTMLElement)
  vi.stubGlobal('Node', browserWindow.Node)
  vi.stubGlobal('navigator', browserWindow.navigator)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperty(browserWindow, 'localStorage', { value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
  } })
  Object.defineProperty(browserWindow, 'history', { value: { replaceState: vi.fn() } })
  Object.defineProperty(browserWindow, 'location', { value: { assign: mocks.assign, replace: mocks.replace } })
  browserWindow.open = mocks.open
  browserWindow.requestAnimationFrame = () => 0
  browserWindow.cancelAnimationFrame = () => {}
  Object.defineProperty(browserWindow.HTMLSelectElement.prototype, 'value', {
    get(this: HTMLSelectElement) { return Array.from(this.options).find((option) => option.selected)?.value || '' },
    set(this: HTMLSelectElement, value: string) { for (const option of Array.from(this.options)) option.selected = option.value === value },
  })
  ;({ createRoot } = await import('react-dom/client'))
  ;({ NovelEditor } = await import('@/components/NovelEditor'))
  ;({ PostTranslationsManager } = await import('@/components/PostTranslationsManager'))
  ;({ FilterBar } = await import('@/app/admin/(protected)/posts/FilterBar'))
  ;({ PostRow } = await import('@/app/admin/(protected)/posts/PostRow'))
  ;({ NavLinksEditor } = await import('@/app/admin/(protected)/settings/NavLinksEditor'))
  ;({ CategoryManager } = await import('@/app/admin/(protected)/categories/CategoryManager'))
})

beforeEach(() => {
  vi.useFakeTimers()
  browserWindow.setTimeout = setTimeout
  browserWindow.clearTimeout = clearTimeout
  browserWindow.setInterval = setInterval
  browserWindow.clearInterval = clearInterval
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.fetch.mockReset()
  mocks.fetch.mockImplementation(async () => Response.json({ translations: [], candidates: [] }))
  storage.clear()
  storage.set('qmblog:sidebar-open', 'true')
  mocks.html = '<p>Original body</p>'
  mocks.onUpdate = null
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  container.remove()
  vi.useRealTimers()
})
afterAll(() => vi.unstubAllGlobals())

async function mount(node: ReactNode) { await act(async () => root!.render(node)) }
function button(text: string) {
  const target = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === text)
  if (!target) throw new Error(`Button not found: ${text}`)
  return target
}
async function click(target: Element) {
  await act(async () => {
    const event = document.createEvent('MouseEvents')
    event.initEvent('click', true, true)
    target.dispatchEvent(event)
  })
}
async function input(target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  await act(async () => {
    if (target.tagName === 'SELECT') {
      for (const option of Array.from((target as HTMLSelectElement).options)) option.selected = option.value === value
    } else {
      const prototype = target.tagName === 'TEXTAREA' ? browserWindow.HTMLTextAreaElement.prototype : browserWindow.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(target, value)
    }
    target.dispatchEvent(new browserWindow.Event(target.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}
async function tick() { await act(async () => { await vi.advanceTimersByTimeAsync(1501) }) }
function postCalls(method?: string) {
  return mocks.fetch.mock.calls.filter(([url, init]) => url === '/api/posts' && (!method || init?.method === method))
}
function payload(call: unknown[]) { return JSON.parse((call[1] as RequestInit).body as string) }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
const original = {
  id: 1, slug: 'original', title: 'Original', html: '<p>Original body</p>',
  category: 'notes', description: 'Original body', status: 'draft' as const, language: 'zh-CN' as const,
}
const counterpart = {
  id: 2, slug: 'original-en', title: 'English version', language: 'en' as const,
  status: 'draft' as const, is_hidden: 0, has_password: false, updated_at: 1,
}
const managerProps = {
  slug: 'original', language: 'zh-CN' as const, status: 'draft' as const,
  onBeforeAction: vi.fn(async () => 'original'), onAfterAction: vi.fn(),
  onPairingChange: vi.fn(), onApplied: vi.fn(),
}

describe('bilingual publishing UI', () => {
  it.each([
    { password: 'test-only-password', is_hidden: 0 },
    { password: null, is_hidden: 1 },
    { password: 'test-only-password', is_hidden: 1 },
  ])('keeps inherited draft privacy when saving a paired translation: %j', async (privacy) => {
    mocks.fetch.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'PUT'
      ? Response.json({ success: true, slug: 'original' })
      : Response.json({ translation_group_id: 'group', translations: [counterpart], candidates: [] }))
    await mount(h(NovelEditor, { initialData: { ...original, ...privacy, translation_group_id: 'group' } }))
    await click(container.querySelector('button.rounded-r-lg')!)
    await click(button('保存草稿'))
    const update = mocks.fetch.mock.calls.find(([, init]) => init?.method === 'PUT')!
    expect(payload(update)).toMatchObject({ status: 'draft', ...privacy })
    expect(postCalls()).toHaveLength(0)
  })

  it('autosaves a protected translation without changing visibility or publication status', async () => {
    mocks.fetch.mockImplementation(async (url: string) => url === '/api/posts'
      ? Response.json({ success: true, slug: 'original' })
      : Response.json({ translation_group_id: 'group', translations: [counterpart], candidates: [] }))
    await mount(h(NovelEditor, { initialData: { ...original, password: 'test-only-password', is_hidden: 1, translation_group_id: 'group' } }))
    await input(container.querySelector('textarea')!, 'Updated protected draft')
    await tick()
    const update = payload(postCalls('PATCH')[0])
    expect(update).not.toHaveProperty('status')
    expect(update).not.toHaveProperty('password')
    expect(update).not.toHaveProperty('is_hidden')
  })

  it('uses the selected language for the first saved draft', async () => {
    mocks.fetch.mockImplementation(async (url: string) => url === '/api/posts'
      ? Response.json({ success: true, slug: 'english-draft' })
      : Response.json({ translations: [], candidates: [] }))
    await mount(h(NovelEditor))
    await click(container.querySelector('button.rounded-r-lg')!)
    await input(container.querySelector('#post-language')!, 'en')
    await input(container.querySelector('textarea')!, 'New English draft')
    await tick()
    expect(payload(postCalls('POST')[0])).toMatchObject({ language: 'en', status: 'draft' })
  })

  it('retains English through autosave, explicit publishing and public feedback links', async () => {
    mocks.fetch.mockImplementation(async (url: string) => url === '/api/posts'
      ? Response.json({ success: true, slug: 'original' })
      : url.includes('/translations') ? Response.json({ translations: [], candidates: [] })
      : Response.json({ success: true, slug: 'original' }))
    await mount(h(NovelEditor, { initialData: { ...original, language: 'en' } }))
    await input(container.querySelector('textarea')!, 'English title')
    await tick()
    expect(payload(postCalls('PATCH')[0]).language).toBe('en')
    await click(button('更新'))
    const update = mocks.fetch.mock.calls.find(([url, init]) => url === '/api/admin/posts/original' && init?.method === 'PUT')!
    expect(payload(update).language).toBe('en')
    expect(container.querySelector('a[href="/en/original"]')).not.toBeNull()
  })

  it('serializes a pending initial autosave before publishing without another POST', async () => {
    const pending = deferred<Response>()
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/posts' && init?.method === 'POST') return pending.promise
      if (url.includes('/translations')) return Response.json({ translations: [], candidates: [] })
      return Response.json({ success: true, slug: 'new-post' })
    })
    await mount(h(NovelEditor))
    await input(container.querySelector('textarea')!, 'New article')
    await tick()
    expect(postCalls('POST')).toHaveLength(1)
    await click(button('发布'))
    expect(mocks.fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
    await act(async () => pending.resolve(Response.json({ success: true, slug: 'new-post' })))
    expect(postCalls('POST')).toHaveLength(1)
    const update = mocks.fetch.mock.calls.find(([url, init]) => url === '/api/admin/posts/new-post' && init?.method === 'PUT')!
    expect(payload(update).language).toBe('zh-CN')
    expect(container.querySelector('textarea')!.value).toBe('New article')
  })

  it('saves before creating a counterpart and ignores repeated creation clicks', async () => {
    const pending = deferred<Response>()
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/posts') return pending.promise
      if (init?.method === 'POST') return Response.json({ success: true, slug: 'original-en', language: 'en', created: true })
      return Response.json({ translations: [], candidates: [] })
    })
    await mount(h(NovelEditor, { initialData: original }))
    await input(container.querySelector('textarea')!, 'Updated original')
    await tick()
    const create = button('新建英文译文')
    await click(create)
    await click(create)
    expect(mocks.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
    await act(async () => pending.resolve(Response.json({ success: true, slug: 'original' })))
    const requests = mocks.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(requests).toHaveLength(1)
    expect(payload(requests[0])).toEqual({ language: 'en' })
    expect(mocks.assign).toHaveBeenCalledWith('/editor?edit=original-en')
  })

  it('preserves the selected language in an offline local draft and restores it', async () => {
    mocks.fetch.mockImplementation(async (url: string) => url === '/api/posts'
      ? Response.json({ error: 'Offline' }, { status: 503 })
      : Response.json({ translations: [], candidates: [] }))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await mount(h(NovelEditor, { initialData: original }))
    await click(container.querySelector('button.rounded-r-lg')!)
    await input(container.querySelector('#post-language')!, 'en')
    await input(container.querySelector('textarea')!, 'Unsaved English title')
    await tick()
    expect(JSON.parse(storage.get('qmblog:editor-draft:original')!).language).toBe('en')
    await act(async () => root!.unmount())
    root = createRoot(container)
    await mount(h(NovelEditor, { initialData: original }))
    await click(container.querySelector('button.rounded-r-lg')!)
    expect((container.querySelector('#post-language') as HTMLSelectElement).value).toBe('en')
    expect(container.querySelector('textarea')!.value).toBe('Unsaved English title')
    log.mockRestore()
  })

  it('locks language for a paired post and enables it after unlinking', async () => {
    let linked = true
    mocks.fetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') { linked = false; return Response.json({ success: true }) }
      return Response.json({ translation_group_id: linked ? 'group' : null, translations: linked ? [counterpart] : [], candidates: [] })
    })
    await mount(h(NovelEditor, { initialData: { ...original, translation_group_id: 'group' } }))
    await click(container.querySelector('button.rounded-r-lg')!)
    expect((container.querySelector('#post-language') as HTMLSelectElement).disabled).toBe(true)
    await click(button('解除关联'))
    // The confirmation dialog contains a second button with this label.
    const confirm = Array.from(container.querySelectorAll('button')).filter((item) => item.textContent === '解除关联').at(-1)!
    await click(confirm)
    expect(mocks.fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true)
    expect((container.querySelector('#post-language') as HTMLSelectElement).disabled).toBe(false)
  })

  it('can detach a singleton group even when the current article is deleted', async () => {
    let linked = true
    mocks.fetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') { linked = false; return Response.json({ success: true }) }
      return Response.json({ translation_group_id: linked ? 'singleton' : null, translations: [], candidates: [] })
    })
    await mount(h(PostTranslationsManager, { ...managerProps, status: 'deleted', translationGroupId: 'singleton' }))
    await click(button('解除关联'))
    await click(Array.from(container.querySelectorAll('button')).filter((item) => item.textContent === '解除关联').at(-1)!)
    expect(mocks.fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true)
    expect(container.textContent).not.toContain('新建英文译文')
    expect(container.textContent).not.toContain('解除关联')
  })

  it('links an existing counterpart using its ID', async () => {
    mocks.fetch.mockImplementation(async (_url: string, init?: RequestInit) => Response.json(
      init?.method === 'PUT' ? { success: true } : { translations: [], candidates: [counterpart] },
    ))
    await mount(h(PostTranslationsManager, managerProps))
    await input(container.querySelector('select')!, '2')
    await click(button('关联已有文章'))
    const request = mocks.fetch.mock.calls.find(([, init]) => init?.method === 'PUT')!
    expect(payload(request)).toEqual({ target_id: 2 })
    expect(managerProps.onBeforeAction).toHaveBeenCalled()
    expect(managerProps.onAfterAction).toHaveBeenCalled()
  })

  it('blocks creation when saving the source fails and leaves an error state', async () => {
    const beforeAction = vi.fn(async () => { throw new Error('原稿保存失败') })
    await mount(h(PostTranslationsManager, { ...managerProps, onBeforeAction: beforeAction }))
    await click(button('新建英文译文'))
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('原稿保存失败')
    expect(mocks.fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    expect(button('新建英文译文').disabled).toBe(false)
  })

  it('requires explicit AI action and reloads stored data without a stale autosave', async () => {
    mocks.fetch.mockImplementation(async () => Response.json({ translation_group_id: 'group', translations: [counterpart], candidates: [] }))
    await mount(h(NovelEditor, { initialData: original }))
    expect(container.textContent).not.toContain('应用模拟译文')
    await click(button('AI 翻译'))
    expect(mocks.editable).toHaveBeenLastCalledWith(false)
    expect(container.textContent).toContain('应用模拟译文')
    await click(button('应用模拟译文'))
    await tick()
    expect(mocks.replace).toHaveBeenCalledWith('/editor?edit=original')
    expect(postCalls()).toHaveLength(0)
  })

  it('does not offer AI translation for an already published target', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ translation_group_id: 'group', translations: [counterpart], candidates: [] }))
    await mount(h(PostTranslationsManager, { ...managerProps, status: 'published' }))
    expect(container.textContent).toContain('编辑对应版本')
    expect(container.textContent).not.toContain('AI 翻译')
  })

  it('sends the article language to summary and tag generation', async () => {
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('ai-post-metadata')) {
        return Response.json({ value: JSON.parse(init!.body as string).target === 'tags' ? ['English'] : 'English summary' })
      }
      return Response.json({ translations: [], candidates: [] })
    })
    await mount(h(NovelEditor, { initialData: { ...original, language: 'en' } }))
    await click(container.querySelector('button[title="AI 生成摘要"]')!)
    await click(container.querySelector('button[title="AI 生成标签"]')!)
    const requests = mocks.fetch.mock.calls.filter(([url]) => url.includes('ai-post-metadata'))
    expect(requests.map((request) => payload(request))).toEqual([
      expect.objectContaining({ language: 'en', target: 'summary' }),
      expect.objectContaining({ language: 'en', target: 'tags' }),
    ])
  })

  it('uses authoritative group metadata when another tab unlinks the article', async () => {
    let group: string | null = 'singleton'
    mocks.fetch.mockImplementation(async () => Response.json({ translation_group_id: group, translations: [], candidates: [] }))
    await mount(h(NovelEditor, { initialData: { ...original, translation_group_id: 'singleton' } }))
    await click(container.querySelector('button.rounded-r-lg')!)
    expect((container.querySelector('#post-language') as HTMLSelectElement).disabled).toBe(true)
    group = null
    await click(container.querySelector('button[title="刷新译文"]')!)
    expect((container.querySelector('#post-language') as HTMLSelectElement).disabled).toBe(false)
    expect(container.textContent).not.toContain('解除关联')
  })

  it('preserves query, status and category when changing the list language', async () => {
    await mount(h(FilterBar, {
      categories: ['notes'], currentCategory: 'notes', currentStatus: 'draft', initialQuery: 'hello',
      resultCount: 1, counts: { all: 1, published: 0, draft: 1, deleted: 0, encrypted: 0, unlisted: 0, pinned: 0 },
    }))
    await input(container.querySelector('select')!, 'en')
    const url = new URL(mocks.push.mock.calls.at(-1)![0], 'https://blog.test')
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'hello', status: 'draft', category: 'notes', language: 'en' })
  })

  it('filters the article list by tag while preserving other filters', async () => {
    await mount(h(FilterBar, {
      categories: ['notes'], currentCategory: 'notes', currentStatus: 'draft', initialQuery: 'hello',
      tags: ['手机卡'], resultCount: 1, counts: { all: 1, published: 0, draft: 1, deleted: 0, encrypted: 0, unlisted: 0, pinned: 0 },
    }))
    await input(container.querySelector('select[aria-label="筛选文章标签"]')!, '手机卡')
    const url = new URL(mocks.push.mock.calls.at(-1)![0], 'https://blog.test')
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'hello', status: 'draft', category: 'notes', tag: '手机卡' })
  })

  it('opens English posts with their localized public URL', async () => {
    await mount(h(PostRow, { categories: [], post: {
      ...original, language: 'en', content: 'body', tags: [], password: null, cover_image: null,
      is_pinned: 0, is_hidden: 0, deleted_at: null, published_at: 1, updated_at: 1, view_count: 0,
    } }))
    await click(container.querySelector('button[title="查看文章"]')!)
    expect(mocks.open.mock.calls.at(-1)![0]).toMatch(/\/en\/original$/)
    expect(container.textContent).toContain('English')
  })

  it('retains optional English navigation labels when saving', async () => {
    const onSave = vi.fn()
    await mount(h(NavLinksEditor, { initialValue: JSON.stringify([{ label: '关于', label_en: 'About', url: '/about', openInNewTab: false }]), saving: false, onSave }))
    await input(container.querySelector('input[aria-label="导航 1 英文名称"]')!, 'About Acheng')
    await click(button('保存导航'))
    expect(JSON.parse(onSave.mock.calls[0][0])[0]).toMatchObject({ label: '关于', label_en: 'About Acheng' })
  })

  it('edits and explicitly clears an optional English category name', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ success: true }))
    await mount(h(CategoryManager, { initialCategories: [{ name: '技术', name_en: 'Technology', slug: 'tech', post_count: 1 }] }))
    await click(button('编辑'))
    await input(container.querySelector('input[aria-label="分类英文名称"]')!, '')
    await click(button('保存'))
    expect(payload(mocks.fetch.mock.calls[0])).toMatchObject({ oldSlug: 'tech', name_en: '' })
    expect(container.textContent).not.toContain('Technology')
  })
})
