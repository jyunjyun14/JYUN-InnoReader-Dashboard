/**
 * 뉴스 기사 적합도 스코어링 시스템
 *
 * totalScore = min(100, keywordScore + priorityBonus + sourceBonus + recencyBonus + excludePenalty)
 * relevanceScore (NewsItem) = totalScore / 10  →  0~10 범위
 */

// ── 타입 ──────────────────────────────────────────────────────

export interface PriorityKeyword {
  term: string
  weight: number  // 1~5배 가중치
}

export interface ScoringConfig {
  priorityKeywords: PriorityKeyword[]
  excludeKeywords: string[]
  sourceTiers: Record<string, 1 | 2>  // domain → tier
  weightKeyword: number   // 기본 40 (키워드 매칭 최대 점수)
  weightPriority: number  // 기본 20
  weightSource: number    // 기본 20
  weightRecency: number   // 기본 20
}

// ── 기본 매체 티어 ─────────────────────────────────────────────

export const TIER1_DOMAINS = [
  'nature.com',
  'science.org',
  'nejm.org',
  'thelancet.com',
  'reuters.com',
  'statnews.com',
  'bmj.com',
  'jamanetwork.com',
  'cell.com',
  'nih.gov',
  'who.int',
  'bbc.com',
  'apnews.com',
]

export const TIER2_DOMAINS = [
  'fiercepharma.com',
  'biopharmadive.com',
  'medcitynews.com',
  'evaluate.com',
  'endpoints.news',
  'healthcareitnews.com',
  'modernhealthcare.com',
  'beckershospitalreview.com',
  'mobihealthnews.com',
  'medscape.com',
  'healio.com',
]

export const DEFAULT_SOURCE_TIERS: Record<string, 1 | 2> = {
  ...Object.fromEntries(TIER1_DOMAINS.map((d) => [d, 1 as const])),
  ...Object.fromEntries(TIER2_DOMAINS.map((d) => [d, 2 as const])),
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  priorityKeywords: [],
  excludeKeywords: [],
  sourceTiers: DEFAULT_SOURCE_TIERS,
  weightKeyword: 40,
  weightPriority: 20,
  weightSource: 20,
  weightRecency: 20,
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function strIncludes(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase())
}

function wordBoundaryMatch(text: string, term: string): boolean {
  try {
    return new RegExp(`\\b${escapeRe(term)}\\b`, 'i').test(text)
  } catch {
    return false
  }
}

// ── 컴포넌트 스코어 (각각 0~1 반환) ───────────────────────────

/**
 * 1. 키워드 매칭 점수
 *   - 제목 포함: +20점/키워드
 *   - 스니펫 포함: +10점/키워드
 *   - 제목 exact match 추가: +10점
 *   - raw cap: 40 → ratio 0~1
 */
function keywordRatio(title: string, snippet: string, terms: string[]): number {
  if (terms.length === 0) return 0
  let raw = 0
  for (const term of terms) {
    if (!term.trim()) continue
    if (strIncludes(title, term)) {
      raw += 20
      if (wordBoundaryMatch(title, term)) raw += 10 // exact match bonus
    }
    if (strIncludes(snippet, term)) raw += 10
  }
  return Math.min(1, raw / 40)
}

/**
 * 2. 우선 키워드 보너스
 *   - weight 1~5에 비례 (제목 4×weight, 스니펫 2×weight)
 *   - 전체 max raw 대비 ratio
 */
function priorityRatio(
  title: string,
  snippet: string,
  priorityKeywords: PriorityKeyword[]
): number {
  if (priorityKeywords.length === 0) return 0
  const maxRaw = priorityKeywords.reduce(
    (s, pk) => s + Math.min(5, Math.max(1, pk.weight)) * 4,
    0
  )
  if (maxRaw === 0) return 0
  let raw = 0
  for (const pk of priorityKeywords) {
    const w = Math.min(5, Math.max(1, pk.weight))
    if (strIncludes(title, pk.term)) raw += w * 4
    else if (strIncludes(snippet, pk.term)) raw += w * 2
  }
  return Math.min(1, raw / maxRaw)
}

