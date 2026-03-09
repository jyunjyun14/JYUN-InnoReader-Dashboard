import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAdminUserId } from '@/lib/admin'
import { KeywordsClient } from '@/components/keywords/keywords-client'

export const metadata: Metadata = {
  title: '키워드 관리',
}

export default async function KeywordsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const adminId = await getAdminUserId()
  const categories = adminId
    ? await prisma.category.findMany({
        where: { userId: adminId },
        include: { keywords: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      })
    : []

  const isAdmin = session.user.role === 'ADMIN'

  return (
    <div className="h-full flex flex-col gap-4 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">키워드 관리</h2>
        <p className="text-muted-foreground mt-1">
          뉴스 검색에 사용할 분야와 키워드를 관리합니다.
          {!isAdmin && (
            <span className="ml-2 text-xs text-amber-600 font-medium">
              (관리자만 수정 가능 — 읽기 전용)
            </span>
          )}
        </p>
      </div>

      {/* 2-panel 레이아웃: 부모의 남은 높이를 채움 */}
      <div className="flex-1 min-h-0">
        <KeywordsClient initialCategories={categories} isAdmin={isAdmin} />
      </div>
    </div>
  )
}
