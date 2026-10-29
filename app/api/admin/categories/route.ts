import { getCategories, createCategory, updateCategory, deleteCategory } from '@/lib/db'
import {
  ensureAuthenticatedRequest,
  getRouteEnvWithDb,
  jsonError,
  jsonOk,
  parseJsonBody,
} from '@/lib/server/route-helpers'
import type { NextRequest } from 'next/server'
import { invalidatePublicContentCache } from '@/lib/cache'
import { TaxonomyError } from '@/lib/repositories/tags'

interface CreateCategoryBody {
  name?: string
  slug?: string
  name_en?: unknown
  sort_order?: unknown
  show_in_nav?: unknown
}

interface UpdateCategoryBody {
  oldSlug?: string
  name?: string
  slug?: string
  name_en?: unknown
  sort_order?: unknown
  show_in_nav?: unknown
}

interface DeleteCategoryBody {
  slug?: string
}

function options(body: { sort_order?: unknown; show_in_nav?: unknown }) {
  if (body.sort_order !== undefined && (!Number.isInteger(body.sort_order) || Number(body.sort_order) < 0 || Number(body.sort_order) > 10000)) throw new TaxonomyError('排序需要为 0～10000 的整数')
  if (body.show_in_nav !== undefined && body.show_in_nav !== 0 && body.show_in_nav !== 1) throw new TaxonomyError('导航显示设置不正确')
  return { sort_order: body.sort_order as number | undefined, show_in_nav: body.show_in_nav as number | undefined }
}

function failure(error: unknown) {
  if (error instanceof TaxonomyError) return jsonError(error.message, error.status)
  if (error instanceof Error && /UNIQUE constraint/.test(error.message)) return jsonError('栏目名称或地址已存在', 409)
  return jsonError('栏目操作失败，请重试', 500)
}

export async function GET(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb('DB not available')
    if (!route.ok) return route.response

    // 分类列表允许 Bearer Token 访问（Obsidian/Chrome 插件需要）
    const authError = await ensureAuthenticatedRequest(req, route.db)
    if (authError) return authError

    const categories = await getCategories(route.db)
    return jsonOk({ categories })
  } catch (err) {
    return jsonError(String(err), 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb('DB not available')
    if (!route.ok) return route.response
    const authError = await ensureAuthenticatedRequest(req, route.db, '未授权')
    if (authError) return authError

    const body = await parseJsonBody<CreateCategoryBody>(req)
    const { name, slug, name_en } = body
    if (!name || !slug) {
      return jsonError('名称和slug不能为空', 400)
    }
    if (name_en !== undefined && (typeof name_en !== 'string' || name_en.length > 120)) return jsonError('英文分类名称格式不正确', 400)

    if (typeof name !== 'string' || name.trim().length > 60 || typeof slug !== 'string' || !/^[a-z0-9\u4e00-\u9fff]+(?:[.-][a-z0-9\u4e00-\u9fff]+)*$/i.test(slug) || slug.length > 80) return jsonError('栏目名称或地址格式不正确', 400)
    await createCategory(route.db, name.trim(), slug, typeof name_en === 'string' ? name_en : undefined, options(body))
    await invalidatePublicContentCache(route.env)
    return jsonOk({ success: true })
  } catch (err) {
    return failure(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb('DB not available')
    if (!route.ok) return route.response
    const authError = await ensureAuthenticatedRequest(req, route.db, '未授权')
    if (authError) return authError

    const body = await parseJsonBody<UpdateCategoryBody>(req)
    const { oldSlug, name, slug, name_en } = body
    if (!oldSlug || !name || !slug) {
      return jsonError('参数不完整', 400)
    }
    if (name_en !== undefined && (typeof name_en !== 'string' || name_en.length > 120)) return jsonError('英文分类名称格式不正确', 400)

    if (typeof oldSlug !== 'string' || typeof name !== 'string' || !name.trim() || name.trim().length > 60 || typeof slug !== 'string' || !/^[a-z0-9\u4e00-\u9fff]+(?:[.-][a-z0-9\u4e00-\u9fff]+)*$/i.test(slug) || slug.length > 80) return jsonError('栏目名称或地址格式不正确', 400)
    await updateCategory(route.db, oldSlug, name.trim(), slug, typeof name_en === 'string' ? name_en : undefined, options(body))
    await invalidatePublicContentCache(route.env)
    return jsonOk({ success: true })
  } catch (err) {
    return failure(err)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb('DB not available')
    if (!route.ok) return route.response
    const authError = await ensureAuthenticatedRequest(req, route.db, '未授权')
    if (authError) return authError

    const { slug } = await parseJsonBody<DeleteCategoryBody>(req)
    if (!slug) {
      return jsonError('slug不能为空', 400)
    }

    await deleteCategory(route.db, slug)
    await invalidatePublicContentCache(route.env)
    return jsonOk({ success: true })
  } catch (err) {
    return failure(err)
  }
}
