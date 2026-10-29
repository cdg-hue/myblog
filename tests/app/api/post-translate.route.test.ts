import { createRequire } from 'node:module'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPostBySlug: vi.fn(), getPostById: vi.fn(),
  getRouteContextWithDb: vi.fn(), ensureAuthenticatedRequest: vi.fn(),
  transform: vi.fn(), ensureAi: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getPostBySlug: mocks.getPostBySlug, getPostById: mocks.getPostById }))
vi.mock('@/lib/server/route-helpers', () => ({
  getRouteContextWithDb: mocks.getRouteContextWithDb,
  ensureAuthenticatedRequest: mocks.ensureAuthenticatedRequest,
  jsonError: (error: string, status = 500) => Response.json({ error }, { status }),
  jsonOk: (payload: unknown) => Response.json(payload),
}))
vi.mock('@/lib/ai', () => ({
  transformEditorSelectionStream: mocks.transform,
  getAiRuntimeEnv: (env: unknown) => env,
}))
vi.mock('@/lib/ai-provider-profiles', () => ({
  ensureAiConfigInfrastructure: mocks.ensureAi,
  resolveAiConfigSecret: () => 'test-secret',
}))

import { POST } from '@/app/api/admin/posts/[slug]/translate/route'

interface TestSqlite {
  exec(sql: string): void
  prepare(sql: string): {
    run(...values: unknown[]): { changes: number }
    get(...values: unknown[]): Record<string, unknown> | undefined
  }
  close(): void
}
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => TestSqlite
}

let sqlite: TestSqlite
let beforeGuardedWrite: (() => void) | undefined
let writeMetaOverride: { changes?: number } | null = null
const db = {
  prepare: (sql: string) => ({
    bind: (...values: unknown[]) => ({
      run: async () => {
        beforeGuardedWrite?.()
        const changes = Number(sqlite.prepare(sql).run(...values).changes)
        return { success: true, meta: writeMetaOverride ?? { changes } }
      },
      first: async () => {
        beforeGuardedWrite?.()
        return sqlite.prepare(sql).get(...values) ?? null
      },
    }),
  }),
}

function post(id: number): (Record<string, unknown> & { tags: string[] }) | null {
  const row = sqlite.prepare('SELECT * FROM posts WHERE id = ?').get(id)
  return row ? { ...row, tags: JSON.parse(String(row.tags || '[]')) } : null
}

