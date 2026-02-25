/**
 * NewsAPI 클라이언트 (google-search.ts 대체)
 *
 * - 무료 한도: 100 requests/day (카드 등록 불필요)
 * - 엔드포인트: https://newsapi.org/v2/everything
 * - 국가 필터: language 파라미터로 대체
 */

import type { NewsItem } from '@/types/news'
import { batchTranslateToKorean } from './translate'

const BASE_URL = 'https://newsapi.org/v2/everything'

// ── 국가별 설정 (기존 호환성 유지) ───────────────────────────

interface CountryConfig {
  nameKo: string
  gl: string
  cr: string
  lr: string
  language: string  // NewsAPI language 코드
}

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  us: { nameKo: '미국',       gl: 'us', cr: 'countryUS', lr: 'lang_en', language: 'en' },
  gb: { nameKo: '영국',       gl: 'gb', cr: 'countryGB', lr: 'lang_en', language: 'en' },
  au: { nameKo: '호주',       gl: 'au', cr: 'countryAU', lr: 'lang_en', language: 'en' },
  ca: { nameKo: '캐나다',     gl: 'ca', cr: 'countryCA', lr: 'lang_en', language: 'en' },
  jp: { nameKo: '일본',       gl: 'jp', cr: 'countryJP', lr: 'lang_ja', language: 'ja' },
  kr: { nameKo: '한국',       gl: 'kr', cr: 'countryKR', lr: 'lang_ko', language: 'ko' },
  cn: { nameKo: '중국',       gl: 'cn', cr: 'countryCN', lr: 'lang_zh-CN', language: 'zh' },
  in: { nameKo: '인도',       gl: 'in', cr: 'countryIN', lr: 'lang_en', language: 'en' },
  sg: { nameKo: '싱가포르',   gl: 'sg', cr: 'countrySG', lr: 'lang_en', language: 'en' },
  ae: { nameKo: 'UAE',        gl: 'ae', cr: 'countryAE', lr: 'lang_ar', language: 'ar' },
  sa: { nameKo: '사우디',     gl: 'sa', cr: 'countrySA', lr: 'lang_ar', language: 'ar' },
  il: { nameKo: '이스라엘',   gl: 'il', cr: 'countryIL', lr: 'lang_iw', language: 'he' },
  de: { nameKo: '독일',       gl: 'de', cr: 'countryDE', lr: 'lang_de', language: 'de' },
  fr: { nameKo: '프랑스',     gl: 'fr', cr: 'countryFR', lr: 'lang_fr', language: 'fr' },
}

export const SUPPORTED_COUNTRIES = Object.keys(COUNTRY_CONFIGS)

export const SUPPORTED_DATE_RANGES = [
  'd1', 'd3', 'd7', 'w1', 'm1', 'm3', 'm6', 'y1',
]

// ── NewsAPI 응답 타입 ─────────────────────────────────────────

interface NewsApiArticle {
  source: { id: string | null; name: string }
  author: string | null
  title: string
  description: string | null
  url: string
  urlToImage: string | null
  publishedAt: string
  content: string | null
}

interface NewsApiResponse {
  status: string
  totalResults?: number
  articles?: NewsApiArticle[]
  code?: string
  message?: string
}

// ── 커스텀 에러 (기존 호환성 유지) ───────────────────────────

export class GoogleSearchError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly reason?: string
  ) {
    super(message)
    this.name = 'GoogleSearchError'
  }
}

// ── 날짜 범위 → from 날짜 변환 ───────────────────────────────

function dateRangeToFrom(dateRange: string): string {
  const days: Record<string, number> = {
    d1: 1, d3: 3, d7: 7, w1: 7,
    m1: 30, m3: 90, m6: 180, y1: 365,
  }
  const d = days[dateRange] ?? 30
  const from = new Date(Date.now() - d * 24 * 60 * 60 * 1000)
  return from.toISOString().split('T')[0] // YYYY-MM-DD
}

// ── 적합도 점수 계산 ──────────────────────────────────────────

