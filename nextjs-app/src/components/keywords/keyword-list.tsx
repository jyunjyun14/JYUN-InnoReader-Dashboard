'use client'

import { useState, useRef } from 'react'
import { Plus, X, Loader2, Search, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { getColor } from '@/lib/category-colors'
import { cn } from '@/lib/utils'
import type { CategoryWithKeywords, Keyword } from '@/types'

interface KeywordListProps {
  category: CategoryWithKeywords | null
  onAddKeyword: (categoryId: string, term: string) => Promise<Response>
  onDeleteKeyword: (keywordId: string, categoryId: string) => Promise<Response>
}

export function KeywordList({ category, onAddKeyword, onDeleteKeyword }: KeywordListProps) {
  const [term, setTerm] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!category || !term.trim()) return

    setIsAdding(true)
    setAddError('')
    const res = await onAddKeyword(category.id, term.trim())

    if (!res.ok) {
      const data = await res.json()
      setAddError(data.error ?? '추가에 실패했습니다.')
    } else {
      setTerm('')
      inputRef.current?.focus()
    }
    setIsAdding(false)
  }

  async function handleDelete(keyword: Keyword) {
    if (!category) return
    setDeletingId(keyword.id)
    await onDeleteKeyword(keyword.id, category.id)
    setDeletingId(null)
  }

  // 빈 상태
  if (!category) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center mx-auto">
            <Tag className="w-7 h-7 text-primary/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            왼쪽에서 분야를 선택하세요
          </p>
          <p className="text-xs text-muted-foreground/60">
            분야를 선택하면 키워드를 관리할 수 있습니다
          </p>
        </div>
      </div>
    )
  }

  const colorConfig = getColor(category.color)

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border',
              colorConfig.badge
            )}
          >
            <span className={cn('w-2 h-2 rounded-full', colorConfig.dot)} />
            {category.name}
          </span>
          <span className="text-sm text-muted-foreground">
            {category.keywords.length}개 키워드
          </span>
        </div>

        {/* 키워드 추가 폼 */}
        <form onSubmit={handleAdd} className="mt-3 flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              value={term}
              onChange={(e) => {
                setTerm(e.target.value)
                setAddError('')
              }}
              placeholder="키워드 입력 (영문 권장, 예: digital health)"
              className="pl-9 text-sm"
              disabled={isAdding}
            />
          </div>
          <Button type="submit" disabled={isAdding || !term.trim()} className="gap-1.5 shrink-0">
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            추가
          </Button>
        </form>
        {addError && (
          <p className="text-xs text-destructive mt-1.5">{addError}</p>
        )}
      </div>

      {/* 키워드 목록 */}
      <div className="flex-1 overflow-y-auto p-6">
        {category.keywords.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-12 h-12 bg-accent/60 rounded-xl flex items-center justify-center">
              <Search className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">키워드가 없습니다</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                위 입력창에서 키워드를 추가하세요
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* 헤더 */}
            <div className="flex items-center gap-2 pb-1 mb-3 border-b border-border/50">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                키워드 목록
              </p>
              <span className="text-xs text-muted-foreground">
                ({category.keywords.length})
              </span>
            </div>

            {/* 키워드 아이템 */}
            {category.keywords.map((keyword) => (
              <div
                key={keyword.id}
                className="group flex items-center justify-between px-4 py-2.5 rounded-lg border border-border/50 bg-background hover:border-primary/20 hover:bg-accent/30 transition-all duration-150"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn('w-1.5 h-1.5 rounded-full shrink-0', colorConfig.dot)}
                  />
                  <span className="text-sm text-foreground font-mono truncate">
                    {keyword.term}
                  </span>
                </div>

                <button
                  onClick={() => handleDelete(keyword)}
                  disabled={deletingId === keyword.id}
                  className="ml-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all duration-150 shrink-0"
                  title="키워드 삭제"
                >
                  {deletingId === keyword.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