/** 3. 제외 키워드 — true면 -30점 감점 */
function hasExcludeKeyword(
  title: string,
  snippet: string,
  excludeKeywords: string[]
): boolean {
  return excludeKeywords.some(
    (kw) => kw.trim() && (strIncludes(title, kw) || strIncludes(snippet, kw))
  )
}

/**
 * 4. 매체 신뢰도
 *   - 1티어: 1.0  → weightSource 전체
 *   - 2티어: 0.5  → weightSource 절반
 *   - 기타: 0
 */
function sourceRatio(source: string, tiers: Record<string, 1 | 2>): number {
  const s = source.toLowerCase().replace(/^www\./, '')
  for (const [domain, tier] of Object.entries(tiers)) {
    const d = domain.toLowerCase().replace(/^www\./, '')
    if (s === d || s.endsWith(`.${d}`) || s.includes(d)) {
      return tier === 1 ? 1.0 : 0.5
    }
  }
  return 0
}

/**
 * 5. 최신성
 *   - 24h:  1.00 → 최대
 *   - 3d:   0.75
 *   - 7d:   0.50
 *   - 30d:  0.25
 *   - 그 이상: 0
 */
function recencyRatio(publishedAt: string | null): number {
  if (!publishedAt) return 0
  const diffMs = Date.now() - new Date(publishedAt).getTime()
  if (isNaN(diffMs) || diffMs < 0) return 0
  const hours = diffMs / 3_600_000
  if (hours <= 24)  return 1.00
  if (hours <= 72)  return 0.75
  if (hours <= 168) return 0.50
  if (hours <= 720) return 0.25
  return 0
}

// ── 메인 스코어 함수 ───────────────────────────────────────────

export interface ScoreInput {
  title: string
  snippet: string
  source: string
  publishedAt: string | null
  searchQuery: string  // "kw1 OR kw2 OR kw3" 형태
}

/**
 * 단일 기사 적합도 점수 계산 (0~100)
 *
 * relevanceScore (NewsItem, 0~10) 로 변환하려면 ÷10 할 것.
 */
export function scoreNewsItem(input: ScoreInput, config: ScoringConfig): number {
  const { title, snippet, source, publishedAt, searchQuery } = input

  // 가중치 정규화 (합이 100이 아니어도 비율 유지)
  const totalW =
    config.weightKeyword + config.weightPriority + config.weightSource + config.weightRecency
  const norm = totalW > 0 ? 100 / totalW : 1
  const wK = config.weightKeyword * norm
  const wP = config.weightPriority * norm
  const wS = config.weightSource * norm
  const wR = config.weightRecency * norm

  // 쿼리 → 개별 검색어 파싱 ("A OR B OR C" 또는 '"A B" OR "C D"' → ["A B","C D"])
  const terms = searchQuery
    .split(/\s+OR\s+/i)
    .map((t) => t.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)

  const kScore = keywordRatio(title, snippet, terms) * wK
  const pScore = priorityRatio(title, snippet, config.priorityKeywords) * wP
  const sScore = sourceRatio(source, config.sourceTiers) * wS
  const rScore = recencyRatio(publishedAt) * wR
  const penalty = hasExcludeKeyword(title, snippet, config.excludeKeywords) ? -30 : 0

  const rawTotal = Math.max(0, Math.min(100, kScore + pScore + sScore + rScore + penalty))

  // ── 제목 키워드 게이트 ────────────────────────────────────────
  // 키워드가 제목에 하나도 없으면 관련성이 낮은 기사로 판단해 점수를 강제 하향
  const hasKeywordInTitle = terms.some(
    (t) => t.trim() && strIncludes(title, t)
  )
  if (!hasKeywordInTitle) {
    // 제목 미매칭: 최신성+출처 합산의 30%만 인정, 최대 20점으로 제한
    return Math.min(20, rawTotal * 0.3)
  }

  return rawTotal
}

