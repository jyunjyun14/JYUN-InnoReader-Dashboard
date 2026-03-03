/**
 * NewsData.io API 클라이언트
 *
 * - 무료: 200 크레딧/일, 10건/요청 → 최대 2,000건/일
 * - 페이지당 10건, 최대 MAX_PAGES 페이지 연속 수집
 * - 캐시(6h) 덕분에 동일 쿼리 반복 시 크레딧 소모 없음
 */

import type { NewsItem } from '@/types/news'
import { batchTranslateToKorean } from './translate'

const BASE_URL  = 'https://newsdata.io/api/1/latest'
const PAGE_SIZE = 10  // 무료 플랜 최대 (유료: 50)
const MAX_PAGES = 5   // 1 search = 최대 5 req × 10건 = 50건 (5 크레딧)

// ── 국가별 설정 (기존 호환성 유지) ───────────────────────────

interface CountryConfig {
  nameKo: string
  gl: string
  cr: string
  lr: string
  language: string
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

export const SUPPORTED_COUNTRIES    = Object.keys(COUNTRY_CONFIGS)
export const SUPPORTED_DATE_RANGES  = ['d1', 'd3', 'd7', 'w1', 'm1', 'm3', 'm6', 'y1']

// ── NewsData.io 응답 타입 ─────────────────────────────────────

interface NewsDataArticle {
  article_id: string
  title:       string | null
  link:        string | null
  source_id:   string
  source_name: string | null
  source_url:  string | null
  description: string | null
  content:     string | null
  pubDate:     string | null
  image_url:   string | null
  language:    string
  country:     string[]
}

interface NewsDataResponse {
  status:        string
  totalResults?: number
  results?:      NewsDataArticle[]
  nextPage?:     string | null
  code?:         string
  message?:      string
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
  return from.toISOString().split('T')[0]
}

// ── 초기 적합도 점수 (applyScoring 전 기본값) ─────────────────

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

// ── 검색 파라미터 & 결과 타입 ────────────────────────────────

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

// ── 단일 페이지 fetch ─────────────────────────────────────────

async function fetchOnePage(opts: {
  query:      string
  language:   string
  country:    string
  fromDate:   string
  apiKey:     string
  pageToken?: string
}): Promise<{ articles: NewsDataArticle[]; nextPage: string | null; totalResults: number }> {
  const { query, language, country, fromDate, apiKey, pageToken } = opts

  const url = new URL(BASE_URL)
  const p   = url.searchParams
  p.set('apikey',    apiKey)
  p.set('q',         query)
  p.set('language',  language)
  p.set('country',   country)
  p.set('from_date', fromDate)
  p.set('size',      String(PAGE_SIZE))
  if (pageToken) p.set('page', pageToken)

  let response: Response
  try {
    response = await fetch(url.toString(), { cache: 'no-store' })
  } catch (err) {
    throw new GoogleSearchError(
      `네트워크 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
      503
    )
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new GoogleSearchError(
        'NewsData.io 인증 오류입니다. NEWSDATA_API_KEY를 확인해주세요.',
        403, 'AUTH_ERROR'
      )
    }
    if (response.status === 429) {
      throw new GoogleSearchError(
        'NewsData.io 일일 크레딧을 초과했습니다. 내일 다시 시도해주세요.',
        429, 'QUOTA_EXCEEDED'
      )
    }
    throw new GoogleSearchError(`NewsData.io 오류 (${response.status})`, response.status)
  }

  const data: NewsDataResponse = await response.json()

  if (data.status !== 'success') {
    const code = data.code ?? ''
    if (code === 'QuotaExceeded' || code === 'QuotaError') {
      throw new GoogleSearchError(
        'NewsData.io 일일 크레딧을 초과했습니다. 내일 다시 시도해주세요.',
        429, code
      )
    }
    if (code === 'InvalidApikey' || code === 'ApiKeyNotFound') {
      throw new GoogleSearchError(
        'NewsData.io API 키가 유효하지 않습니다. NEWSDATA_API_KEY를 확인해주세요.',
        403, code
      )
    }
    throw new GoogleSearchError(data.message ?? 'NewsData.io 오류', 502, code)
  }

  return {
    articles:     data.results ?? [],
    nextPage:     data.nextPage ?? null,
    totalResults: data.totalResults ?? 0,
  }
}

// ── 메인 검색 함수 ────────────────────────────────────────────

export async function searchNews(params: SearchParams): Promise<SearchResult> {
  const { query, dateRange = 'm1', country = 'us' } = params

  const apiKey = process.env.NEWSDATA_API_KEY
  if (!apiKey) {
    throw new GoogleSearchError('NEWSDATA_API_KEY 환경변수가 설정되지 않았습니다.', 500)
  }

  const config   = COUNTRY_CONFIGS[country] ?? COUNTRY_CONFIGS.us
  const fromDate = dateRangeToFrom(dateRange)

  // ── 다중 페이지 수집 ────────────────────────────────────────
  const allArticles: NewsDataArticle[] = []
  let pageToken:    string | undefined  = undefined
  let totalResults: number              = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    let pageData: { articles: NewsDataArticle[]; nextPage: string | null; totalResults: number }

    try {
      pageData = await fetchOnePage({
        query, language: config.language, country, fromDate, apiKey, pageToken,
      })
    } catch (err) {
      if (page === 0) throw err  // 첫 페이지 실패 → 에러 전파
      break                       // 중간 페이지 실패 → 수집 중단 후 반환
    }

    totalResults = pageData.totalResults
    const valid  = pageData.articles.filter(
      (a) => a.title && a.title !== '[Removed]' && a.link
    )
    allArticles.push(...valid)

    if (!pageData.nextPage || valid.length === 0) break
    pageToken = pageData.nextPage
  }

  // ── NewsItem 변환 ────────────────────────────────────────────
  const partial = allArticles.map((article) => {
    const publishedAt = article.pubDate
      ? new Date(article.pubDate).toISOString()
      : null
    const snippet = (article.description ?? article.content ?? '').replace(/\n/g, ' ').trim()
    const source  =
      article.source_name ??
      (article.source_url
        ? new URL(article.source_url).hostname.replace(/^www\./, '')
        : article.source_id)

    return {
      title:         article.title ?? '',
      snippet,
      link:          article.link ?? '',
      source,
      publishedAt,
      country,
      thumbnailUrl:  article.image_url ?? null,
      relevanceScore: calculateRelevanceScore(
        article.title ?? '', snippet, query, publishedAt
      ),
    }
  })

  // ── 한글 번역 ────────────────────────────────────────────────
  const titles          = partial.map((i) => i.title)
  const translatedTitles = await batchTranslateToKorean(titles)

  const items: NewsItem[] = partial.map((item, idx) => ({
    ...item,
    titleKo: translatedTitles[idx] ?? '',
  }))

  return {
    items,
    totalResults,
    startIndex:  1,
    hasNextPage: allArticles.length < totalResults,
  }
}
