import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSiteUrl } from '@/lib/site-config'

afterEach(() => vi.unstubAllEnvs())

describe('personal blog canonical URL', () => {
  it('uses the personal domain for production when no valid public URL is configured', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    expect(getSiteUrl()).toBe('https://blog-acheng.com')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')
    expect(getSiteUrl()).toBe('https://blog-acheng.com')
  })

  it('uses a configured public URL and keeps a local development URL in development', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://blog-acheng.com/')
    expect(getSiteUrl()).toBe('https://blog-acheng.com')
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3011')
    expect(getSiteUrl()).toBe('http://localhost:3011')
  })
})
