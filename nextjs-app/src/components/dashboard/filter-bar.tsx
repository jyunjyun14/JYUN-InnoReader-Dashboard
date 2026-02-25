'use client'

import { useState } from 'react'
import { ChevronDown, Globe, SlidersHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { COUNTRY_OPTIONS, DATE_RANGE_OPTIONS } from '@/types/news'
import { cn } from '@/lib/utils'

export type SortBy = 'score' | 'date' | 'source'

interface FilterBarProps {
  selectedCountries: string[]
  onCountriesChange: (codes: string[]) => void
  dateRange: string
  onDateRangeChange: (v: string) => void
  customDateStart: string
  onCustomDateStartChange: (v: string) => void
  customDateEnd: string
  onCustomDateEndChange: (v: string) => void
  scoreRange: [number, number]
  onScoreRangeChange: (v: [number, number]) => void
  sortBy: SortBy
  onSortByChange: (v: SortBy) => void
  /** 현재 검색 결과의 스코어 배열 (0-100). 히스토그램·퍼센타일 계산에 사용 */
  allScores: number[]
}

const REGION_ORDER = ['영미권', '아시아', '중동', '유럽']

// ── 퍼센타일 계산 ─────────────────────────────────────────────
/**
 * 내림차순 정렬 후 상위 topPct%에 해당하는 최솟값을 step=5 단위로 내림 반환
 * 예) top 10% → 상위 10% 기사가 가지는 최솟값
 */
function topPercentileMin(scores: number[], topPct: number): number {
  if (scores.length === 0) return 0
  const sorted = [...scores].sort((a, b) => b - a) // 내림차순
  const idx = Math.floor((sorted.length * topPct) / 100)
  const v = sorted[Math.min(idx, sorted.length - 1)]
  return Math.floor(v / 5) * 5 // step=5 단위로 내림 (inclusive)
}

// ── 이중 범위 슬라이더 ────────────────────────────────────────
/**
 * 두 개의 투명 <input type="range">를 겹쳐 이중 썸 슬라이더 구현.
 * 시각적 썸은 별도 div로 렌더링.
 *
 * 썸 중심 위치 공식: calc(val/100 * (100% - 16px) + 8px)
 *   - val=0  → 8px (트랙 왼쪽 끝)
 *   - val=50 → 50% (트랙 중앙)
 *   - val=100 → calc(100% - 8px) (트랙 오른쪽 끝)
 */
function ScoreRangeSlider({
  range,
  onChange,
}: {
  range: [number, number]
  onChange: (v: [number, number]) => void
}) {
  const [min, max] = range

  function thumbLeft(val: number) {
    return `calc(${val / 100} * (100% - 16px) + 8px)`
  }

  return (
    <div className="relative h-6 flex items-center">
      {/* 배경 트랙 */}
      <div className="absolute inset-x-0 h-1.5 rounded-full bg-secondary" style={{ top: '50%', transform: 'translateY(-50%)' }} />
      {/* 선택 구간 강조 */}
      <div
        className="absolute h-1.5 rounded-full bg-violet-500 transition-all duration-100"
        style={{
          left: thumbLeft(min),
          right: `calc(${(100 - max) / 100} * (100% - 16px) + 8px)`,
          top: '50%',
          transform: 'translateY(-50%)',
        }}
      />

      {/* min 입력 (투명) */}
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={min}
        onChange={(e) =>
          onChange([Math.min(Number(e.target.value), max - 5), max])
        }
        className="absolute inset-0 w-full h-full cursor-pointer opacity-0 m-0"
        style={{ zIndex: min > 90 ? 5 : 3 }}
        aria-label="최솟값"
      />
      {/* max 입력 (투명) */}
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={max}
        onChange={(e) =>
          onChange([min, Math.max(Number(e.target.value), min + 5)])
        }
        className="absolute inset-0 w-full h-full cursor-pointer opacity-0 m-0"
        style={{ zIndex: min > 90 ? 3 : 5 }}
        aria-label="최댓값"
      />

      {/* 시각적 썸 (min) */}
      <div
        className="absolute w-4 h-4 rounded-full bg-white border-2 border-violet-600 shadow-sm pointer-events-none"
        style={{ left: thumbLeft(min), top: '50%', transform: 'translate(-50%, -50%)' }}
      />
      {/* 시각적 썸 (max) */}
      <div
        className="absolute w-4 h-4 rounded-full bg-white border-2 border-violet-600 shadow-sm pointer-events-none"
        style={{ left: thumbLeft(max), top: '50%', transform: 'translate(-50%, -50%)' }}
      />
    </div>
  )
}

// ── 스코어 분포 히스토그램 ────────────────────────────────────
/**
 * 10개 bin(0-9, 10-19, ..., 90-100)으로 스코어 분포를 시각화.
 * 선택 범위(range) 안의 bin은 보라색, 밖은 회색.
 */
function ScoreHistogram({
  allScores,
  range,
}: {
  allScores: number[]
  range: [number, number]
}) {
  const bins = Array<number>(10).fill(0)
  for (const s of allScores) {
    bins[Math.min(9, Math.floor(s / 10))]++
  }
  const maxCount = Math.max(1, ...bins)

  return (
    <div className="mt-2.5">
      <div className="flex items-end gap-px h-10" role="img" aria-label="스코어 분포 그래프">
        {bins.map((count, i) => {
          // bin i: 점수 [i*10, (i+1)*10) — range 와 겹치면 강조
          const inRange = (i + 1) * 10 > range[0] && i * 10 <= range[1]
          const heightPct = Math.max(8, Math.round((count / maxCount) * 100))
          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end"
              title={`${i * 10}~${(i + 1) * 10}점: ${count}개`}
            >
              <div
                className={cn(
                  'w-full rounded-t-sm transition-colors duration-200',
                  inRange ? 'bg-violet-400' : 'bg-gray-200'
                )}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          )
        })}
      </div>
      {/* 눈금 레이블 */}
      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5 px-px">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export function FilterBar({
  selectedCountries,
  onCountriesChange,
  dateRange,
  onDateRangeChange,
  customDateStart,
  onCustomDateStartChange,
  customDateEnd,
  onCustomDateEndChange,
  scoreRange,
  onScoreRangeChange,
  sortBy,
  onSortByChange,
  allScores,
}: FilterBarProps) {
  const [scoreOpen, setScoreOpen] = useState(false)

  // 국가 토글
  function toggleCountry(code: string) {
    onCountriesChange(
      selectedCountries.includes(code)
        ? selectedCountries.filter((c) => c !== code)
        : [...selectedCountries, code]
    )
  }

  const allCodes = COUNTRY_OPTIONS.map((c) => c.code)
  const allSelected = allCodes.every((c) => selectedCountries.includes(c))

  const countryLabel = () => {
    if (selectedCountries.length === 0) return '국가 없음'
    if (selectedCountries.length === 1) {
      const opt = COUNTRY_OPTIONS.find((c) => c.code === selectedCountries[0])
      return opt ? `${opt.flag} ${opt.nameKo}` : selectedCountries[0].toUpperCase()
    }
    if (allSelected) return '전체 국가'
    return `${selectedCountries.length}개 국가`
  }

  const regionGroups = REGION_ORDER.map((region) => ({
    region,
    countries: COUNTRY_OPTIONS.filter((c) => c.region === region),
  }))

  // 퀵 필터 계산 (검색 결과 있을 때만 퍼센타일 계산)
  const top25min = allScores.length > 0 ? topPercentileMin(allScores, 25) : null
  const top10min = allScores.length > 0 ? topPercentileMin(allScores, 10) : null

  const QUICK_FILTERS: { label: string; range: [number, number] | null }[] = [
    { label: '전체',      range: [0, 100] },
    { label: '50점 이상', range: [50, 100] },
    { label: '상위 25%',  range: top25min !== null ? [top25min, 100] : null },
    { label: '상위 10%',  range: top10min !== null ? [top10min, 100] : null },
  ]

  const isDefaultRange = scoreRange[0] === 0 && scoreRange[1] === 100

  return (
    <div className="shrink-0 border-b border-border bg-card">
      {/* ── 메인 필터 행 ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">

        {/* 국가 선택 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-8 px-2.5 rounded border border-border bg-background text-sm flex items-center gap-1.5 hover:bg-secondary transition-colors">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              {countryLabel()}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-52" align="start">
            <DropdownMenuCheckboxItem
              checked={allSelected}
              onCheckedChange={(v) => onCountriesChange(v ? allCodes : [])}
              className="font-medium"
            >
              {allSelected ? '전체 해제' : '전체 선택'}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {regionGroups.map(({ region, countries }) => (
              <div key={region}>
                <DropdownMenuLabel className="text-xs text-muted-foreground py-1">
                  {region}
                </DropdownMenuLabel>
                {countries.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.code}
                    checked={selectedCountries.includes(c.code)}
                    onCheckedChange={() => toggleCountry(c.code)}
                  >
                    {c.flag} {c.nameKo}
                  </DropdownMenuCheckboxItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 기간 프리셋 버튼 */}
        <div className="flex gap-1 flex-wrap">
          {DATE_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onDateRangeChange(opt.value)}
              className={cn(
                'h-8 px-2.5 rounded text-xs font-medium transition-colors',
                dateRange === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              )}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => onDateRangeChange('custom')}
            className={cn(
              'h-8 px-2.5 rounded text-xs font-medium transition-colors',
              dateRange === 'custom'
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            )}
          >
            사용자 정의
          </button>
        </div>

        {/* 사용자 정의 날짜 */}
        {dateRange === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={customDateStart}
              onChange={(e) => onCustomDateStartChange(e.target.value)}
              className="h-8 px-2 rounded border border-border text-xs bg-background text-foreground"
            />
            <span className="text-xs text-muted-foreground">~</span>
            <input
              type="date"
              value={customDateEnd}
              onChange={(e) => onCustomDateEndChange(e.target.value)}
              className="h-8 px-2 rounded border border-border text-xs bg-background text-foreground"
            />
          </div>
        )}

        {/* 스코어 필터 토글 버튼 */}
        <button
          onClick={() => setScoreOpen((v) => !v)}
          aria-expanded={scoreOpen}
          className={cn(
            'h-8 px-2.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors',
            scoreOpen || !isDefaultRange
              ? 'bg-primary/10 text-primary border border-primary/30 font-semibold'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          스코어 {scoreRange[0]}~{scoreRange[1]}
          <ChevronDown
            className={cn(
              'h-3 w-3 opacity-60 transition-transform duration-200',
              scoreOpen && 'rotate-180'
            )}
          />
        </button>

        {/* 정렬 버튼 (우측) */}
        <div className="ml-auto flex gap-1">
          {(
            [
              ['score', '스코어순'],
              ['date', '날짜순'],
              ['source', '출처순'],
            ] as [SortBy, string][]
          ).map(([val, label]) => (
            <button
              key={val}
              onClick={() => onSortByChange(val)}
              className={cn(
                'h-8 px-2.5 rounded text-xs font-medium transition-colors',
                sortBy === val
                  ? 'bg-primary/15 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 스코어 패널 (접힘/펼침) ─────────────────────────── */}
      {scoreOpen && (
        <div className="px-4 py-3 border-t border-border bg-secondary/20 space-y-3">
          {/* 퀵 필터 버튼 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground shrink-0">퀵 필터</span>
            {QUICK_FILTERS.map(({ label, range }) => {
              const isActive =
                range !== null &&
                scoreRange[0] === range[0] &&
                scoreRange[1] === range[1]
              return (
                <button
                  key={label}
                  disabled={range === null}
                  onClick={() => range && onScoreRangeChange(range)}
                  title={
                    range !== null
                      ? `${range[0]}~${range[1]}점`
                      : '검색 후 사용 가능'
                  }
                  className={cn(
                    'h-6 px-2.5 rounded text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : range === null
                      ? 'bg-secondary text-muted-foreground opacity-50 cursor-not-allowed'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/60'
                  )}
                >
                  {label}
                  {range !== null && range[0] > 0 && !isActive && (
                    <span className="ml-1 opacity-60 font-normal">≥{range[0]}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* 이중 슬라이더 */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-muted-foreground">범위 설정</span>
              <span className="text-xs font-semibold text-foreground tabular-nums">
                {scoreRange[0]}점 ~ {scoreRange[1]}점
              </span>
            </div>
            <ScoreRangeSlider range={scoreRange} onChange={onScoreRangeChange} />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>0</span>
              <span>100</span>
            </div>
          </div>

          {/* 스코어 분포 히스토그램 */}
          {allScores.length > 0 ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                스코어 분포 ({allScores.length}개 기사)
              </p>
              <ScoreHistogram allScores={allScores} range={scoreRange} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-1">
              검색 후 스코어 분포가 표시됩니다
            </p>
          )}
        </div>
      )}
    </div>
  )
}
