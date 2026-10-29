import { getPublicFeed } from '@/lib/public-feed'

export const dynamic = 'force-dynamic'

export function GET() {
  return getPublicFeed('zh-CN')
}
