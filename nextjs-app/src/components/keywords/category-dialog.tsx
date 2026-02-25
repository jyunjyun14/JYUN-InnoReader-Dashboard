'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CATEGORY_COLORS } from '@/lib/category-colors'
import { cn } from '@/lib/utils'
import type { CategoryWithKeywords } from '@/types'

interface CategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // create 모드: category = undefined, edit 모드: category 전달
  category?: CategoryWithKeywords
  onSubmit: (name: string, color: string) => Promise<void>
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  onSubmit,
}: CategoryDialogProps) {
  const isEdit = !!category
  const [name, setName] = useState('')
  const [color, setColor] = useState('violet')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // dialog가 열릴 때 초기값 설정
  useEffect(() => {
    if (open) {
      setName(category?.name ?? '')
      setColor(category?.color ?? 'violet')
      setError('')
    }
  }, [open, category])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('분야 이름을 입력해주세요.')
      return
    }
    setIsLoading(true)
    setError('')
    try {
      await onSubmit(name.trim(), color)
      onOpenChange(false)
    } catch {
      setError('저장에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? '분야 수정' : '새 분야 추가'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 이름 */}
          <div className="space-y-2">
            <Label htmlFor="category-name">분야 이름</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 의료 AI, 디지털 치료제"
              autoFocus
              disabled={isLoading}
            />
          </div>

          {/* 색상 선택 */}
          <div className="space-y-2">
            <Label>색상 태그</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  title={c.label}
                  className={cn(
                    'w-8 h-8 rounded-full transition-all duration-150',
                    c.dot,
                    color === c.id
                      ? 'ring-2 ring-offset-2 ring-foreground/30 scale-110'
                      : 'opacity-60 hover:opacity-100 hover:scale-105'
                  )}
                />
              ))}
            </div>
            {/* 선택된 색상 미리보기 */}
            {(() => {
              const selected = CATEGORY_COLORS.find((c) => c.id === color)
              return selected ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border',
                    selected.badge
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full', selected.dot)} />
                  {name || '미리보기'}
                </span>
              ) : null
            })()}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              취소
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? '수정' : '추가'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