// ── 세부 분석 스코어 ───────────────────────────────────────────

export interface ScoreBreakdown {
  keyword: number   // 0 ~ wK (정규화된 키워드 점수)
  priority: number  // 0 ~ wP
  source: number    // 0 ~ wS
  recency: number   // 0 ~ wR
  penalty: number   // -30 or 0
  total: number     // 0 ~ 100
}

/** 단일 기사 세부 컴포넌트 별 점수 반환 */
export function scoreWithBreakdown(input: ScoreInput, config: ScoringConfig): ScoreBreakdown {
  const { title, snippet, source, publishedAt, searchQuery } = input

  const totalW =
    config.weightKeyword + config.weightPriority + config.weightSource + config.weightRecency
  const norm = totalW > 0 ? 100 / totalW : 1
  const wK = config.weightKeyword * norm
  const wP = config.weightPriority * norm
  const wS = config.weightSource * norm
  const wR = config.weightRecency * norm

  const terms = searchQuery
    .split(/\s+OR\s+/i)
    .map((t) => t.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)

  const keyword  = keywordRatio(title, snippet, terms) * wK
  const priority = priorityRatio(title, snippet, config.priorityKeywords) * wP
  const source_  = sourceRatio(source, config.sourceTiers) * wS
  const recency  = recencyRatio(publishedAt) * wR
  const penalty  = hasExcludeKeyword(title, snippet, config.excludeKeywords) ? -30 : 0
  const total    = Math.max(0, Math.min(100, keyword + priority + source_ + recency + penalty))

  return { keyword, priority, source: source_, recency, penalty, total }
}

/**
 * 여러 기사에 일괄 스코어 적용 (relevanceScore 0~10 갱신)
 *
 * @param items   NewsItem[] 호환 배열 (relevanceScore 필드 있어야 함)
 * @param query   검색 쿼리 ("kw1 OR kw2 OR kw3")
 * @param config  사용자 스코어링 설정
 */
export function applyScoring<
  T extends {
    title: string
    snippet: string
    source: string
    publishedAt: string | null
    relevanceScore: number
  }
>(items: T[], query: string, config: ScoringConfig): T[] {
  return items.map((item) => ({
    ...item,
    relevanceScore: +(
      scoreNewsItem(
        {
          title: item.title,
          snippet: item.snippet,
          source: item.source,
          publishedAt: item.publishedAt,
          searchQuery: query,
        },
        config
      ) / 10
    ).toFixed(1),
  }))
}

// ── DB 결과 → ScoringConfig 변환 ──────────────────────────────

/**
 * Prisma에서 가져온 raw DB 행을 ScoringConfig 타입으로 안전하게 변환.
 * SQLite 환경에서는 Json 필드가 string으로 저장되므로 JSON.parse 처리.
 */
export function parseScoringConfig(row: {
  priorityKeywords: unknown
  excludeKeywords: unknown
  sourceTiers: unknown
  weightKeyword: number
  weightPriority: number
  weightSource: number
  weightRecency: number
} | null): ScoringConfig {
  if (!row) return DEFAULT_SCORING_CONFIG

  function tryParse(v: unknown): unknown {
    if (typeof v === 'string') {
      try { return JSON.parse(v) } catch { return v }
    }
    return v
  }

  const pk = tryParse(row.priorityKeywords)
  const ek = tryParse(row.excludeKeywords)
  const st = tryParse(row.sourceTiers)

  return {
    priorityKeywords: Array.isArray(pk) ? (pk as PriorityKeyword[]) : [],
    excludeKeywords: Array.isArray(ek) ? (ek as string[]) : [],
    sourceTiers:
      st && typeof st === 'object' && !Array.isArray(st)
        ? (st as Record<string, 1 | 2>)
        : DEFAULT_SOURCE_TIERS,
    weightKeyword: row.weightKeyword,
    weightPriority: row.weightPriority,
    weightSource: row.weightSource,
    weightRecency: row.weightRecency,
  }
}
