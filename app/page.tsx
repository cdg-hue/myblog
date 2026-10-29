import PublicHomePage from '@/components/public/HomePage'
import { publicMetadata } from '@/lib/public-i18n'

export const dynamic = 'force-dynamic'
export const metadata = publicMetadata('zh-CN', '/')

export default function Home(props: { searchParams: Promise<{ page?: string }> }) {
  return <PublicHomePage {...props} language="zh-CN" />
}
