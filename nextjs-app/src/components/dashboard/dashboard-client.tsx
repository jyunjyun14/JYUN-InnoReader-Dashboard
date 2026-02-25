'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, FileSpreadsheet, Menu, RefreshCw, Search, ShieldAlert, Square, SquareCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NewsSidebar } from './news-sidebar'
import { FilterBar, type SortBy } from './filter-bar'
import { NewsCard } from './news-card'
import { NewsSkeletonList } from './news-skeleton'
import { Pagination } from './pagination'
import { useTranslateAll } from '@/components/news/translation-toggle'
import type { NewsItem } from '@/types/news'
import { exportToExcel } from '@/lib/excel-export'

// ── 타입 ───────────────────────────────────────────────────────
interface Keyword { id: string; term: string }
interface Category { id: string; name: string; color: string; keywords: Keyword[] }
interface DashboardClientProps { initialCategories: Category[] }

type ErrorType = 'quota' | 'network' | 'general'

// ── 상수 ───────────────────────────────────────────────────────
const ITEMS_PER_PAGE = 20

const DATE_RANGE_API: Record<string, string> = {
  d1: 'd1', d3: 'd3', d7: 'd7',
  w1: 'w1', m1: 'm1', m3: 'm3',
  m6: 'm6', y1: 'y1',
  custom: 'y1', // 최대 범위 fetch → 클라이언트 필터링
}

// ── 유틸 ───────────────────────────────────────────────────────
function isKorean(text: string) {
  return /[\uAC00-\uD7A3]/.test(text)
}

