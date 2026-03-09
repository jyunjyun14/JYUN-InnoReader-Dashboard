import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DashboardClient } from '@/components/dashboard/dashboard-client'
import { NewsSkeletonList } from '@/components/dashboard/news-skeleton'
import { getAdminUserId } from '@/lib/admin'

export const metadata: Metadata = {
  title: '뉴스 대시보드',
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect('/login')
  }

  const adminId = await getAdminUserId()
  const categories = adminId
    ? await prisma.category.findMany({
        where: { userId: adminId },
        include: { keywords: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      })
    : []

  return (
    // useSearchParams()는 Suspense 경계 필요
    <Suspense
      fallback={
        <div className="flex-1 p-6">
          <NewsSkeletonList />
        </div>
      }
    >
      <DashboardClient initialCategories={categories} />
    </Suspense>
  )
}
