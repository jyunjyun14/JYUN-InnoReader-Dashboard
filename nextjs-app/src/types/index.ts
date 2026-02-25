export type UserRole = 'USER' | 'ADMIN'

// ── Keywords ──────────────────────────────────────────────────

export interface Keyword {
  id: string
  categoryId: string
  term: string
  createdAt: Date
}

export interface CategoryWithKeywords {
  id: string
  userId: string
  name: string
  color: string
  createdAt: Date
  updatedAt: Date
  keywords: Keyword[]
}

export interface User {
  id: string
  name: string | null
  email: string
  image: string | null
  role: UserRole
  createdAt: Date
  updatedAt: Date
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface NavItem {
  title: string
  href: string
  icon?: React.ComponentType<{ className?: string }>
  badge?: string
}
