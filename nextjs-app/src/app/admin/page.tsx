import type { Metadata } from 'next'
import { Users, Tags, Database, Languages, FolderOpen } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const metadata: Metadata = { title: '시스템 현황' }

async function getStats() {
  const [
    totalUsers,
    adminCount,
    totalCategories,
    totalKeywords,
    activeCacheCount,
    translationCacheCount,
    recentUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'ADMIN' } }),
    prisma.category.count(),
    prisma.keyword.count(),
    prisma.searchCache.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.translationCache.count(),
    prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
  ])

  return {
    totalUsers,
    adminCount,
    totalCategories,
    totalKeywords,
    activeCacheCount,
    translationCacheCount,
    recentUsers,
  }
}

export default async function AdminPage() {
  const stats = await getStats()

  const statCards = [
    {
      title: '전체 사용자',
      value: stats.totalUsers,
      sub: `관리자 ${stats.adminCount}명`,
      icon: Users,
      color: 'text-violet-600',
      bg: 'bg-violet-100',
    },
    {
      title: '분야 / 키워드',
      value: `${stats.totalCategories} / ${stats.totalKeywords}`,
      sub: '전체 등록 기준',
      icon: FolderOpen,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
    {
      title: '검색 캐시 (활성)',
      value: stats.activeCacheCount,
      sub: '만료 전 항목',
      icon: Database,
      color: 'text-green-600',
      bg: 'bg-green-100',
    },
    {
      title: '번역 캐시',
      value: stats.translationCacheCount,
      sub: '누적 번역 항목',
      icon: Languages,
      color: 'text-amber-600',
      bg: 'bg-amber-100',
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-foreground">시스템 현황</h2>
        <p className="text-muted-foreground mt-1">서비스 전체 현황을 확인합니다.</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.title} className="border-border/50">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{card.title}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 최근 가입 사용자 */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">최근 가입 사용자</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0 divide-y divide-border">
            {stats.recentUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">사용자가 없습니다.</p>
            ) : (
              stats.recentUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {user.name ?? '이름 없음'}
                    </p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={user.role === 'ADMIN' ? 'default' : 'secondary'}
                      className={user.role === 'ADMIN' ? 'bg-primary' : ''}
                    >
                      {user.role === 'ADMIN' ? '관리자' : '일반'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          {stats.totalUsers > 5 && (
            <div className="pt-3 text-center">
              <a href="/admin/users" className="text-sm text-primary hover:underline font-medium">
                전체 사용자 보기 →
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
