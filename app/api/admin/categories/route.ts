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

interface CreateCategoryBody {
  name?: string
  slug?: string
  name_en?: unknown
}

interface UpdateCategoryBody {
  oldSlug?: string
  name?: string
  slug?: string
  name_en?: unknown
}

interface DeleteCategoryBody {
  slug?: string
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

    const { name, slug, name_en } = await parseJsonBody<CreateCategoryBody>(req)
    if (!name || !slug) {
      return jsonError('名称和slug不能为空', 400)
    }
    if (name_en !== undefined && (typeof name_en !== 'string' || name_en.length > 120)) return jsonError('英文分类名称格式不正确', 400)

    if (typeof name_en === 'string') await createCategory(route.db, name, slug, name_en)
    else await createCategory(route.db, name, slug)
    await invalidatePublicContentCache(route.env)
    return jsonOk({ success: true })
  } catch (err) {
    return jsonError(String(err), 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const route = await getRouteEnvWithDb('DB not available')
    if (!route.ok) return route.response
    const authError = await ensureAuthenticatedRequest(req, route.db, '未授权')
    if (authError) return authError

    const { oldSlug, name, slug, name_en } = await parseJsonBody<UpdateCategoryBody>(req)
    if (!oldSlug || !name || !slug) {
      return jsonError('参数不完整', 400)
    }
    if (name_en !== undefined && (typeof name_en !== 'string' || name_en.length > 120)) return jsonError('英文分类名称格式不正确', 400)

    if (typeof name_en === 'string') await updateCategory(route.db, oldSlug, name, slug, name_en)
    else await updateCategory(route.db, oldSlug, name, slug)
    await invalidatePublicContentCache(route.env)
    return jsonOk({ success: true })
  } catch (err) {
    return jsonError(String(err), 500)
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
    return jsonError(String(err), 500)
  }
}
