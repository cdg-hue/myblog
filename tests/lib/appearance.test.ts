import { afterEach, describe, expect, it, vi } from 'vitest'
import { getClientThemePreference, normalizeTheme, THEME_OPTIONS } from '@/lib/appearance'

afterEach(() => vi.unstubAllGlobals())

describe('fixed editorial theme', () => {
  it('only offers the editorial theme', () => {
    expect(THEME_OPTIONS.map(option => option.id)).toEqual(['editorial'])
  })

  it.each([undefined, null, '', 'default', 'refined', 'terminal', 'editorial', 'unknown'])(
    'normalizes stored theme %s to editorial', value => {
      expect(normalizeTheme(value)).toBe('editorial')
    },
  )

  it.each(['default', 'refined', 'terminal'] as const)('ignores the old %s browser preference', saved => {
    vi.stubGlobal('window', { localStorage: { getItem: () => saved } })
    vi.stubGlobal('document', { documentElement: { getAttribute: () => saved } })
    expect(getClientThemePreference('default')).toBe('editorial')
  })

  it('does not need browser storage to select the theme', () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('Storage blocked') } })
    expect(getClientThemePreference('default')).toBe('editorial')
  })
})
