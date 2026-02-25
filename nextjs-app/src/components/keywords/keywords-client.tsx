'use client'

import { useState } from 'react'
import { CategoryList } from './category-list'
import { KeywordList } from './keyword-list'
import type { CategoryWithKeywords } from '@/types'

interface KeywordsClientProps {
  initialCategories: CategoryWithKeywords[]
}

export function KeywordsClient({ initialCategories }: KeywordsClientProps) {
  const [categories, setCategories] = useState<CategoryWithKeywords[]>(initialCategories)
  const [selectedId, setSelectedId] = useState<string | null>(
    initialCategories[0]?.id ?? null
  )

  const selectedCategory = categories.find((c) => c.id === selectedId) ?? null

  // ─── Category operations ──────────────────────────────────────

  async function handleCreateCategory(name: string, color: string) {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error ?? '분야 추가에 실패했습니다.')
    }
    const data = await res.json()
    setCategories((prev) => [...prev, data.category])
    setSelectedId(data.category.id)
  }

  async function handleUpdateCategory(id: string, name: string, color: string) {
    const res = await fetch(`/api/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error ?? '분야 수정에 실패했습니다.')
    }
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name, color } : c))
    )
  }

  async function handleDeleteCategory(id: string) {
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    if (!res.ok) return

    setCategories((prev) => prev.filter((c) => c.id !== id))
    if (selectedId === id) {
      const remaining = categories.filter((c) => c.id !== id)
      setSelectedId(remaining[0]?.id ?? null)
    }
  }

  // ─── Keyword operations ───────────────────────────────────────

  async function handleAddKeyword(categoryId: string, term: string): Promise<Response> {
    const res = await fetch(`/api/categories/${categoryId}/keywords`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term }),
    })
    if (res.ok) {
      const data = await res.json()
      setCategories((prev) =>
        prev.map((c) =>
          c.id === categoryId
            ? { ...c, keywords: [...c.keywords, data.keyword] }
            : c
        )
      )
    }
    return res
  }

  async function handleDeleteKeyword(keywordId: string, categoryId: string): Promise<Response> {
    const res = await fetch(`/api/keywords/${keywordId}`, { method: 'DELETE' })
    if (res.ok) {
      setCategories((prev) =>
        prev.map((c) =>
          c.id === categoryId
            ? { ...c, keywords: c.keywords.filter((k) => k.id !== keywordId) }
            : c
        )
      )
    }
    return res
  }

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-border shadow-sm bg-card">
      <CategoryList
        categories={categories}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={handleCreateCategory}
        onUpdate={handleUpdateCategory}
        onDelete={handleDeleteCategory}
      />
      <KeywordList
        category={selectedCategory}
        onAddKeyword={handleAddKeyword}
        onDeleteKeyword={handleDeleteKeyword}
      />
    </div>
  )
}
