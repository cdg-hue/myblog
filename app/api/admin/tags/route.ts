import type { NextRequest } from 'next/server'
import { ensureAuthenticatedRequest, getRouteEnvWithDb, jsonError, jsonOk, parseJsonBody } from '@/lib/server/route-helpers'
import { createTag, deleteTag, getCategoryTags, TaxonomyError, updateTag } from '@/lib/repositories/tags'
import { invalidatePublicContentCache } from '@/lib/cache'

function failure(error: unknown) {
  if (error instanceof TaxonomyError) return jsonError(error.message, error.status)
  if (error instanceof Error && /UNIQUE constraint/.test(error.message)) return jsonError('该栏目内已有同名标签或相同地址', 409)
  console.error('Tag operation failed:', error)
  return jsonError('标签操作失败，请重试', 500)
}

function tagId(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new TaxonomyError('标签 ID 不正确')
  return Number(value)
}

export async function GET(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb('数据库未配置')
    if (!route.ok) return route.response
    const auth = await ensureAuthenticatedRequest(req, route.db)
    if (auth) return auth
    const category = req.nextUrl.searchParams.get('category')
    if (!category) return jsonError('请先选择栏目', 400)
    return jsonOk({ tags: await getCategoryTags(route.db, category) })
  } catch (error) { return failure(error) }
}

export async function POST(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb('数据库未配置')
    if (!route.ok) return route.response
    const auth = await ensureAuthenticatedRequest(req, route.db)
    if (auth) return auth
    const body = await parseJsonBody<Record<string, unknown>>(req)
    if (typeof body.category !== 'string') return jsonError('请先选择栏目', 400)
    await createTag(route.db, body.category, { name: body.name, name_en: body.name_en, slug: body.slug, sort_order: body.sort_order })
    await invalidatePublicContentCache(route.env)
    return jsonOk({ success: true })
  } catch (error) { return failure(error) }
}

export async function PATCH(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb('数据库未配置')
    if (!route.ok) return route.response
    const auth = await ensureAuthenticatedRequest(req, route.db)
    if (auth) return auth
    const body = await parseJsonBody<Record<string, unknown>>(req)
    await updateTag(route.db, tagId(body.id), { name: body.name, name_en: body.name_en, sort_order: body.sort_order })
    await invalidatePublicContentCache(route.env)
    return jsonOk({ success: true })
  } catch (error) { return failure(error) }
}

export async function DELETE(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb('数据库未配置')
    if (!route.ok) return route.response
    const auth = await ensureAuthenticatedRequest(req, route.db)
    if (auth) return auth
    const body = await parseJsonBody<Record<string, unknown>>(req)
    await deleteTag(route.db, tagId(body.id))
    await invalidatePublicContentCache(route.env)
    return jsonOk({ success: true })
  } catch (error) { return failure(error) }
}
