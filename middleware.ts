import { NextResponse, type NextRequest } from 'next/server'
import { getLanguageFromPathname, LANGUAGE_HEADER } from '@/lib/i18n'

export function middleware(request: NextRequest) {
  if (request.nextUrl.hostname !== 'www.blog-acheng.com') {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set(LANGUAGE_HEADER, getLanguageFromPathname(request.nextUrl.pathname))
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  const url = request.nextUrl.clone()
  url.hostname = 'blog-acheng.com'
  url.protocol = 'https:'
  url.port = ''

  return NextResponse.redirect(url, 301)
}
