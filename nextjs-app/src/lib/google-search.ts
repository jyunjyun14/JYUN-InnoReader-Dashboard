/**
 * NewsAPI.org 클라이언트
 *
 * - 무료: 100 req/일, 100건/요청
 * - 캐시(6h) 덕분에 동일 쿼리 반복 시 크레딧 소모 없음
 * - /v2/everything: 제목+본문 전체 검색, 날짜 범위 지원 (1개월 이내)
 */

import type { NewsItem } from '@/types/news'
import { batchTranslateToKorean } from './translate'

const BASE_URL  = 'https://newsapi.org/v2/everything'
const PAGE_SIZE = 100  // 무료 플랜 최대

// ── 국가별 설정 ────────────────────────────────────────────────

interface CountryConfig {
  nameKo:   string
  gl:       string
  cr:       string
  lr:       string
  language: string
}

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  us: { nameKo: '미국',     gl: 'us', cr: 'countryUS', lr: 'lang_en', language: 'en' },
  gb: { nameKo: '영국',     gl: 'gb', cr: 'countryGB', lr: 'lang_en', language: 'en' },
  au: { nameKo: '호주',     gl: 'au', cr: 'countryAU', lr: 'lang_en', language: 'en' },
  ca: { nameKo: '캐나다',   gl: 'ca', cr: 'countryCA', lr: 'lang_en', language: 'en' },
  jp: { nameKo: '일본',     gl: 'jp', cr: 'countryJP', lr: 'lang_ja', language: 'ja' },
  kr: { nameKo: '한국',     gl: 'kr', cr: 'countryKR', lr: 'lang_ko', language: 'ko' },
  cn: { nameKo: '중국',     gl: 'cn', cr: 'countryCN', lr: 'lang_zh-CN', language: 'zh' },
  in: { nameKo: '인도',     gl: 'in', cr: 'countryIN', lr: 'lang_en', language: 'en' },
  sg: { nameKo: '싱가포르', gl: 'sg', cr: 'countrySG', lr: 'lang_en', language: 'en' },
  ae: { nameKo: 'UAE',      gl: 'ae', cr: 'countryAE', lr: 'lang_ar', language: 'ar' },
  sa: { nameKo: '사우디',   gl: 'sa', cr: 'countrySA', lr: 'lang_ar', language: 'ar' },
  il: { nameKo: '이스라엘', gl: 'il', cr: 'countryIL', lr: 'lang_iw', language: 'he' },
  de: { nameKo: '독일',     gl: 'de', cr: 'countryDE', lr: 'lang_de', language: 'de' },
  fr: { nameKo: '프랑스',   gl: 'fr', cr: 'countryFR', lr: 'lang_fr', language: 'fr' },
}

export const SUPPORTED_COUNTRIES   = Object.keys(COUNTRY_CONFIGS)
export const SUPPORTED_DATE_RANGES = ['d1', 'd3', 'd7', 'w1', 'm1', 'm3', 'm6', 'y1']

// ── dateRange → from 날짜 변환 ────────────────────────────────

function dateRangeToFrom(dateRange: string): string {
  const now = new Date()
  // 무료 플랜 최대 1개월 이내
  const MAX_DAYS = 29
  const dayMap: Record<string, number> = {
    d1: 1, d3: 3, d7: 7, w1: 7, m1: 29, m3: 29, m6: 29, y1: 29,
  }
  const days = Math.min(dayMap[dateRange] ?? 29, MAX_DAYS)
  now.setDate(now.getDate() - days)
  return now.toISOString().split('T')[0]  // YYYY-MM-DD
}

// ── NewsAPI 응답 타입 ──────────────────────────────────────────

interface NewsApiArticle {
  source:      { id: string | null; name: string }
  author:      string | null
  title:       string | null
  description: string | null
  url:         string
  urlToImage:  string | null
  publishedAt: string
  content:     string | null
}

interface NewsApiResponse {
  status:       string
  totalResults: number
  articles?:    NewsApiArticle[]
  code?:        string
  message?:     string
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

// ── 초기 적합도 점수 ──────────────────────────────────────────

function calculateRelevanceScore(
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

  const titleLower   = title.toLowerCase()
  const snippetLower = snippet.toLowerCase()

  let titleMatches   = 0
  let snippetMatches = 0
  for (const term of terms) {
    if (titleLower.includes(term)) titleMatches++
    else if (snippetLower.includes(term)) snippetMatches++
  }

  let score = titleMatches * 4 + snippetMatches * 1
  if (titleMatches === 0) score = Math.max(0, score * 0.3)

  if (publishedAt) {
    const daysDiff = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24)
    if (daysDiff <= 1)  score += 4
    else if (daysDiff <= 3)  score += 3
    else if (daysDiff <= 7)  score += 2
    else if (daysDiff <= 14) score += 1
  }

