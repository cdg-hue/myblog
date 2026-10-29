import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDatabase } from '../../helpers/sqlite-d1'
import { createPost, getPostById } from '@/lib/repositories/posts'

const mocks = vi.hoisted(() => ({ getRouteContextWithDb: vi.fn(), ensureAuthenticatedRequest: vi.fn(), invalidatePublicContentCache: vi.fn() }))
vi.mock('@/lib/server/route-helpers', () => ({
  getRouteContextWithDb: mocks.getRouteContextWithDb,
  ensureAuthenticatedRequest: mocks.ensureAuthenticatedRequest,
  jsonOk: (body: unknown, status = 200) => Response.json(body, { status }),
  jsonError: (error: string, status = 500) => Response.json({ error }, { status }),
  parseJsonBody: (req: NextRequest) => req.json(),
}))
vi.mock('@/lib/cache', () => ({
  invalidatePublicContentCache: mocks.invalidatePublicContentCache,
  getCacheKey: (_cache: unknown, key: string) => Promise.resolve(key),
}))
import { GET, POST, PUT, DELETE } from '@/app/api/admin/posts/[slug]/translations/route'

describe('translation management API', () => {
  let testDb: ReturnType<typeof createTestDatabase>
  let sourceId: number
  const params = { params: Promise.resolve({ slug: 'source' }) }
  function request(method: string, body?: unknown) {
    return new NextRequest('https://blog.test/api/admin/posts/source/translations', {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
    })
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    testDb = createTestDatabase()
    sourceId = await createPost(testDb.db, { slug: 'source', title: '中文', content: '正文', html: '<p>正文</p>' })
    mocks.getRouteContextWithDb.mockResolvedValue({ ok: true, db: testDb.db, env: { DB: testDb.db }, ctx: {} })
    mocks.ensureAuthenticatedRequest.mockResolvedValue(null)
  })
  afterEach(() => testDb.close())

  it('requires authentication before reading or changing translations', async () => {
    mocks.ensureAuthenticatedRequest.mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    for (const [method, handler] of [['GET', GET], ['POST', POST], ['PUT', PUT], ['DELETE', DELETE]] as const) {
      const response = await handler(request(method, method === 'POST' ? { language: 'en' } : undefined), params)
      expect(response.status).toBe(401)
    }
    expect((await getPostById(testDb.db, sourceId))?.translation_group_id).toBeNull()
  })

  it('creates a draft once and provides admin status without exposing stored passwords', async () => {
    const first = await POST(request('POST', { language: 'en' }), params)
    const firstBody = await first.json()
    expect(firstBody).toMatchObject({ created: true, language: 'en' })
    expect((await getPostById(testDb.db, firstBody.id))?.status).toBe('draft')
    expect(await (await POST(request('POST', { language: 'en' }), params)).json()).toMatchObject({ id: firstBody.id, created: false })
    const body = await (await GET(request('GET'), params)).json()
    expect(body.translations).toHaveLength(1)
    expect(body.translations[0]).toMatchObject({ status: 'draft', has_password: false })
    expect(body.translations[0]).not.toHaveProperty('password')
    expect(mocks.invalidatePublicContentCache).toHaveBeenCalled()
  })

  it('validates language and target IDs, links a chosen article, and detaches without deleting it', async () => {
    expect((await POST(request('POST', { language: 'fr' }), params)).status).toBe(400)
    expect((await POST(request('POST', { language: 'zh-CN' }), params)).status).toBe(400)
    expect((await PUT(request('PUT', { target_id: '1 OR 1=1' }), params)).status).toBe(400)
    const targetId = await createPost(testDb.db, { slug: 'english', title: 'English', content: 'Body', html: '<p>Body</p>', language: 'en' })
    expect((await PUT(request('PUT', { target_id: targetId }), params)).status).toBe(200)
    expect((await getPostById(testDb.db, targetId))?.translation_group_id).toBe((await getPostById(testDb.db, sourceId))?.translation_group_id)
    expect((await DELETE(request('DELETE'), params)).status).toBe(200)
    expect((await getPostById(testDb.db, sourceId))?.translation_group_id).toBeNull()
    expect(await getPostById(testDb.db, targetId)).not.toBeNull()
  })
})