// ── 에러 타입 판별 ─────────────────────────────────────────────
async function classifyError(res: Response): Promise<ErrorType> {
  const body = await res.json().catch(() => ({}))
  const msg = String(body?.error ?? '').toLowerCase()
  if (res.status === 429 || msg.includes('quota') || msg.includes('할당량')) return 'quota'
  if (res.status >= 500) return 'network'
  return 'general'
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export function DashboardClient({ initialCategories }: DashboardClientProps) {
  const searchParams = useSearchParams()
  const allIds = useMemo(() => initialCategories.map((c) => c.id), [initialCategories])

  // ── URL params에서 초기값 읽기 ─────────────────────────────
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(() => {
    const v = searchParams.get('categories')
    if (!v) return allIds
    const ids = v.split(',').filter((id) => allIds.includes(id))
    return ids.length > 0 ? ids : allIds
  })

  const [selectedCountries, setSelectedCountries] = useState<string[]>(() => {
    const v = searchParams.get('countries')
    return v ? v.split(',').filter(Boolean) : ['us']
  })

  const [dateRange, setDateRange] = useState(() => searchParams.get('dateRange') ?? 'm1')
  const [customDateStart, setCustomDateStart] = useState(() => searchParams.get('dateStart') ?? '')
  const [customDateEnd, setCustomDateEnd] = useState(() => searchParams.get('dateEnd') ?? '')

  const [scoreRange, setScoreRange] = useState<[number, number]>(() => [
    Number(searchParams.get('scoreMin') ?? 0),
    Number(searchParams.get('scoreMax') ?? 100),
  ])

  const [sortBy, setSortBy] = useState<SortBy>(
    () => (searchParams.get('sort') as SortBy) ?? 'score'
  )

  const [currentPage, setCurrentPage] = useState(() =>
    Math.max(1, Number(searchParams.get('page') ?? 1))
  )

  // ── 검색 결과 상태 ─────────────────────────────────────────
  const [results, setResults] = useState<NewsItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<ErrorType | null>(null)
  const [checkedUrls, setCheckedUrls] = useState<Set<string>>(new Set())
  const [hasSearched, setHasSearched] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // ── 자동 번역 훅 ───────────────────────────────────────────
  // onComplete: setResults는 안정적(stable)이므로 deps []로 고정
  const onTranslationComplete = useCallback((map: Record<string, string>) => {
    setResults((prev) =>
      prev.map((item) => ({
        ...item,
        titleKo: map[item.title] || item.titleKo,
      }))
    )
  }, [])

  // useTranslateAll의 options 객체를 안정적으로 유지
  const translateOptions = useMemo(
    () => ({ onComplete: onTranslationComplete }),
    [onTranslationComplete]
  )
  const { translateAll, isTranslating, progress } = useTranslateAll(translateOptions)

  // ── 검색 함수 ──────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const cats = initialCategories.filter((c) => selectedCategoryIds.includes(c.id))
    if (cats.length === 0 || selectedCountries.length === 0) return

    const keywords = Array.from(new Set(cats.flatMap((c) => c.keywords.map((k) => k.term))))
    if (keywords.length === 0) {
      setHasSearched(true)
      setResults([])
      return
    }

    // 공백 포함 키워드는 따옴표로 묶어 정확한 구문 검색 → 무관 기사 차단
    const query = keywords
      .map((k) => (k.includes(' ') ? `"${k}"` : k))
      .join(' OR ')
      .slice(0, 500) // NewsAPI 최대 쿼리 길이
    const drApi = DATE_RANGE_API[dateRange] ?? 'm1'

    setIsLoading(true)
    setError(null)
    setHasSearched(true)

    try {
      // 선택 국가별 병렬 fetch
      const settled = await Promise.allSettled(
        selectedCountries.map((country) =>
          fetch(
            `/api/news/search?${new URLSearchParams({ query, country, dateRange: drApi })}`
          ).then(async (r) => {
            if (!r.ok) {
              const type = await classifyError(r)
              throw Object.assign(new Error(type), { errorType: type })
            }
            return r.json()
          })
        )
      )

      // 결과 병합 + URL 기준 중복 제거
      const merged: NewsItem[] = []
      const seen = new Set<string>()
      let firstError: ErrorType | null = null

      for (const res of settled) {
        if (res.status === 'fulfilled') {
          for (const item of (res.value?.items ?? []) as NewsItem[]) {
            if (!seen.has(item.link)) {
              seen.add(item.link)
              merged.push(item)
            }
          }
        } else {
          // 부분 실패는 기록만 (성공 결과가 있으면 표시)
          if (!firstError)
            firstError = (res.reason as { errorType?: ErrorType })?.errorType ?? 'general'
        }
      }

      setResults(merged)
      setCurrentPage(1)
      setCheckedUrls(new Set())

      // 결과가 없을 때만 에러 배너 표시
      if (merged.length === 0 && firstError) {
        setError(firstError)
      } else if (merged.length > 0) {
        toast.success(`${merged.length.toLocaleString()}개 기사를 찾았습니다`)
      } else {
        toast.info('조건에 맞는 기사가 없습니다. 키워드나 기간을 조정해보세요.')
      }

      // ── 자동 번역: 비한국어 제목 ──────────────────────────
      const toTranslate = merged
        .filter((it) => !it.titleKo && !isKorean(it.title))
        .map((it) => it.title)
      if (toTranslate.length > 0) translateAll(toTranslate)
    } catch {
      setError('general')
      toast.error('검색 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }, [initialCategories, selectedCategoryIds, selectedCountries, dateRange, translateAll])

  // ── 초기 자동 검색 ────────────────────────────────────────
  useEffect(() => {
    if (initialCategories.length > 0) handleSearch()
    // 마운트 시 1회만 실행 (의존성 배열 비움)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── URL 동기화 (필터 변경 시 → 새로고침 후 복원) ───────────
  useEffect(() => {
    // 첫 검색 전에는 URL 쓰지 않음
    if (!hasSearched) return

    const sp = new URLSearchParams()

    // 기본값과 다를 때만 저장 (URL 간결하게 유지)
    if (selectedCategoryIds.length > 0 && selectedCategoryIds.length < allIds.length)
      sp.set('categories', selectedCategoryIds.join(','))
    if (selectedCountries.join(',') !== 'us')
      sp.set('countries', selectedCountries.join(','))
    if (dateRange !== 'm1') sp.set('dateRange', dateRange)
    if (dateRange === 'custom') {
      if (customDateStart) sp.set('dateStart', customDateStart)
      if (customDateEnd) sp.set('dateEnd', customDateEnd)
    }
    if (scoreRange[0] !== 0) sp.set('scoreMin', String(scoreRange[0]))
    if (scoreRange[1] !== 100) sp.set('scoreMax', String(scoreRange[1]))
    if (sortBy !== 'score') sp.set('sort', sortBy)
    if (currentPage > 1) sp.set('page', String(currentPage))

    const qs = sp.toString()
    history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }, [
    hasSearched,
    selectedCategoryIds,
    allIds,
    selectedCountries,
    dateRange,
    customDateStart,
    customDateEnd,
    scoreRange,
    sortBy,
    currentPage,
  ])

  // ── 클라이언트 필터 + 정렬 ────────────────────────────────
  const filteredSorted = useMemo(() => {
    let items = results

    // 국가 필터 (실시간 — 재검색 없이 기존 결과 내 필터링)
    if (selectedCountries.length > 0)
      items = items.filter((it) => selectedCountries.includes(it.country))

    // 스코어 필터
    items = items.filter(
      (it) =>
        it.relevanceScore * 10 >= scoreRange[0] && it.relevanceScore * 10 <= scoreRange[1]
    )

    // 커스텀 날짜 필터
    if (dateRange === 'custom' && customDateStart && customDateEnd) {
      const s = new Date(customDateStart).getTime()
      const e = new Date(customDateEnd + 'T23:59:59').getTime()
      items = items.filter((it) => {
        if (!it.publishedAt) return false
        const t = new Date(it.publishedAt).getTime()
        return t >= s && t <= e
      })
    }

    // 정렬
    return [...items].sort((a, b) => {
      if (sortBy === 'score') return b.relevanceScore - a.relevanceScore
      if (sortBy === 'date') {
        const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
        const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
        return tb - ta
      }
      return a.source.localeCompare(b.source)
    })
  }, [results, selectedCountries, scoreRange, dateRange, customDateStart, customDateEnd, sortBy])

  // ── 히스토그램·퍼센타일용 전체 스코어 배열 (0-100) ──────────
  const allScores = useMemo(
    () => results.map((it) => Math.round(it.relevanceScore * 10)),
    [results]
  )

  // ── 페이지네이션 ──────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / ITEMS_PER_PAGE))
  const safePage = Math.min(Math.max(1, currentPage), totalPages)
  const pageItems = filteredSorted.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  )

  function handlePageChange(p: number) {
    setCurrentPage(p)
    // 목록 스크롤 맨 위로
    document.querySelector('.news-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCheckedChange(url: string, v: boolean) {
    setCheckedUrls((prev) => {
      const next = new Set(prev)
      v ? next.add(url) : next.delete(url)
      return next
    })
  }

  function handleToggleCategory(id: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    )
  }

  function handleSelectAll() {
    setCheckedUrls(new Set(filteredSorted.map((it) => it.link)))
  }

  function handleDeselectAll() {
    setCheckedUrls(new Set())
  }

  function handleExportExcel() {
    const sel = filteredSorted.filter((it) => checkedUrls.has(it.link))
    if (sel.length === 0) return
    const selectedCategories = initialCategories.filter((c) =>
      selectedCategoryIds.includes(c.id)
    )
    const exportPromise = new Promise<number>((resolve, reject) => {
      setTimeout(() => {
        try {
          exportToExcel({
            items: sel,
            selectedCategories,
            selectedCountries,
            dateRange,
            customDateStart,
            customDateEnd,
            scoreRange,
          })
          resolve(sel.length)
        } catch {
          reject(new Error('내보내기 실패'))
        }
      }, 0)
    })
    toast.promise(exportPromise, {
      loading: '엑셀 파일 생성 중...',
      success: (count) => `${count}개 기사가 엑셀로 저장되었습니다`,
      error: '내보내기 중 오류가 발생했습니다',
    })
  }

  // ── 렌더 ─────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden">
      {/* 왼쪽 사이드바 */}
      <NewsSidebar
        categories={initialCategories}
        selectedCategoryIds={selectedCategoryIds}
        onToggleCategory={handleToggleCategory}
        onSearch={handleSearch}
        isLoading={isLoading}
        checkedCount={checkedUrls.size}
        onExportExcel={handleExportExcel}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* 오른쪽 메인 */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* 모바일 상단 바 */}
        <div className="md:hidden shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="메뉴 열기"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-foreground">뉴스 대시보드</span>
          {hasSearched && !isLoading && (
            <span className="ml-auto text-xs text-muted-foreground">
              {filteredSorted.length.toLocaleString()}개
            </span>
          )}
        </div>

        {/* 필터 바 */}
        <FilterBar
          selectedCountries={selectedCountries}
          onCountriesChange={setSelectedCountries}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          customDateStart={customDateStart}
          onCustomDateStartChange={setCustomDateStart}
          customDateEnd={customDateEnd}
          onCustomDateEndChange={setCustomDateEnd}
          scoreRange={scoreRange}
          onScoreRangeChange={setScoreRange}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          allScores={allScores}
        />

        {/* 번역 진행 표시 */}
        {isTranslating && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-primary/5 border-b border-border text-xs text-muted-foreground">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span>제목 번역 중... {progress}%</span>
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* 선택 컨트롤 바 */}
        {hasSearched && !isLoading && filteredSorted.length > 0 && (
          <SelectionBar
            total={filteredSorted.length}
            checked={checkedUrls.size}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onExportExcel={handleExportExcel}
          />
        )}

        {/* 기사 목록 */}
        <div className="news-scroll flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <NewsSkeletonList />
          ) : error ? (
            <ErrorBanner type={error} onRetry={handleSearch} />
          ) : !hasSearched ? (
            <Placeholder type="not-searched" />
          ) : initialCategories.length === 0 ? (
            <Placeholder type="no-categories" />
          ) : filteredSorted.length === 0 ? (
            <Placeholder type="no-results" />
          ) : (
            <div className="max-w-4xl">
              {/* 결과 수 표시 */}
              <p className="text-xs text-muted-foreground mb-3">
                <span className="font-semibold text-foreground">
                  {filteredSorted.length.toLocaleString()}
                </span>
                개 기사
                {results.length !== filteredSorted.length && (
                  <span className="ml-1">
                    (전체 {results.length.toLocaleString()}개 중 필터링)
                  </span>
                )}
              </p>

              <div className="space-y-3">
                {pageItems.map((item) => (
                  <NewsCard
                    key={item.link}
                    item={item}
                    checked={checkedUrls.has(item.link)}
                    onCheckedChange={handleCheckedChange}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 페이지네이션 */}
        {!isLoading && !error && filteredSorted.length > ITEMS_PER_PAGE && (
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={filteredSorted.length}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    </div>
  )
}

// ── 에러 배너 ─────────────────────────────────────────────────
function ErrorBanner({ type, onRetry }: { type: ErrorType; onRetry: () => void }) {
  const config = {
    quota: {
      icon: <ShieldAlert className="h-10 w-10 text-amber-500" />,
      title: 'API 할당량 초과',
      desc: '일일 검색 할당량을 초과했습니다. 내일 다시 시도하거나 API 키를 확인하세요.',
    },
    network: {
      icon: <AlertCircle className="h-10 w-10 text-destructive" />,
      title: '서버 오류',
      desc: '서버에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    },
    general: {
      icon: <AlertCircle className="h-10 w-10 text-destructive" />,
      title: '검색 오류',
      desc: '검색 중 오류가 발생했습니다. 다시 시도해주세요.',
    },
  }[type]

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-center">
      {config.icon}
      <div>
        <p className="font-semibold text-foreground">{config.title}</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{config.desc}</p>
      </div>
      <Button onClick={onRetry} variant="outline" size="sm" className="gap-2">
        <RefreshCw className="h-4 w-4" />
        다시 시도
      </Button>
    </div>
  )
}

// ── 선택 컨트롤 바 ────────────────────────────────────────────
function SelectionBar({
  total,
  checked,
  onSelectAll,
  onDeselectAll,
  onExportExcel,
}: {
  total: number
  checked: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onExportExcel: () => void
}) {
  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 bg-secondary/40 border-b border-border text-xs">
      <button
        onClick={onSelectAll}
        className="flex items-center gap-1 text-primary hover:underline font-medium"
      >
        <SquareCheck className="h-3.5 w-3.5" />
        전체 선택
      </button>
      <span className="text-muted-foreground">·</span>
      <button
        onClick={onDeselectAll}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
      >
        <Square className="h-3.5 w-3.5" />
        전체 해제
      </button>

      {checked > 0 && (
        <span className="font-semibold text-primary ml-1">
          {checked.toLocaleString()}개 기사 선택됨
        </span>
      )}
      {checked === 0 && (
        <span className="text-muted-foreground ml-1">
          총 {total.toLocaleString()}개
        </span>
      )}

      <button
        onClick={onExportExcel}
        disabled={checked === 0}
        className="ml-auto flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        엑셀로 내보내기
        {checked > 0 && (
          <span className="bg-white/20 text-white px-1.5 py-0.5 rounded-full font-bold">
            {checked}
          </span>
        )}
      </button>
    </div>
  )
}

// ── 빈 상태 플레이스홀더 ───────────────────────────────────────
function Placeholder({ type }: { type: 'no-categories' | 'not-searched' | 'no-results' }) {
  if (type === 'no-categories') {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-foreground">분야와 키워드를 먼저 설정해주세요</p>
          <p className="text-sm text-muted-foreground mt-1">관심 분야의 키워드를 등록하면 맞춤 뉴스를 검색할 수 있습니다</p>
        </div>
        <Link
          href="/settings/keywords"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          키워드 설정 바로가기 →
        </Link>
      </div>
    )
  }

  if (type === 'not-searched') {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
          <Search className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
        </div>
        <div>
          <p className="font-semibold text-foreground">검색을 시작해보세요</p>
          <p className="text-sm text-muted-foreground mt-1">
            왼쪽에서 분야를 선택하고 <span className="font-medium text-primary">새 검색 실행</span>을 클릭하세요
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-center px-6">
      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
        <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803zM13.5 10.5h-6" />
        </svg>
      </div>
      <div>
        <p className="font-semibold text-foreground">조건에 맞는 기사가 없습니다</p>
        <p className="text-sm text-muted-foreground mt-1">키워드, 기간 또는 스코어 범위를 조정해보세요</p>
      </div>
    </div>
  )
}