  const maxPossible = terms.length * 4 + 4
  return Math.round(Math.min(10, maxPossible > 0 ? (score / maxPossible) * 10 : 0) * 10) / 10
}

// ── 검색 파라미터 & 결과 타입 ─────────────────────────────────

export interface SearchParams {
  query:      string
  dateRange?: string
  country?:   string
  language?:  string
  start?:     number
  num?:       number
}

export interface SearchResult {
  items:        NewsItem[]
  totalResults: number
  startIndex:   number
  hasNextPage:  boolean
}

// ── fetch ─────────────────────────────────────────────────────

async function fetchArticles(opts: {
  query:    string
  language: string
  from:     string
  apiKey:   string
}): Promise<{ articles: NewsApiArticle[]; totalResults: number }> {
  const { query, language, from, apiKey } = opts

  const url = new URL(BASE_URL)
  const p   = url.searchParams
  p.set('apiKey',   apiKey)
  p.set('q',        query)
  p.set('language', language)
  p.set('from',     from)
  p.set('sortBy',   'publishedAt')
  p.set('pageSize', String(PAGE_SIZE))

  let response: Response
  try {
    response = await fetch(url.toString(), { cache: 'no-store' })
  } catch (err) {
    throw new GoogleSearchError(
      `네트워크 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
      503
    )
  }

  const data: NewsApiResponse = await response.json().catch(() => ({ status: 'error', totalResults: 0 }))

  if (!response.ok || data.status !== 'ok') {
    const code = data.code ?? ''
    if (code === 'rateLimited' || response.status === 429) {
      throw new GoogleSearchError(
        'NewsAPI 일일 요청 한도를 초과했습니다. 내일 다시 시도해주세요.',
        429, 'QUOTA_EXCEEDED'
      )
    }
    if (code === 'apiKeyInvalid' || code === 'apiKeyDisabled' || response.status === 401) {
      throw new GoogleSearchError(
        'NewsAPI 인증 오류입니다. NEWS_API_KEY를 확인해주세요.',
        403, 'AUTH_ERROR'
      )
    }
    if (code === 'parameterInvalid' || code === 'parametersMissing') {
      throw new GoogleSearchError(data.message ?? 'NewsAPI 파라미터 오류', 400, code)
    }
    console.error('[NEWSAPI_ERROR]', response.status, JSON.stringify(data))
    throw new GoogleSearchError(data.message ?? `NewsAPI 오류 (${response.status})`, response.status)
  }

  return {
    articles:     data.articles ?? [],
    totalResults: data.totalResults,
  }
}

// ── 메인 검색 함수 ─────────────────────────────────────────────

export async function searchNews(params: SearchParams): Promise<SearchResult> {
  const { query, dateRange = 'm1', country = 'us' } = params

  const apiKey = process.env.NEWS_API_KEY
  if (!apiKey) {
    throw new GoogleSearchError('NEWS_API_KEY 환경변수가 설정되지 않았습니다.', 500)
  }

  const config = COUNTRY_CONFIGS[country] ?? COUNTRY_CONFIGS.us
  const from   = dateRangeToFrom(dateRange)

  const { articles, totalResults } = await fetchArticles({
    query,
    language: config.language,
    from,
    apiKey,
  })

  // '[Removed]' 등 삭제된 기사 제거
  const valid = articles.filter(
    (a) => a.title && a.title !== '[Removed]' && a.url
  )

  // ── NewsItem 변환 ────────────────────────────────────────────
  const partial = valid.map((article) => {
    const snippet = (article.description ?? '').replace(/\n/g, ' ').trim()
    const source  = article.source.name ||
      (() => { try { return new URL(article.url).hostname.replace(/^www\./, '') } catch { return '' } })()

    return {
      title:          article.title ?? '',
      snippet,
      link:           article.url,
      source,
      publishedAt:    article.publishedAt || null,
      country,
      thumbnailUrl:   article.urlToImage ?? null,
      relevanceScore: calculateRelevanceScore(
        article.title ?? '', snippet, query, article.publishedAt
      ),
    }
  })

  // ── 한글 번역 ────────────────────────────────────────────────
  const titles           = partial.map((i) => i.title)
  const translatedTitles = await batchTranslateToKorean(titles)

  const items: NewsItem[] = partial.map((item, idx) => ({
    ...item,
    titleKo: translatedTitles[idx] ?? '',
  }))

  return {
    items,
    totalResults,
    startIndex:  1,
    hasNextPage: false,
  }
}
