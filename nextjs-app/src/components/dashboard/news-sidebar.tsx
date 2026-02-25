'use client'

import Link from 'next/link'
import { Search, Settings, FileSpreadsheet, Newspaper, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { getColor } from '@/lib/category-colors'
import { cn } from '@/lib/utils'

interface Keyword { id: string; term: string }
interface Category { id: string; name: string; color: string; keywords: Keyword[] }

interface NewsSidebarProps {
  categories: Category[]
  selectedCategoryIds: string[]
  onToggleCategory: (id: string) => void
  onSearch: () => void
  isLoading: boolean
  checkedCount: number
  onExportExcel: () => void
  /** 모바일: 사이드바 열림 여부 */
  mobileOpen?: boolean
  /** 모바일: 사이드바 닫기 콜백 */
  onMobileClose?: () => void
}

export function NewsSidebar({
  categories,
  selectedCategoryIds,
  onToggleCategory,
  onSearch,
  isLoading,
  checkedCount,
  onExportExcel,
  mobileOpen = false,
  onMobileClose,
}: NewsSidebarProps) {
  return (
    <>
      {/* 모바일 backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          // 데스크톱: 일반 사이드바
          'md:relative md:translate-x-0 md:w-60',
          // 모바일: 고정 드로어
          'fixed inset-y-0 left-0 z-50 w-72',
          'transform transition-transform duration-300 ease-in-out md:transition-none',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'shrink-0 h-full flex flex-col border-r border-border bg-card overflow-y-auto'
        )}
        aria-label="뉴스 대시보드 사이드바"
      >
        {/* 헤더 */}
        <div className="px-4 py-4 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <h1 className="text-sm font-bold text-foreground">뉴스 대시보드</h1>
          </div>
          {/* 모바일 닫기 버튼 */}
          {onMobileClose && (
            <button
              onClick={onMobileClose}
              className="md:hidden p-1 rounded-md hover:bg-secondary text-muted-foreground"
              aria-label="사이드바 닫기"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Separator />

        {/* 분야 선택 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            분야 선택
          </p>

          {categories.length === 0 ? (
            <div className="text-xs text-muted-foreground px-1 py-2 leading-relaxed">
              분야가 없습니다.{' '}
              <Link href="/settings/keywords" className="text-primary hover:underline font-medium">
                키워드 설정
              </Link>
              에서 추가하세요.
            </div>
          ) : (
            <ul className="space-y-0.5" role="list">
              {categories.map((cat) => {
                const color = getColor(cat.color)
                const selected = selectedCategoryIds.includes(cat.id)
                return (
                  <li key={cat.id}>
                    <button
                      onClick={() => onToggleCategory(cat.id)}
                      aria-pressed={selected}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors text-sm',
                        selected
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-foreground hover:bg-secondary'
                      )}
                    >
                      {/* 체크 아이콘 */}
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                          selected
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-border'
                        )}
                        aria-hidden="true"
                      >
                        {selected && (
                          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 12 12">
                            <path
                              d="M2 6l3 3 5-5"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>

                      <span className={cn('w-2 h-2 rounded-full shrink-0', color.dot)} aria-hidden="true" />
                      <span className="flex-1 truncate">{cat.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0" aria-label={`${cat.keywords.length}개 키워드`}>
                        {cat.keywords.length}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <Separator />

        {/* 액션 버튼 */}
        <div className="px-3 py-3 space-y-2 shrink-0">
          <Button
            onClick={() => { onSearch(); onMobileClose?.() }}
            disabled={isLoading || selectedCategoryIds.length === 0}
            className="w-full h-9 text-sm gap-2"
            size="sm"
            aria-label={isLoading ? '검색 중' : '새 검색 실행'}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            {isLoading ? '검색 중...' : '새 검색 실행'}
          </Button>

          <Link href="/settings/keywords" className="block">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              키워드 설정
            </Button>
          </Link>
        </div>

        <Separator />

        {/* 엑셀 내보내기 */}
        <div className="px-3 py-3 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-9 text-sm gap-2 border-primary/30 hover:border-primary/60 hover:bg-primary/5"
            disabled={checkedCount === 0}
            onClick={onExportExcel}
            aria-label={checkedCount > 0 ? `${checkedCount}개 기사 엑셀로 내보내기` : '기사를 선택하면 내보낼 수 있습니다'}
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            엑셀로 내보내기
            {checkedCount > 0 && (
              <span className="ml-auto text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold">
                {checkedCount}
              </span>
            )}
          </Button>
          {checkedCount === 0 && (
            <p className="text-[11px] text-muted-foreground text-center mt-1.5">
              기사를 체크하면 내보낼 수 있어요
            </p>
          )}
        </div>
      </aside>
    </>
  )
}
