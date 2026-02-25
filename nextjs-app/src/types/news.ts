// ── 단일 뉴스 아이템 ─────────────────────────────────────────
export interface NewsItem {
  title: string          // 원문 제목
  titleKo: string        // 한글 번역 제목 (ANTHROPIC_API_KEY 미설정 시 '')
  snippet: string        // 요약 본문
  link: string           // 원문 URL
  source: string         // 매체명 (도메인 기반)
  publishedAt: string | null  // ISO 8601 or null (Google이 날짜를 제공하지 않는 경우)
  country: string        // 검색 국가 코드 (gl 파라미터)
  thumbnailUrl: string | null // og:image / CSE thumbnail
  relevanceScore: number // 0~10 (쿼리 매칭 + 최신성)
}

// ── 검색 결과 ─────────────────────────────────────────────────
export interface NewsSearchResult {
  items: NewsItem[]
  totalResults: number
  startIndex: number
  hasNextPage: boolean
  cached: boolean
  cachedAt?: string  // ISO 8601
  query?: string
  country?: string
  dateRange?: string
}

// ── UI용 상수 ─────────────────────────────────────────────────
export const DATE_RANGE_OPTIONS = [
  { value: 'd1', label: '오늘' },
  { value: 'd3', label: '최근 3일' },
  { value: 'd7', label: '최근 7일' },
  { value: 'w1', label: '최근 1주' },
  { value: 'm1', label: '최근 1개월' },
  { value: 'm3', label: '최근 3개월' },
  { value: 'm6', label: '최근 6개월' },
  { value: 'y1', label: '최근 1년' },
] as const

export type DateRangeValue = (typeof DATE_RANGE_OPTIONS)[number]['value']

export interface CountryOption {
  code: string
  nameKo: string
  flag: string
  region: string
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  // 영미권
  { code: 'us', nameKo: '미국', flag: '🇺🇸', region: '영미권' },
  { code: 'gb', nameKo: '영국', flag: '🇬🇧', region: '영미권' },
  { code: 'au', nameKo: '호주', flag: '🇦🇺', region: '영미권' },
  { code: 'ca', nameKo: '캐나다', flag: '🇨🇦', region: '영미권' },
  // 아시아
  { code: 'jp', nameKo: '일본', flag: '🇯🇵', region: '아시아' },
  { code: 'kr', nameKo: '한국', flag: '🇰🇷', region: '아시아' },
  { code: 'cn', nameKo: '중국', flag: '🇨🇳', region: '아시아' },
  { code: 'in', nameKo: '인도', flag: '🇮🇳', region: '아시아' },
  { code: 'sg', nameKo: '싱가포르', flag: '🇸🇬', region: '아시아' },
  // 중동
  { code: 'ae', nameKo: 'UAE', flag: '🇦🇪', region: '중동' },
  { code: 'sa', nameKo: '사우디', flag: '🇸🇦', region: '중동' },
  { code: 'il', nameKo: '이스라엘', flag: '🇮🇱', region: '중동' },
  // 유럽
  { code: 'de', nameKo: '독일', flag: '🇩🇪', region: '유럽' },
  { code: 'fr', nameKo: '프랑스', flag: '🇫🇷', region: '유럽' },
]
