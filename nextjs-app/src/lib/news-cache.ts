import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { NewsItem, NewsSearchResult } from '@/types/news'

/** 캐시 유효 시간 (6시간) */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

export interface CacheParams {
  query: string
  country: string
  language: string
  dateRange: string
  start: number
}

/** 파라미터 조합의 SHA-1 해시를 캐시 키로 사용 */
export function buildCacheKey(params: CacheParams): string {
  const normalized = {
    q: params.query.toLowerCase().trim(),
    c: params.country || 'us',
    l: params.language || '',
    d: params.dateRange || 'm1',
    s: params.start || 1,
  }
  return createHash('sha1').update(JSON.stringify(normalized)).digest('hex')
}

/** 캐시 조회 — null 반환 시 캐시 미스 */
export async function getCachedSearch(
  params: CacheParams
): Promise<(NewsSearchResult & { cachedAt: string }) | null> {
  const cacheKey = buildCacheKey(params)

  const cached = await prisma.searchCache.findUnique({ where: { cacheKey } })
  if (!cached) return null

  // 만료 확인
  if (new Date() > cached.expiresAt) {
    // 백그라운드에서 삭제 (응답 지연 방지)
    prisma.searchCache.delete({ where: { cacheKey } }).catch(() => {})
    return null
  }

  let items: NewsItem[] = []
  try {
    items = JSON.parse(cached.results as string) as NewsItem[]
  } catch {
    items = []
  }

  return {
    items,
    totalResults: cached.totalResults,
    startIndex: cached.startIndex,
    hasNextPage: cached.startIndex + 10 <= cached.totalResults,
    cached: true,
    cachedAt: cached.createdAt.toISOString(),
  }
}

/** 검색 결과를 DB에 저장 */
export async function setCachedSearch(
  params: CacheParams,
  result: Omit<NewsSearchResult, 'cached' | 'cachedAt'>
): Promise<void> {
  const cacheKey = buildCacheKey(params)
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS)

  await prisma.searchCache.upsert({
    where: { cacheKey },
    update: {
      results: JSON.stringify(result.items),
      totalResults: result.totalResults,
      startIndex: result.startIndex,
      expiresAt,
      createdAt: new Date(),
    },
    create: {
      cacheKey,
      query: params.query,
      country: params.country || 'us',
      language: params.language || '',
      dateRange: params.dateRange || 'm1',
      startIndex: result.startIndex,
      totalResults: result.totalResults,
      results: JSON.stringify(result.items),
      expiresAt,
    },
  })
}

/**
 * 만료된 캐시 항목 일괄 삭제.
 * 주기적 cleanup job(cron) 또는 /api/admin/cache-cleanup 에서 호출.
 */
export async function cleanExpiredCache(): Promise<number> {
  const { count } = await prisma.searchCache.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
  return count
}
