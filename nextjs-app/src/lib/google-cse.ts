/**
 * Google Custom Search Engine (CSE) 클라이언트
 *
 * - 무료: 100 req/일
 * - 결과: 최대 10건/요청
 * - 커버리지: Google 전체 인덱스 (전문 업계지·학술지 포함)
 * - env: GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX
 *   → 미설정 시 조용히 빈 결과 반환 (NewsAPI 단독 동작 유지)
 */

import type { NewsItem } from '@/types/news'
import { batchTranslateToKorean } from './translate'
import { COUNTRY_CONFIGS } from './google-search'

const BASE_URL = 'https://www.googleapis.com/customsearch/v1'

// ── 에러 클래스 ───────────────────────────────────────────────

export class CSEError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly reason?: string
  ) {
    super(message)
    this.name = 'CSEError'
  }
}

// ── 날짜 변환 ─────────────────────────────────────────────────

function toDateRestrict(dateRange: string): string {
  const map: Record<string, string> = {
    d1: 'd1', d3: 'd3', d7: 'd7', w1: 'w1',
    m1: 'm1', m3: 'm3', m6: 'm6', y1: 'y1',
  }
  return map[dateRange] ?? 'm1'
}

function toYYYYMMDD(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

// ── CSE 응답 타입 ─────────────────────────────────────────────

interface CSEItem {
  title: string
  link: string
  snippet: string
  displayLink: string
  pagemap?: {
    metatags?: Array<{
      'article:published_time'?: string
      'article:modified_time'?: string
      'og:image'?: string
      'og:site_name'?: string
    }>
    newsarticle?: Array<{ datepublished?: string }>
    article?: Array<{ datepublished?: string }>
  }
}

interface CSEResponse {
  items?: CSEItem[]
  searchInformation?: { totalResults: string }
  error?: { code: number; message: string }
}

// ── 관련성 점수 ───────────────────────────────────────────────

function calcRelevanceScore(
  title: string,
  snippet: string,
  query: string,
  publishedAt: string | null
): number {
  const terms = query
    .split(/\s+OR\s+/i)
    .map((t) => t.trim().replace(/^"|"$/g, '').toLowerCase())
    .filter((t) => t.length > 0)

  if (terms.length === 0) return 0

  const titleLower = title.toLowerCase()
  const snippetLower = snippet.toLowerCase()

  let titleMatches = 0
  let snippetMatches = 0
  for (const term of terms) {
    if (titleLower.includes(term)) titleMatches++
    else if (snippetLower.includes(term)) snippetMatches++
  }

  let score = titleMatches * 4 + snippetMatches
  if (titleMatches === 0) score = Math.max(0, score * 0.3)

  if (publishedAt) {
    const daysDiff = (Date.now() - new Date(publishedAt).getTime()) / 86_400_000
    if (daysDiff <= 1) score += 4
    else if (daysDiff <= 3) score += 3
    else if (daysDiff <= 7) score += 2
    else if (daysDiff <= 14) score += 1
  }

  const maxPossible = terms.length * 4 + 4
  return Math.round(Math.min(10, maxPossible > 0 ? (score / maxPossible) * 10 : 0) * 10) / 10
}

// ── 메인 검색 함수 ─────────────────────────────────────────────

export async function searchCSE(params: {
  query: string
  dateRange?: string
  country?: string
  language?: string
  customFrom?: string
  customTo?: string
}): Promise<{ items: NewsItem[]; totalResults: number }> {
  const { query, dateRange = 'm1', country = 'us', customFrom, customTo } = params

  const apiKey = process.env.GOOGLE_CSE_API_KEY
  const cx    = process.env.GOOGLE_CSE_CX

  // env 미설정 시 조용히 빈 결과 반환
  if (!apiKey || !cx) return { items: [], totalResults: 0 }

  const config = COUNTRY_CONFIGS[country] ?? COUNTRY_CONFIGS.us

  const url = new URL(BASE_URL)
  const p   = url.searchParams
  p.set('key', apiKey)
  p.set('cx',  cx)
  p.set('q',   query)
  p.set('num', '10')
  p.set('gl',  config.gl)
  p.set('lr',  config.lr)

  if (dateRange === 'custom' && customFrom && customTo) {
    // 절대 날짜 범위: sort=date:r:YYYYMMDD:YYYYMMDD
    const from = toYYYYMMDD(new Date(customFrom))
    const to   = toYYYYMMDD(new Date(customTo))
    p.set('sort', `date:r:${from}:${to}`)
  } else {
    p.set('dateRestrict', toDateRestrict(dateRange))
    p.set('sort', 'date')
  }

  let response: Response
  try {
    response = await fetch(url.toString(), { cache: 'no-store' })
  } catch (err) {
    throw new CSEError(
      `네트워크 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
      503
    )
  }

  const data: CSEResponse = await response.json().catch(() => ({} as CSEResponse))

  if (!response.ok) {
    if (response.status === 429) {
      throw new CSEError('Google CSE 일일 요청 한도를 초과했습니다.', 429, 'QUOTA_EXCEEDED')
    }
    if (response.status === 403) {
      throw new CSEError('Google CSE 인증 오류입니다. GOOGLE_CSE_API_KEY를 확인해주세요.', 403, 'AUTH_ERROR')
    }
    // 검색 결과 없음(정상 케이스)은 에러 아님
    if (response.status === 400 && data.error?.message?.includes('Invalid Value')) {
      return { items: [], totalResults: 0 }
    }
    throw new CSEError(data.error?.message ?? `CSE 오류 (${response.status})`, response.status)
  }

  const rawItems = data.items ?? []

  const partial = rawItems.map((item): Omit<NewsItem, 'titleKo'> => {
    const metatags   = item.pagemap?.metatags?.[0] ?? {}
    const publishedAt =
      metatags['article:published_time'] ??
      metatags['article:modified_time'] ??
      item.pagemap?.newsarticle?.[0]?.datepublished ??
      item.pagemap?.article?.[0]?.datepublished ??
      null

    const source =
      metatags['og:site_name'] ||
      item.displayLink.replace(/^www\./, '')

    const snippet = item.snippet.replace(/\n/g, ' ').trim()

    return {
      title:          item.title,
      snippet,
      link:           item.link,
      source,
      publishedAt,
      country,
      thumbnailUrl:   metatags['og:image'] ?? null,
      relevanceScore: calcRelevanceScore(item.title, snippet, query, publishedAt),
    }
  })

  const titles           = partial.map((i) => i.title)
  const translatedTitles = await batchTranslateToKorean(titles)

  const items: NewsItem[] = partial.map((item, idx) => ({
    ...item,
    titleKo: translatedTitles[idx] ?? '',
  }))

  return {
    items,
    totalResults: parseInt(data.searchInformation?.totalResults ?? '0', 10),
  }
}
