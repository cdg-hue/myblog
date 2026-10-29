import PublicCategoryPage, { getCategoryMetadata } from '@/components/public/CategoryPage'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

export function generateMetadata(props: Props) {
  return getCategoryMetadata(props, 'zh-CN')
}

export default function CategoryPage(props: Props) {
  return <PublicCategoryPage {...props} language="zh-CN" />
}
