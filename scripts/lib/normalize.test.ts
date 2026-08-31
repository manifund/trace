import { describe, expect, test } from 'bun:test'
import { normalizeName, normalizeUrl, slugify } from './normalize'

describe('normalizeName', () => {
  test('case, punctuation, whitespace', () => {
    expect(normalizeName('  Machine  Intelligence Research Institute ')).toBe(
      'machine intelligence research institute'
    )
    expect(normalizeName('Epistea, z.s.')).toBe('epistea z s')
    expect(normalizeName('Ashgro, Inc.')).toBe('ashgro')
  })
  test('diacritics', () => {
    expect(normalizeName('Café Müller')).toBe('cafe muller')
  })
  test('corporate suffixes', () => {
    expect(normalizeName('OpenAI, LLC')).toBe('openai')
    expect(normalizeName('Redwood Research Ltd')).toBe('redwood research')
  })
})

describe('slugify', () => {
  test('kebab-case', () => {
    expect(slugify('Survival and Flourishing Fund')).toBe('survival-and-flourishing-fund')
  })
  test('non-latin names get a stable hash slug', () => {
    expect(slugify('!!!')).toMatch(/^org-[0-9a-f]+$/)
    expect(slugify('הארגון למען קיימות')).toMatch(/^org-[0-9a-f]+$/)
    expect(slugify('הארגון למען קיימות')).toBe(slugify('הארגון למען קיימות'))
  })
})

describe('normalizeUrl', () => {
  test('gives a bare domain a scheme', () => {
    expect(normalizeUrl('thecommonsproblem.com')).toBe('https://thecommonsproblem.com')
    expect(normalizeUrl('  www.example.org/a/b?c=1 ')).toBe('https://www.example.org/a/b?c=1')
  })

  test('leaves an http(s) URL alone', () => {
    expect(normalizeUrl('https://example.com/x')).toBe('https://example.com/x')
    expect(normalizeUrl('HTTP://example.com')).toBe('HTTP://example.com')
  })

  test('drops schemes that are not http(s)', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('data:text/html,<script>')).toBeNull()
    expect(normalizeUrl('mailto:a@b.com')).toBeNull()
  })

  test('drops site-relative paths and keeps protocol-relative ones', () => {
    expect(normalizeUrl('/orgs/anthropic')).toBeNull()
    expect(normalizeUrl('//example.com/x')).toBe('https://example.com/x')
  })

  test('treats blank as absent', () => {
    expect(normalizeUrl('')).toBeNull()
    expect(normalizeUrl('   ')).toBeNull()
    expect(normalizeUrl(null)).toBeNull()
    expect(normalizeUrl(undefined)).toBeNull()
  })
})
