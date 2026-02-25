/**
 * 엑셀 내보내기 (xlsx-js-style)
 * 클라이언트 사이드 전용 — 서버 요청 불필요
 */
import XLSX from 'xlsx-js-style'
import type { NewsItem } from '@/types/news'
import { COUNTRY_CONFIGS } from './google-search'

// ── 타입 ──────────────────────────────────────────────────────

export interface ExportCategory {
  id: string
  name: string
  keywords: { term: string }[]
}

export interface ExportOptions {
  items: NewsItem[]
  selectedCategories: ExportCategory[]
  selectedCountries: string[]
  dateRange: string
  customDateStart?: string
  customDateEnd?: string
  scoreRange: [number, number]
}

// ── 헬퍼 ──────────────────────────────────────────────────────

function scoreStyle(score: number) {
  if (score >= 85) return { bg: '7C3AED', fg: 'FFFFFF' }
  if (score >= 70) return { bg: '8B5CF6', fg: 'FFFFFF' }
  if (score >= 50) return { bg: 'DDD6FE', fg: '5B21B6' }
  if (score >= 30) return { bg: 'FDE68A', fg: '92400E' }
  return { bg: 'F3F4F6', fg: '6B7280' }
}

function matchCategories(
  item: NewsItem,
  categories: ExportCategory[]
): { catNames: string; keywords: string } {
  const text = (item.title + ' ' + item.snippet).toLowerCase()
  const catNames: string[] = []
  const kwSet = new Set<string>()

  for (const cat of categories) {
    const matched = cat.keywords.filter((kw) =>
      text.includes(kw.term.toLowerCase())
    )
    if (matched.length > 0) {
      catNames.push(cat.name)
      matched.forEach((kw) => kwSet.add(kw.term))
    }
  }

  return {
    catNames: catNames.join(', ') || '-',
    keywords: Array.from(kwSet).join(', ') || '-',
  }
}

function dateRangeLabel(
  range: string,
  start?: string,
  end?: string
): string {
  if (range === 'custom' && start && end) return `${start} ~ ${end}`
  const MAP: Record<string, string> = {
    d1: '최근 1일', d3: '최근 3일', d7: '최근 7일', w1: '최근 1주',
    m1: '최근 1개월', m3: '최근 3개월', m6: '최근 6개월', y1: '최근 1년',
  }
  return MAP[range] ?? range
}

// 셀 스타일 상수
const S_HEADER = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
  fill: { fgColor: { rgb: '7C3AED' } },
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
}

const S_BASE = {
  font: { sz: 10 },
  alignment: { vertical: 'top' as const, wrapText: true },
}

const S_CENTER = {
  font: { sz: 10 },
  alignment: { horizontal: 'center' as const, vertical: 'top' as const },
}

const S_URL = {
  font: { sz: 10, color: { rgb: '7C3AED' }, underline: true },
  alignment: { vertical: 'top' as const },
}

const S_SUM_HEADER = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
  fill: { fgColor: { rgb: '7C3AED' } },
  alignment: { horizontal: 'center' as const, vertical: 'center' as const },
}

const S_SUM_LABEL = {
  font: { bold: true, sz: 10 },
  fill: { fgColor: { rgb: 'EDE9FE' } },
  alignment: { horizontal: 'left' as const, vertical: 'center' as const },
}

const S_SUM_VALUE = {
  font: { sz: 10 },
  alignment: { horizontal: 'left' as const, vertical: 'center' as const, wrapText: true },
}

// ── 메인 내보내기 함수 ─────────────────────────────────────────

