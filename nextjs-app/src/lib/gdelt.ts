/**
 * GDELT Document 2.0 API 클라이언트
 *
 * - 완전 무료, API 키 불필요
 * - 전 세계 뉴스 실시간 인덱싱 (전문 업계지·학술지 포함)
 * - 최대 250건/요청
 * - https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
 */

import type { NewsItem } from '@/types/news'
import { batchTranslateToKorean } from './translate'
import { COUNTRY_CONFIGS } from './google-search'

const BASE_URL = 'https://api.gdeltproject.org/api/v2/doc/doc'

// ── 언어 매핑 (config.language → GDELT sourcelang) ────────────
const GDELT_LANG_MAP: Record<string, string> = {
  en: 'english',
  ja: 'japanese',
  ko: 'korean',
  zh: 'chinese',
  ar: 'arabic',
  de: 'german',
  fr: 'french',
  he: 'hebrew',
}

// ── 날짜 변환 ─────────────────────────────────────────────────

function toTimespan(dateRange: string): string {
  const map: Record<string, string> = {
    d1: '1d',  d3: '3d',  d7: '7d',  w1: '7d',
    m1: '30d', m3: '90d', m6: '180d', y1: '365d',
  }
  return map[dateRange] ?? '30d'
}

/** Date → "YYYYMMDDHHMMSS" (GDELT 형식) */
function toGdeltDT(dateStr: string, endOfDay = false): string {
  const d = new Date(dateStr)
  const y  = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dy = String(d.getUTCDate()).padStart(2, '0')
  return endOfDay ? `${y}${mo}${dy}235959` : `${y}${mo}${dy}000000`
}

/** "20260317T120000Z" → "2026-03-17T12:00:00Z" */
function parseSeenDate(raw: string): string | null {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`
}

// ── GDELT 응답 타입 ───────────────────────────────────────────

interface GdeltArticle {
  url:          string
  title:        string
  seendate:     string
  socialimage?: string
  domain:       string
  language:     string
  sourcecountry: string
}

interface GdeltResponse {
  articles?: GdeltArticle[]
}

// ── 관련성 점수 ───────────────────────────────────────────────

function calcScore(title: string, query: string, publishedAt: string | null): number {
  const terms = query
    .split(/\s+OR\s+/i)
    .map((t) => t.trim().replace(/^"|"$/g, '').toLowerCase())
    .filter(Boolean)

  if (terms.length === 0) return 0

  const titleLower = title.toLowerCase()
  let matches = 0
  for (const term of terms) {
    if (titleLower.includes(term)) matches++
  }

  let score = matches * 4
  if (publishedAt) {
    const days = (Date.now() - new Date(publishedAt).getTime()) / 86_400_000
    if (days <= 1)       score += 4
    else if (days <= 3)  score += 3
    else if (days <= 7)  score += 2
    else if (days <= 14) score += 1
  }

  const max = terms.length * 4 + 4
  return Math.round(Math.min(10, max > 0 ? (score / max) * 10 : 0) * 10) / 10
}

// ── 메인 검색 함수 ─────────────────────────────────────────────

export async function searchGdelt(params: {
  query:       string
  dateRange?:  string
  country?:    string
  language?:   string
  customFrom?: string
  customTo?:   string
}): Promise<{ items: NewsItem[]; totalResults: number }> {
  const { query, dateRange = 'm1', country = 'us', customFrom, customTo } = params

  const config   = COUNTRY_CONFIGS[country] ?? COUNTRY_CONFIGS.us
  const gdeltLang = GDELT_LANG_MAP[config.language] ?? 'english'

  const url = new URL(BASE_URL)
  const p   = url.searchParams

  // sourcelang 필터를 쿼리에 인라인으로 추가
  p.set('query',      `${query} sourcelang:${gdeltLang}`)
  p.set('mode',       'artlist')
  p.set('maxrecords', '50')
  p.set('format',     'json')
  p.set('sort',       'datedesc')

  if (dateRange === 'custom' && customFrom && customTo) {
    p.set('startdatetime', toGdeltDT(customFrom))
    p.set('enddatetime',   toGdeltDT(customTo, true))
  } else {
    p.set('timespan', toTimespan(dateRange))
  }

  let response: Response
  try {
    response = await fetch(url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000), // 10초 타임아웃
    })
  } catch (err) {
    throw new Error(`GDELT 네트워크 오류: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!response.ok) {
    throw new Error(`GDELT 오류 (${response.status})`)
  }

  const data: GdeltResponse = await response.json().catch(() => ({}))
  const raw = data.articles ?? []

  const partial = raw.map((a): Omit<NewsItem, 'titleKo'> => {
    const publishedAt = parseSeenDate(a.seendate)
    return {
      title:          a.title,
      snippet:        '',   // GDELT artlist는 본문 요약 미제공
      link:           a.url,
      source:         a.domain.replace(/^www\./, ''),
      publishedAt,
      country,
      thumbnailUrl:   a.socialimage ?? null,
      relevanceScore: calcScore(a.title, query, publishedAt),
    }
  })

  const titles           = partial.map((i) => i.title)
  const translatedTitles = await batchTranslateToKorean(titles)

  const items: NewsItem[] = partial.map((item, idx) => ({
    ...item,
    titleKo: translatedTitles[idx] ?? '',
  }))

  return { items, totalResults: items.length }
}
