import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { UsersClient } from '@/components/admin/users-client'

export const metadata: Metadata = { title: '사용자 관리' }

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      _count: { select: { categories: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">사용자 관리</h2>
        <p className="text-muted-foreground mt-1">
          전체 사용자 목록, 역할 변경, 비밀번호 초기화, 계정 삭제를 처리합니다.
        </p>
      </div>
      <UsersClient initialUsers={users} />
    </div>
  )
}
