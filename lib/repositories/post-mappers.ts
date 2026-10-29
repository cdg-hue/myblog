import type { Post, PostWithTags } from '@/lib/repositories/types'
import { normalizeLanguage } from '@/lib/i18n'

export function parsePostTags(value: string | null): string[] {
  return value ? JSON.parse(value) : []
}

export function normalizePostStatus(post: Pick<Post, 'status' | 'deleted_at'>): Post['status'] {
  return post.deleted_at ? 'deleted' : (post.status || 'published')
}

export function mapPostWithTags(post: Post): PostWithTags {
  return {
    ...post,
    status: normalizePostStatus(post),
    tags: parsePostTags(post.tags),
    language: normalizeLanguage(post.language),
    translation_group_id: post.translation_group_id ?? null,
  }
}
