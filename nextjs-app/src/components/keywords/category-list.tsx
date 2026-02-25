'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CategoryDialog } from './category-dialog'
import { getColor } from '@/lib/category-colors'
import { cn } from '@/lib/utils'
import type { CategoryWithKeywords } from '@/types'

interface CategoryListProps {
  categories: CategoryWithKeywords[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string, color: string) => Promise<void>
  onUpdate: (id: string, name: string, color: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function CategoryList({
  categories,
  selectedId,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
}: CategoryListProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CategoryWithKeywords | undefined>()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openCreate() {
    setEditTarget(undefined)
    setDialogOpen(true)
  }

  function openEdit(cat: CategoryWithKeywords, e: React.MouseEvent) {
    e.stopPropagation()
    setEditTarget(cat)
    setDialogOpen(true)
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (pendingDeleteId === id) {
      // 두 번째 클릭 → 실제 삭제
      setDeletingId(id)
      await onDelete(id)
      setDeletingId(null)
      setPendingDeleteId(null)
    } else {
      setPendingDeleteId(id)
    }
  }

  function handleDialogSubmit(name: string, color: string) {
    if (editTarget) {
      return onUpdate(editTarget.id, name, color)
    }
    return onCreate(name, color)
  }

  return (
    <div className="w-72 shrink-0 flex flex-col border-r border-border bg-card">
      {/* 헤더 */}
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm text-foreground">검색 분야</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{categories.length}개 분야</p>
        </div>
        <Button size="sm" onClick={openCreate} className="h-8 gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          분야 추가
        </Button>
      </div>

      {/* 분야 목록 */}
      <div className="flex-1 overflow-y-auto py-2">
        {categories.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">분야가 없습니다.</p>
            <p className="text-xs text-muted-foreground mt-1">분야를 추가해 키워드를 관리하세요.</p>
          </div>
        ) : (
          categories.map((cat) => {
            const c = getColor(cat.color)
            const isSelected = selectedId === cat.id
            const isPendingDelete = pendingDeleteId === cat.id

            return (
              <div
                key={cat.id}
                onClick={() => {
                  onSelect(cat.id)
                  setPendingDeleteId(null)
                }}
                className={cn(
                  'group relative flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150',
                  isSelected
                    ? 'bg-accent'
                    : 'hover:bg-accent/50'
                )}
              >
                {/* 색상 dot */}
                <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', c.dot)} />

                {/* 이름 */}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-sm font-medium truncate',
                      isSelected ? 'text-primary' : 'text-foreground'
                    )}
                  >
                    {cat.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    키워드 {cat.keywords.length}개
                  </p>
                </div>

                {/* 액션 버튼 — 호버 시 표시 */}
                {isPendingDelete ? (
                  // 삭제 확인
                  <div
                    className="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-xs text-destructive font-medium flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      삭제?
                    </span>
                    <button
                      onClick={(e) => handleDelete(cat.id, e)}
                      disabled={deletingId === cat.id}
                      className="text-xs px-1.5 py-0.5 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors"
                    >
                      확인
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setPendingDeleteId(null)
                      }}
                      className="text-xs px-1.5 py-0.5 border border-border rounded hover:bg-accent transition-colors"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => openEdit(cat, e)}
                      className="p-1.5 rounded hover:bg-background hover:text-primary transition-colors"
                      title="수정"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(cat.id, e)}
                      className="p-1.5 rounded hover:bg-background hover:text-destructive transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editTarget}
        onSubmit={handleDialogSubmit}
      />
    </div>
  )
}
