import PublicSearchPage from '@/components/public/SearchPage'
import { publicMetadata, publicText } from '@/lib/public-i18n'

export const dynamic = 'force-dynamic'
export const metadata = {
  ...publicMetadata('en', '/search', publicText('en', '搜索结果')),
  robots: { index: false, follow: true },
}

export default function SearchPage(props: { searchParams: Promise<{ q?: string }> }) {
  return <PublicSearchPage {...props} language="en" />
}
