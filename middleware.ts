import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.hostname !== 'www.blog-acheng.com') {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.hostname = 'blog-acheng.com'
  url.protocol = 'https:'

  return NextResponse.redirect(url, 301)
}
