import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  searchNews,
  GoogleSearchError,
  COUNTRY_CONFIGS,
  SUPPORTED_DATE_RANGES,
} from '@/lib/google-search'
import { searchCSE, CSEError } from '@/lib/google-cse'
import { searchGdelt } from '@/lib/gdelt'
import { getCachedSearch, setCachedSearch } from '@/lib/news-cache'
import { prisma } from '@/lib/prisma'
import { applyScoring, parseScoringConfig } from '@/lib/scoring'
import type { NewsItem } from '@/types/news'

/**
 * GET /api/news/search
 *
 * Query params:
 *   query      (필수) 검색 키워드
 *   dateRange  기간 필터 (d1|d3|d7|w1|m1|m3|m6|y1|custom, 기본: m1)
 *   country    국가 코드 (us|gb|jp|kr|..., 기본: us)
 *   language   언어 코드 (미지정 시 country 기반 자동 설정)
 *   start      페이지네이션 시작 인덱스 (1~91, 기본: 1)
 *   customFrom YYYY-MM-DD (dateRange=custom 시 필수)
 *   customTo   YYYY-MM-DD (dateRange=custom 시 필수)
 *
 * 소스: NewsAPI + Google CSE 병렬 호출 → URL 기준 중복 제거 후 병합
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
  const query      = sp.get('query')?.trim()
  const dateRange  = sp.get('dateRange') ?? 'm1'
  const country    = sp.get('country') ?? 'us'
  const language   = sp.get('language') ?? ''
  const startRaw   = parseInt(sp.get('start') ?? '1', 10)
  const start      = isNaN(startRaw) ? 1 : Math.max(1, startRaw)
  const categoryIds = sp.get('categoryIds')?.split(',').filter(Boolean) ?? []
  const customFrom = sp.get('customFrom') ?? ''
  const customTo   = sp.get('customTo') ?? ''

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
  if (dateRange === 'custom' && (!customFrom || !customTo)) {
    return NextResponse.json(
      { error: '사용자 정의 기간 검색 시 customFrom, customTo 날짜를 입력해주세요. (YYYY-MM-DD)' },
      { status: 400 }
    )
  }
  if (!COUNTRY_CONFIGS[country]) {
    return NextResponse.json(
      { error: `지원하지 않는 국가입니다. 허용 값: ${Object.keys(COUNTRY_CONFIGS).join(', ')}` },
      { status: 400 }
    )
  }

  const cacheParams = { query, country, language, dateRange, start, customFrom, customTo }

  // ── 사용자 스코어링 설정 + 캐시 조회 병렬 실행 ───────────────
  const [cached, scoringRow, catRows] = await Promise.all([
    getCachedSearch(cacheParams),
    prisma.scoringConfig.findUnique({ where: { userId: session.user.id } }),
    categoryIds.length > 0
      ? prisma.category.findMany({
          where: { id: { in: categoryIds } },
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
    const scoredItems = applyScoring(cached.items, query, mergedConfig)

    return NextResponse.json(
      { ...cached, items: scoredItems, query, country, dateRange },
      { headers: { 'X-Cache': 'HIT', 'X-Cache-Age': String(cacheAgeSeconds) } }
    )
  }

  // ── NewsAPI + Google CSE 병렬 호출 ──────────────────────────
  try {
    const searchParams = { query, dateRange, country, language, customFrom, customTo }

    const [newsApiSettled, cseSettled, gdeltSettled] = await Promise.allSettled([
      searchNews({ ...searchParams, start }),
      searchCSE(searchParams),
      searchGdelt(searchParams),
    ])

    // 결과 수집 (부분 실패 허용)
    const newsApiResult = newsApiSettled.status === 'fulfilled' ? newsApiSettled.value : null
    const cseResult     = cseSettled.status    === 'fulfilled' ? cseSettled.value     : null
    const gdeltResult   = gdeltSettled.status  === 'fulfilled' ? gdeltSettled.value   : null

    // 전부 실패 시에만 에러
    if (!newsApiResult && !cseResult && !gdeltResult) {
      throw newsApiSettled.status === 'rejected'
        ? newsApiSettled.reason
        : new Error('모든 검색 소스 실패')
    }

    // URL 기준 중복 제거 병합 (NewsAPI → CSE → GDELT 순)
    const seen = new Set<string>()
    const mergedItems: NewsItem[] = []
    for (const item of [
      ...(newsApiResult?.items ?? []),
      ...(cseResult?.items    ?? []),
      ...(gdeltResult?.items  ?? []),
    ]) {
      if (!seen.has(item.link)) {
        seen.add(item.link)
        mergedItems.push(item)
      }
    }

    const result = {
      items:        mergedItems,
      totalResults: (newsApiResult?.totalResults ?? 0) + (cseResult?.totalResults ?? 0) + (gdeltResult?.totalResults ?? 0),
      startIndex:   1,
      hasNextPage:  false,
    }

    // 캐시 저장 (백그라운드)
    setCachedSearch(cacheParams, result).catch((err) =>
      console.error('[CACHE_SET_ERROR]', err)
    )

    // 소스별 결과 수 로그 (개발용)
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[SEARCH] NewsAPI: ${newsApiResult?.items.length ?? 'ERR'} | CSE: ${cseResult?.items.length ?? 'ERR'} | GDELT: ${gdeltResult?.items.length ?? 'ERR'}`
      )
    }

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
            error: 'NewsAPI 인증 오류입니다. NEWS_API_KEY를 확인해주세요.',
            code: 'AUTH_ERROR',
            detail: error.reason,
          },
          { status: 502 }
        )
      }
      if (error.statusCode >= 500) {
        return NextResponse.json(
          { error: 'NewsAPI가 일시적으로 사용 불가합니다. 잠시 후 재시도해주세요.', code: 'UPSTREAM_ERROR' },
          { status: 502 }
        )
      }
      return NextResponse.json(
        { error: error.message, code: error.reason ?? 'SEARCH_ERROR' },
        { status: error.statusCode }
      )
    }

    if (error instanceof CSEError) {
      // CSE 단독 오류 → NewsAPI만으로 재시도하지 않음 (둘 다 실패한 경우만 여기 도달)
      console.error('[CSE_ERROR]', error.message)
    }

    console.error('[NEWS_SEARCH_ERROR]', error)
    return NextResponse.json(
      { error: '검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500 }
    )
  }
}
