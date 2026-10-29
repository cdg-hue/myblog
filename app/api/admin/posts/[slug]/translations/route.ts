import type { NextRequest } from 'next/server'
import { getPostBySlug } from '@/lib/db'
import { isLanguage, normalizeLanguage } from '@/lib/i18n'
import { invalidatePublicContentCache } from '@/lib/cache'
import { createTranslation, getTranslations, linkTranslation, unlinkTranslation, TranslationError, isTranslationConflict } from '@/lib/repositories/translations'
import type { Post } from '@/lib/repositories/types'
import { ensureAuthenticatedRequest, getRouteContextWithDb, jsonError, jsonOk, parseJsonBody } from '@/lib/server/route-helpers'

type Context = { params: Promise<{ slug: string }> }

async function context(req: NextRequest, params: Context['params']) {
  const route = await getRouteContextWithDb('数据库未配置')
  if (!route.ok) return route
  const authError = await ensureAuthenticatedRequest(req, route.db)
  if (authError) return { ok: false as const, response: authError }
  const { slug } = await params
  const post = await getPostBySlug(route.db, slug)
  if (!post) return { ok: false as const, response: jsonError('文章不存在', 404) }
  return { ...route, post }
}

function summary(post: Pick<Post, 'id' | 'slug' | 'title' | 'language' | 'status' | 'is_hidden' | 'password' | 'updated_at'>) {
  return {
    id: post.id, slug: post.slug, title: post.title, language: normalizeLanguage(post.language),
    status: post.status, is_hidden: post.is_hidden, has_password: Boolean(post.password), updated_at: post.updated_at,
  }
}

function failure(error: unknown) {
  if (error instanceof TranslationError) return jsonError(error.message, error.status)
  if (isTranslationConflict(error)) return jsonError('文章已有同语言译文，请先解除关联', 409)
  console.error('Translation management failed:', error instanceof Error ? error.name : 'UnknownError')
  return jsonError('译文操作失败，请刷新后重试', 500)
}

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const route = await context(req, params)
    if (!route.ok) return route.response
    const translations = await getTranslations(route.db, route.post)
    const { results: candidates } = await route.db.prepare(`SELECT id, slug, title, language, status, is_hidden, password, updated_at
      FROM posts WHERE language != ? AND deleted_at IS NULL AND status != 'deleted'
      AND translation_group_id IS NULL ORDER BY updated_at DESC, id DESC LIMIT 200`)
      .bind(normalizeLanguage(route.post.language)).all<Post>()
    return jsonOk({ translation_group_id: route.post.translation_group_id ?? null, translations: translations.map(summary), candidates: candidates.map(summary) })
  } catch (error) { return failure(error) }
}

export async function POST(req: NextRequest, { params }: Context) {
  try {
    const route = await context(req, params)
    if (!route.ok) return route.response
    const body = await parseJsonBody<{ language?: unknown }>(req)
    if (!isLanguage(body.language)) return jsonError('请选择译文语言', 400)
    const { post, created } = await createTranslation(route.db, route.post.id, body.language)
    await invalidatePublicContentCache(route.env)
    return jsonOk({ success: true, id: post.id, slug: post.slug, language: post.language, created })
  } catch (error) { return failure(error) }
}

export async function PUT(req: NextRequest, { params }: Context) {
  try {
    const route = await context(req, params)
    if (!route.ok) return route.response
    const body = await parseJsonBody<{ target_id?: unknown }>(req)
    if (!Number.isSafeInteger(body.target_id) || Number(body.target_id) <= 0) return jsonError('请选择已有译文', 400)
    await linkTranslation(route.db, route.post.id, Number(body.target_id))
    await invalidatePublicContentCache(route.env)
    return jsonOk({ success: true })
  } catch (error) { return failure(error) }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const route = await context(req, params)
    if (!route.ok) return route.response
    await unlinkTranslation(route.db, route.post.id)
    await invalidatePublicContentCache(route.env)
    return jsonOk({ success: true })
  } catch (error) { return failure(error) }
}