function calculateRelevanceScore(
  title: string,
  snippet: string,
  query: string,
  publishedAt: string | null
): number {
  // "A OR B OR C" 또는 '"A B" OR "C D"' 형태 파싱
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

  // 제목에 키워드가 하나도 없으면 0점 (제목 기준 필터링)
  if (titleMatches === 0) return 0

  let score = titleMatches * 4 + snippetMatches * 1

  if (publishedAt) {
    const daysDiff =
      (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24)
    if (daysDiff <= 1) score += 4
    else if (daysDiff <= 3) score += 3
    else if (daysDiff <= 7) score += 2
    else if (daysDiff <= 14) score += 1
  }

  const maxPossible = terms.length * 4 + 4
  const normalized = maxPossible > 0 ? (score / maxPossible) * 10 : 0
  return Math.round(Math.min(10, normalized) * 10) / 10
}

// ── 검색 파라미터 & 결과 타입 ────────────────────────────────

export interface SearchParams {
  query: string
  dateRange?: string
  country?: string
  language?: string
  start?: number
  num?: number
}

export interface SearchResult {
  items: NewsItem[]
  totalResults: number
  startIndex: number
  hasNextPage: boolean
}

// ── 메인 검색 함수 ────────────────────────────────────────────

export async function searchNews(params: SearchParams): Promise<SearchResult> {
  const {
    query,
    dateRange = 'm1',
    country = 'us',
    start = 1,
    num = 100,  // 한 번에 최대 100건 수집
  } = params

  const apiKey = process.env.NEWS_API_KEY

  if (!apiKey) {
    throw new GoogleSearchError(
      'NEWS_API_KEY 환경변수가 설정되지 않았습니다.',
      500
    )
  }

  const config = COUNTRY_CONFIGS[country] ?? COUNTRY_CONFIGS.us
  const pageSize = Math.min(Math.max(1, num), 100)
  const page = Math.ceil(start / pageSize)

  const url = new URL(BASE_URL)
  const p = url.searchParams
  p.set('q', query)
  p.set('language', config.language)
  p.set('from', dateRangeToFrom(dateRange))
  p.set('sortBy', 'publishedAt')
  p.set('pageSize', String(pageSize))
  p.set('page', String(page))
  // 제목·설명에서만 검색 → 본문에 키워드만 있는 무관 기사 차단
  p.set('searchIn', 'title,description')

  let response: Response
  try {
    response = await fetch(url.toString(), {
      headers: {
        'X-Api-Key': apiKey,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })
  } catch (err) {
    throw new GoogleSearchError(
      `네트워크 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
      503
    )
  }

  const data: NewsApiResponse = await response.json()

  // ── 에러 처리 ──────────────────────────────────────────────
  if (data.status !== 'ok') {
    const code = data.code ?? ''
    const message = data.message ?? 'NewsAPI 오류'

    if (code === 'rateLimited' || response.status === 429) {
      throw new GoogleSearchError(
        'NewsAPI 일일 할당량(100건)을 초과했습니다. 내일 다시 시도해주세요.',
        429,
        code
      )
    }
    if (code === 'apiKeyInvalid' || code === 'apiKeyDisabled' || response.status === 401) {
      throw new GoogleSearchError(
        'NewsAPI 인증 오류입니다. NEWS_API_KEY를 확인해주세요.',
        403,
        code
      )
    }
    throw new GoogleSearchError(message, response.status || 502, code)
  }

  // ── 결과 파싱 ──────────────────────────────────────────────
  const rawArticles = (data.articles ?? []).filter(
    (a) => a.title && a.title !== '[Removed]' && a.url
  )
  const totalResults = Math.min(data.totalResults ?? 0, 100)
  const hasNextPage = page * pageSize < totalResults

  const partial = rawArticles.map((article) => {
    const publishedAt = article.publishedAt
      ? new Date(article.publishedAt).toISOString()
      : null
    const snippet = (article.description ?? article.content ?? '').replace(/\n/g, ' ').trim()
    const source = article.source.name || new URL(article.url).hostname.replace(/^www\./, '')

    return {
      title: article.title ?? '',
      snippet,
      link: article.url ?? '',
      source,
      publishedAt,
      country,
      thumbnailUrl: article.urlToImage ?? null,
      relevanceScore: calculateRelevanceScore(
        article.title ?? '',
        snippet,
        query,
        publishedAt
      ),
    }
  })

  // ── 한글 번역 ──────────────────────────────────────────────
  const titles = partial.map((i) => i.title)
  const translatedTitles = await batchTranslateToKorean(titles)

  const items: NewsItem[] = partial.map((item, idx) => ({
    ...item,
    titleKo: translatedTitles[idx] ?? '',
  }))

  return { items, totalResults, startIndex: start, hasNextPage }
}
