import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  searchNews,
  GoogleSearchError,
  COUNTRY_CONFIGS,
  SUPPORTED_DATE_RANGES,
} from '@/lib/google-search'
import { getCachedSearch, setCachedSearch } from '@/lib/news-cache'
import { prisma } from '@/lib/prisma'
import { applyScoring, parseScoringConfig } from '@/lib/scoring'

/**
 * GET /api/news/search
 *
 * Query params:
 *   query      (필수) 검색 키워드
 *   dateRange  기간 필터 (d1|d3|d7|w1|m1|m3|m6|y1, 기본: m1)
 *   country    국가 코드 (us|gb|jp|kr|..., 기본: us)
 *   language   언어 코드 (미지정 시 country 기반 자동 설정)
 *   start      페이지네이션 시작 인덱스 (1~91, 기본: 1)
 *
 * 응답 헤더:
 *   X-Cache: HIT | MISS
 *   X-Cache-Age: 초 (HIT 시)
 */
export async function GET(req: NextRequest) {
  // ── 인증 확인 ────────────────────────────────────────────────
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  // ── 파라미터 파싱 ────────────────────────────────────────────
  const sp = req.nextUrl.searchParams
  const query = sp.get('query')?.trim()
  const dateRange = sp.get('dateRange') ?? 'm1'
  const country = sp.get('country') ?? 'us'
  const language = sp.get('language') ?? ''
  const startRaw = parseInt(sp.get('start') ?? '1', 10)
  const start = isNaN(startRaw) ? 1 : Math.max(1, startRaw)
  const categoryIds = sp.get('categoryIds')?.split(',').filter(Boolean) ?? []

  // ── 유효성 검사 ──────────────────────────────────────────────
  if (!query) {
    return NextResponse.json({ error: '검색어(query)를 입력해주세요.' }, { status: 400 })
  }
  if (query.length > 500) {
    return NextResponse.json({ error: '검색어가 너무 깁니다. (최대 500자)' }, { status: 400 })
  }
  if (!SUPPORTED_DATE_RANGES.includes(dateRange)) {
    return NextResponse.json(
      { error: `지원하지 않는 dateRange 값입니다. 허용 값: ${SUPPORTED_DATE_RANGES.join(', ')}` },
      { status: 400 }
    )
  }
  if (!COUNTRY_CONFIGS[country]) {
    return NextResponse.json(
      { error: `지원하지 않는 국가입니다. 허용 값: ${Object.keys(COUNTRY_CONFIGS).join(', ')}` },
      { status: 400 }
    )
  }
  if (start > 91) {
    return NextResponse.json(
      { error: 'start 값은 91을 초과할 수 없습니다. (Google CSE 제한)' },
      { status: 400 }
    )
  }

  const cacheParams = { query, country, language, dateRange, start }

  // ── 사용자 스코어링 설정 + 캐시 조회 병렬 실행 ───────────────
  const [cached, scoringRow, catRows] = await Promise.all([
    getCachedSearch(cacheParams),
    prisma.scoringConfig.findUnique({ where: { userId: session.user.id } }),
    categoryIds.length > 0
      ? prisma.category.findMany({
          where: { id: { in: categoryIds }, userId: session.user.id },
          select: { priorityKeywords: true, excludeKeywords: true },
        })
      : Promise.resolve([]),
  ])

  const scoringConfig = parseScoringConfig(scoringRow)

  // 분야별 우선 키워드 병합
  const catPriorityKws = catRows.flatMap((c) => {
    try {
      const parsed = JSON.parse(c.priorityKeywords)
      return Array.isArray(parsed) ? (parsed as { term: string; weight: number }[]) : []
    } catch { return [] }
  })

  // 분야별 제외 키워드 병합
  const catExcludeKws = catRows.flatMap((c) => {
    try {
      const parsed = JSON.parse(c.excludeKeywords)
      return Array.isArray(parsed) ? (parsed as string[]) : []
    } catch { return [] }
  })

  // 분야별 키워드가 있으면 전역 설정과 병합 (중복 term은 분야별 키워드 우선)
  const mergedPriorityKws = catPriorityKws.length > 0
    ? (() => {
        const catTerms = new Set(catPriorityKws.map((k) => k.term.toLowerCase()))
        const globalOnly = scoringConfig.priorityKeywords.filter(
          (k) => !catTerms.has(k.term.toLowerCase())
        )
        return [...catPriorityKws, ...globalOnly]
      })()
    : scoringConfig.priorityKeywords

  const mergedConfig = {
    ...scoringConfig,
    priorityKeywords: mergedPriorityKws,
    excludeKeywords: catExcludeKws.length > 0
      ? Array.from(new Set([...scoringConfig.excludeKeywords, ...catExcludeKws]))
      : scoringConfig.excludeKeywords,
  }

  // ── 캐시 히트 ────────────────────────────────────────────────
  if (cached) {
    const cacheAgeSeconds = Math.floor(
      (Date.now() - new Date(cached.cachedAt).getTime()) / 1000
    )
    // 캐시된 raw 결과에 사용자별 스코어링 적용
    const scoredItems = applyScoring(cached.items, query, mergedConfig)

    return NextResponse.json(
      { ...cached, items: scoredItems, query, country, dateRange },
      { headers: { 'X-Cache': 'HIT', 'X-Cache-Age': String(cacheAgeSeconds) } }
    )
  }

  // ── Google Custom Search API 호출 ────────────────────────────
  try {
    const result = await searchNews({ query, dateRange, country, language, start, num: 100 })

    // 캐시 저장은 백그라운드 (raw 결과 = 사용자별 점수 제외)
    setCachedSearch(cacheParams, result).catch((err) =>
      console.error('[CACHE_SET_ERROR]', err)
    )

    // 사용자별 스코어링 적용 후 반환
    const scoredItems = applyScoring(result.items, query, mergedConfig)

    return NextResponse.json(
      { ...result, items: scoredItems, cached: false, query, country, dateRange },
      { headers: { 'X-Cache': 'MISS' } }
    )
  } catch (error) {
    // ── 에러 핸들링 ──────────────────────────────────────────
    if (error instanceof GoogleSearchError) {
      if (error.statusCode === 429) {
        return NextResponse.json(
          { error: error.message, code: 'QUOTA_EXCEEDED', retryAfter: '내일 00:00 UTC' },
          { status: 429, headers: { 'Retry-After': '86400' } }
        )
      }
      if (error.statusCode === 400 || error.statusCode === 403) {
        return NextResponse.json(
          {
            error: 'Google Search API 인증 오류입니다. GOOGLE_API_KEY를 확인해주세요.',
            code: 'AUTH_ERROR',
            detail: error.reason,
          },
          { status: 502 }
        )
      }
      if (error.statusCode >= 500) {
        return NextResponse.json(
          {
            error: 'Google Search API가 일시적으로 사용 불가합니다. 잠시 후 재시도해주세요.',
            code: 'UPSTREAM_ERROR',
          },
          { status: 502 }
        )
      }
      return NextResponse.json(
        { error: error.message, code: error.reason ?? 'SEARCH_ERROR' },
        { status: error.statusCode }
      )
    }

    console.error('[NEWS_SEARCH_ERROR]', error)
    return NextResponse.json(
      { error: '검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500 }
    )
  }
}