async function request(body: unknown, signal?: AbortSignal) {
  return POST(new Request('https://blog.test/api/admin/posts/target/translate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  }) as never, { params: Promise.resolve({ slug: 'target' }) })
}

async function prepared() {
  const response = await request({ action: 'prepare', sourceId: 1 })
  expect(response.status).toBe(200)
  return response.json()
}

async function translated() {
  const session = await prepared()
  const results = []
  for (let chunkIndex = 0; chunkIndex < session.chunkCount; chunkIndex++) {
    const response = await request({ action: 'chunk', sourceId: 1, ...session.revisions, chunkIndex })
    expect(response.status).toBe(200)
    results.push(...(await response.json()).segments)
  }
  return { ...session.revisions, sourceId: 1, segments: results }
}

describe('AI translation draft route', () => {
  afterAll(() => sqlite?.close())
  beforeEach(() => {
    sqlite?.close()
    sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`CREATE TABLE posts (
      id INTEGER PRIMARY KEY, slug TEXT, title TEXT, content TEXT, html TEXT, description TEXT,
      language TEXT, translation_group_id TEXT, status TEXT, deleted_at INTEGER,
      password TEXT, is_hidden INTEGER, is_pinned INTEGER, category TEXT, cover_image TEXT,
      tags TEXT, published_at INTEGER, updated_at INTEGER, view_count INTEGER
    );
    INSERT INTO posts VALUES (1, 'source', '中文标题', '中文正文', '<p>中文正文</p><img src="/image.png">',
      '中文摘要', 'zh-CN', 'pair', 'published', NULL, 'private', 1, 0, 'Tech', '/cover.png', '["tag"]', 100, 100, 0);
    INSERT INTO posts VALUES (2, 'target', 'Old title', 'Old content', '<p>Old content</p>',
      'Old description', 'en', 'pair', 'draft', NULL, 'private', 1, 1, 'Tech', '/cover.png', '["tag"]', 100, 100, 0);`)
    vi.clearAllMocks()
    beforeGuardedWrite = undefined
    writeMetaOverride = null
    mocks.getRouteContextWithDb.mockResolvedValue({ ok: true, db, env: { DB: db } })
    mocks.ensureAuthenticatedRequest.mockResolvedValue(null)
    mocks.getPostBySlug.mockImplementation(async () => post(2))
    mocks.getPostById.mockImplementation(async () => post(1))
    mocks.transform.mockImplementation(async (text: string) => new Response(JSON.stringify(
      JSON.parse(text).map((segment: { id: string; text: string }) => ({ ...segment, text: `Translated ${segment.text}` })),
    )).body)
  })

  it.each(['prepare', 'chunk', 'preview', 'apply'])('requires authentication for %s before looking up private articles', async action => {
    mocks.ensureAuthenticatedRequest.mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    expect((await request({ action, sourceId: 1 })).status).toBe(401)
    expect(mocks.getPostBySlug).not.toHaveBeenCalled()
    expect(mocks.transform).not.toHaveBeenCalled()
  })

  it('previews without writes and saves only after explicit apply, preserving privacy, metadata and draft status', async () => {
    const originalSource = post(1)
    const originalTarget = post(2)
    const candidate = await translated()
    expect(post(2)).toEqual(originalTarget)
    const preview = await request({ ...candidate, action: 'preview' })
    expect((await preview.json()).candidate.html).toContain('<img src="/image.png">')
    expect(post(2)).toEqual(originalTarget)
    const response = await request({ ...candidate, action: 'apply', html: '<script>client HTML</script>' })
    expect(response.status).toBe(200)
    expect(post(1)).toEqual(originalSource)
    expect(post(2)).toEqual(expect.objectContaining({
      status: 'draft', password: 'private', is_hidden: 1, is_pinned: 1,
      language: 'en', translation_group_id: 'pair', tags: ['tag'], cover_image: '/cover.png', category: 'Tech',
      title: 'Translated 中文标题', description: 'Translated 中文摘要',
      html: '<p>Translated 中文正文</p><img src="/image.png">',
      content: 'Translated 中文正文\n\n![](/image.png)',
    }))
    expect((await request({ ...candidate, action: 'apply' })).status).toBe(409)
  })

  it.each([{}, { changes: 0 }, { changes: 9 }])('recognizes a successful SQLite update despite unreliable D1 write metadata: %j', async meta => {
    const candidate = await translated()
    const originalSource = post(1)
    writeMetaOverride = meta
    const response = await request({ ...candidate, action: 'apply' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, slug: 'target' })
    expect(post(2)?.title).toBe('Translated 中文标题')
    expect(post(2)?.status).toBe('draft')
    expect(post(1)).toEqual(originalSource)
  })

  it.each([
    "UPDATE posts SET language = 'zh-CN' WHERE id = 2",
    "UPDATE posts SET translation_group_id = NULL WHERE id = 2",
    "UPDATE posts SET translation_group_id = 'other' WHERE id = 2",
    "UPDATE posts SET status = 'published' WHERE id = 2",
    "UPDATE posts SET deleted_at = 1 WHERE id = 1",
    "UPDATE posts SET status = 'deleted' WHERE id = 1",
    'DELETE FROM posts WHERE id = 1',
  ])('rejects invalid article pairs: %s', async sql => {
    sqlite.exec(sql)
    const response = await request({ action: 'prepare', sourceId: 1 })
    expect([404, 409]).toContain(response.status)
    expect(mocks.transform).not.toHaveBeenCalled()
  })

  it('rejects a changed source on each chunk and at apply', async () => {
    const session = await prepared()
    sqlite.exec("UPDATE posts SET html = '<p>New source</p>' WHERE id = 1")
    const response = await request({ action: 'chunk', sourceId: 1, ...session.revisions, chunkIndex: 0 })
    expect(response.status).toBe(409)
    expect(mocks.transform).not.toHaveBeenCalled()
  })

  it.each([1, 2])('detects an article changed while the AI request is in flight (id %i)', async id => {
    const session = await prepared()
    mocks.transform.mockImplementationOnce(async () => {
      sqlite.exec(`UPDATE posts SET content = 'Edited during AI' WHERE id = ${id}`)
      return new Response('[]').body
    })
    expect((await request({ action: 'chunk', sourceId: 1, ...session.revisions, chunkIndex: 0 })).status).toBe(409)
  })

  it.each([1, 2])('uses atomic SQL guards to reject an edit racing with apply (id %i)', async id => {
    const candidate = await translated()
    beforeGuardedWrite = () => sqlite.exec(`UPDATE posts SET html = '<p>Concurrent edit</p>' WHERE id = ${id}`)
    const response = await request({ ...candidate, action: 'apply' })
    expect(response.status).toBe(409)
    expect(post(2)?.title).toBe('Old title')
    expect(post(id)?.html).toBe('<p>Concurrent edit</p>')
  })

  it.each([1, 2])('rejects a changed article during preview and apply (id %i)', async id => {
    const candidate = await translated()
    sqlite.exec(`UPDATE posts SET description = 'Edited in another tab' WHERE id = ${id}`)
    expect((await request({ ...candidate, action: 'preview' })).status).toBe(409)
    expect((await request({ ...candidate, action: 'apply' })).status).toBe(409)
    expect(post(2)?.title).toBe('Old title')
  })

  it.each([
    "UPDATE posts SET status = 'published' WHERE id = 2",
    "UPDATE posts SET translation_group_id = NULL WHERE id = 1",
    'UPDATE posts SET deleted_at = 1 WHERE id = 1',
    "UPDATE posts SET password = 'changed' WHERE id = 2",
  ])('guards pairing, publication, deletion and privacy changes racing with apply: %s', async sql => {
    const candidate = await translated()
    beforeGuardedWrite = () => sqlite.exec(sql)
    expect((await request({ ...candidate, action: 'apply' })).status).toBe(409)
    expect(post(2)?.title).toBe('Old title')
  })

  it('also translates an English source into a Chinese draft using the configured AI', async () => {
    sqlite.exec("UPDATE posts SET language = CASE WHEN id = 1 THEN 'en' ELSE 'zh-CN' END")
    const response = await request({ action: 'apply', ...await translated() })
    expect(response.status).toBe(200)
    expect(mocks.transform).toHaveBeenCalledWith(expect.any(String), 'custom', expect.objectContaining({
      customPrompt: expect.stringContaining('Simplified Chinese'), db, env: { DB: db },
    }))
    expect(post(2)?.language).toBe('zh-CN')
  })

  it('keeps a document longer than 12k complete through chunking and final apply', async () => {
    const original = '中文正文。'.repeat(4000) + '尾部完成标记'
    sqlite.prepare('UPDATE posts SET html = ?, content = ? WHERE id = 1').run(`<p>${original}</p><img src="/tail.png">`, original)
    const candidate = await translated()
    expect(mocks.transform.mock.calls.length).toBeGreaterThan(8)
    expect((await request({ action: 'apply', ...candidate })).status).toBe(200)
    expect(post(2)?.html).toContain('尾部完成标记</p><img src="/tail.png">')
    expect(post(1)?.html).toBe(`<p>${original}</p><img src="/tail.png">`)
  })

  it.each(['[]', '[{"id":"title:0","text":"Cut off"}', '[{"id":"unexpected","text":"bad"}]'])('fails safely for malformed or incomplete AI output: %s', async output => {
    const session = await prepared()
    mocks.transform.mockResolvedValueOnce(new Response(output).body)
    const response = await request({ action: 'chunk', sourceId: 1, ...session.revisions, chunkIndex: 0 })
    expect(response.status).toBe(502)
    expect(post(2)?.title).toBe('Old title')
  })

  it('opts into provider truncation rejection and leaves both articles unchanged on a truncation error', async () => {
    const session = await prepared()
    const originalSource = post(1)
    const originalTarget = post(2)
    mocks.transform.mockRejectedValueOnce(new Error('AI response was truncated: finish_reason=length'))
    const response = await request({ action: 'chunk', sourceId: 1, ...session.revisions, chunkIndex: 0 })
    expect(mocks.transform).toHaveBeenCalledWith(expect.any(String), 'custom', expect.objectContaining({ rejectTruncated: true }))
    expect(response.status).toBe(502)
    expect(post(1)).toEqual(originalSource)
    expect(post(2)).toEqual(originalTarget)
  })

  it('rejects incomplete apply results and client-supplied HTML without valid translated segments', async () => {
    const session = await prepared()
    const response = await request({ action: 'apply', sourceId: 1, ...session.revisions, segments: [], html: '<p>Injected</p>' })
    expect(response.status).toBe(400)
    expect(post(2)?.title).toBe('Old title')
  })

  it('supports cancellation before starting an AI request', async () => {
    const session = await prepared()
    const controller = new AbortController()
    controller.abort()
    const response = await request({ action: 'chunk', sourceId: 1, ...session.revisions, chunkIndex: 0 }, controller.signal)
    expect(response.status).toBe(499)
    expect(mocks.transform).not.toHaveBeenCalled()
    expect(post(2)?.title).toBe('Old title')
  })

  it('cancels a pending model call and disposes of its late stream without saving', async () => {
    const session = await prepared()
    let finishModel: (stream: ReadableStream<Uint8Array>) => void = () => {}
    let started: () => void = () => {}
    const modelStarted = new Promise<void>(resolve => { started = resolve })
    mocks.transform.mockImplementationOnce(() => {
      started()
      return new Promise<ReadableStream<Uint8Array>>(resolve => { finishModel = resolve })
    })
    const controller = new AbortController()
    const pending = request({ action: 'chunk', sourceId: 1, ...session.revisions, chunkIndex: 0 }, controller.signal)
    await modelStarted
    controller.abort()
    expect((await pending).status).toBe(499)
    const cancel = vi.fn()
    finishModel(new ReadableStream<Uint8Array>({ cancel }))
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce())
    expect(post(2)?.title).toBe('Old title')
  })

  it('times out a hung AI call and allows retrying the same segment with the same revisions', async () => {
    vi.useFakeTimers()
    try {
      const session = await prepared()
      let started: () => void = () => {}
      const modelStarted = new Promise<void>(resolve => { started = resolve })
      mocks.transform.mockImplementationOnce(() => { started(); return new Promise(() => {}) })
      const pending = request({ action: 'chunk', sourceId: 1, ...session.revisions, chunkIndex: 0 })
      await modelStarted
      await vi.advanceTimersByTimeAsync(45_001)
      expect((await pending).status).toBe(504)
      expect(post(2)?.title).toBe('Old title')
      const retry = await request({ action: 'chunk', sourceId: 1, ...session.revisions, chunkIndex: 0 })
      expect(retry.status).toBe(200)
    } finally { vi.useRealTimers() }
  })

  it('does not expose provider credentials when a configured AI request fails', async () => {
    const session = await prepared()
    mocks.transform.mockRejectedValueOnce(new Error('Provider error: sk-do-not-expose'))
    const response = await request({ action: 'chunk', sourceId: 1, ...session.revisions, chunkIndex: 0 })
    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('sk-do-not-expose')
    expect(post(2)?.title).toBe('Old title')
  })

  it('rejects excessive input and output and out-of-range chunks', async () => {
    const session = await prepared()
    expect((await request({ action: 'chunk', sourceId: 1, ...session.revisions, chunkIndex: -1 })).status).toBe(400)
    expect((await request({ action: 'chunk', sourceId: 1, ...session.revisions, chunkIndex: session.chunkCount })).status).toBe(400)
    mocks.transform.mockResolvedValueOnce(new Response('x'.repeat(96_001)).body)
    expect((await request({ action: 'chunk', sourceId: 1, ...session.revisions, chunkIndex: 0 })).status).toBe(502)
    expect((await request({ action: 'apply', sourceId: 1, extra: 'x'.repeat(2_000_001) })).status).toBe(413)
    expect(post(2)?.title).toBe('Old title')
  })

  it('rejects invalid actions, IDs and JSON', async () => {
    for (const body of [null, { action: 'delete', sourceId: 1 }, { action: { toString: 'invalid' }, sourceId: 1 }, { action: 'prepare', sourceId: '1' }]) {
      expect((await request(body)).status).toBe(400)
    }
    const response = await POST(new Request('https://blog.test', { method: 'POST', body: '{' }) as never,
      { params: Promise.resolve({ slug: 'target' }) })
    expect(response.status).toBe(400)
  })
})
