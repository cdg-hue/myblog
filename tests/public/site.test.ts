import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getPublicCategories: vi.fn(), getSetting: vi.fn() }))
vi.mock('@/lib/db', () => mocks)
import { getSiteHeaderData } from '@/lib/site'

describe('localized public navigation', () => {
  beforeEach(() => {
    mocks.getPublicCategories.mockResolvedValue([{ name: '技术', slug: 'tech', name_en: 'Technology' }])
    mocks.getSetting.mockImplementation((_db, key) => key === 'nav_links'
      ? JSON.stringify([{ label: '关于', label_en: 'About', url: '/about', openInNewTab: false }, { label: 'RSS', url: '/feed.xml' }]) : 'default')
  })

  it('keeps category source names for lookups and uses English names only for display', async () => {
    const db = {} as D1Database
    const data = await getSiteHeaderData(db, 'en')
    expect(mocks.getPublicCategories).toHaveBeenCalledWith(db, 'en')
    expect(data.categories[0]).toMatchObject({ name: '技术', slug: 'tech', displayName: 'Technology' })
    expect(data.navLinks[0]).toMatchObject({ label: 'About', url: '/en/about' })
    expect(data.navLinks[1].url).toBe('/en/feed.xml')
  })

  it('defaults legacy callers to Chinese', async () => {
    const data = await getSiteHeaderData({} as D1Database)
    expect(data.categories[0].displayName).toBe('技术')
    expect(data.navLinks[0]).toMatchObject({ label: '关于', url: '/about' })
  })
})
