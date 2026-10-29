import PublicPostPage, { getPostMetadata } from '@/components/public/PostPage'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ pwd?: string }>
}

export function generateMetadata(props: Props) {
  return getPostMetadata(props, 'en')
}

export default function PostPage(props: Props) {
  return <PublicPostPage {...props} language="en" />
}