export function exportToExcel(options: ExportOptions): void {
  const {
    items,
    selectedCategories,
    selectedCountries,
    dateRange,
    customDateStart,
    customDateEnd,
    scoreRange,
  } = options

  const wb = XLSX.utils.book_new()

  // ── Sheet 1: 선택 기사 목록 ──────────────────────────────────

  const COLS = [
    'No', '스코어', '제목(한글)', '제목(원문)',
    '매체명', '국가', '게시일', 'URL', '스니펫', '분야', '매칭키워드',
  ]

  const ws1 = XLSX.utils.aoa_to_sheet([COLS]) // 헤더 행만 먼저

  // 헤더 스타일 적용
  COLS.forEach((_, c) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c })
    if (ws1[ref]) ws1[ref].s = S_HEADER
  })

  // 데이터 행 추가
  items.forEach((item, i) => {
    const score = Math.round(item.relevanceScore * 10)
    const { bg, fg } = scoreStyle(score)
    const { catNames, keywords } = matchCategories(item, selectedCategories)
    const countryName = COUNTRY_CONFIGS[item.country]?.nameKo ?? item.country.toUpperCase()
    const publishedAt = item.publishedAt
      ? new Date(item.publishedAt).toLocaleDateString('ko-KR', {
          year: 'numeric', month: '2-digit', day: '2-digit',
        })
      : '-'

    const r = i + 1
    const rowCells: { c: number; cell: XLSX.CellObject }[] = [
      { c: 0,  cell: { t: 'n', v: r,              s: S_CENTER } },
      { c: 1,  cell: { t: 'n', v: score,           s: { font: { bold: true, color: { rgb: fg }, sz: 11 }, fill: { fgColor: { rgb: bg } }, alignment: { horizontal: 'center' as const, vertical: 'top' as const } } } },
      { c: 2,  cell: { t: 's', v: item.titleKo || item.title, s: S_BASE } },
      { c: 3,  cell: { t: 's', v: item.title,      s: S_BASE } },
      { c: 4,  cell: { t: 's', v: item.source,     s: S_BASE } },
      { c: 5,  cell: { t: 's', v: countryName,     s: S_CENTER } },
      { c: 6,  cell: { t: 's', v: publishedAt,     s: S_CENTER } },
      { c: 7,  cell: { t: 's', v: item.link,       s: S_URL, l: { Target: item.link } } },
      { c: 8,  cell: { t: 's', v: item.snippet,    s: S_BASE } },
      { c: 9,  cell: { t: 's', v: catNames,        s: S_BASE } },
      { c: 10, cell: { t: 's', v: keywords,        s: S_BASE } },
    ]

    rowCells.forEach(({ c, cell }) => {
      ws1[XLSX.utils.encode_cell({ r, c })] = cell
    })
  })

  ws1['!ref'] = XLSX.utils.encode_range(
    { r: 0, c: 0 },
    { r: items.length, c: COLS.length - 1 }
  )

  ws1['!cols'] = [
    { wch: 5 },   // No
    { wch: 8 },   // 스코어
    { wch: 42 },  // 제목(한글)
    { wch: 42 },  // 제목(원문)
    { wch: 22 },  // 매체명
    { wch: 10 },  // 국가
    { wch: 14 },  // 게시일
    { wch: 55 },  // URL
    { wch: 55 },  // 스니펫
    { wch: 22 },  // 분야
    { wch: 28 },  // 매칭키워드
  ]

  ws1['!rows'] = [{ hpt: 20 }] // 헤더 행 높이

  XLSX.utils.book_append_sheet(wb, ws1, '선택 기사 목록')

  // ── Sheet 2: 검색 조건 요약 ──────────────────────────────────

  const now = new Date()
  const nowStr = now.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })

  const allKeywords = Array.from(
    new Set(selectedCategories.flatMap((c) => c.keywords.map((k) => k.term)))
  ).join(', ')

  const summaryRows: [string, string][] = [
    ['항목', '내용'],
    ['검색 분야',       selectedCategories.map((c) => c.name).join(', ') || '-'],
    ['검색 키워드',     allKeywords || '-'],
    ['검색 국가',       selectedCountries.map((c) => COUNTRY_CONFIGS[c]?.nameKo ?? c).join(', ')],
    ['검색 기간',       dateRangeLabel(dateRange, customDateStart, customDateEnd)],
    ['스코어 범위',     `${scoreRange[0]} ~ ${scoreRange[1]}`],
    ['내보내기 일시',   nowStr],
    ['총 선택 기사 수', `${items.length}개`],
  ]

  const ws2 = XLSX.utils.aoa_to_sheet([])

  summaryRows.forEach(([label, value], r) => {
    const isHeader = r === 0
    ws2[XLSX.utils.encode_cell({ r, c: 0 })] = {
      t: 's', v: label, s: isHeader ? S_SUM_HEADER : S_SUM_LABEL,
    }
    ws2[XLSX.utils.encode_cell({ r, c: 1 })] = {
      t: 's', v: value, s: isHeader ? S_SUM_HEADER : S_SUM_VALUE,
    }
  })

  ws2['!ref'] = XLSX.utils.encode_range(
    { r: 0, c: 0 },
    { r: summaryRows.length - 1, c: 1 }
  )
  ws2['!cols'] = [{ wch: 20 }, { wch: 60 }]
  ws2['!rows'] = [{ hpt: 20 }]

  XLSX.utils.book_append_sheet(wb, ws2, '검색 조건 요약')

  // ── 다운로드 ──────────────────────────────────────────────────

  const ts = now.toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15)
  XLSX.writeFile(wb, `biohealth_news_${ts}.xlsx`)
}
