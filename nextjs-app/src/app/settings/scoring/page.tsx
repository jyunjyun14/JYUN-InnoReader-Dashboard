import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseScoringConfig, DEFAULT_SOURCE_TIERS } from '@/lib/scoring'
import { ScoringClient } from '@/components/settings/scoring-client'

export const metadata: Metadata = {
  title: '스코어링 설정',
}

export default async function ScoringPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const [scoringRow, rawCategories] = await Promise.all([
    prisma.scoringConfig.findUnique({ where: { userId: session.user.id } }),
    prisma.category.findMany({
      where: { userId: session.user.id },
      include: { keywords: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const config = parseScoringConfig(scoringRow)

  // sourceTiers가 비어있으면 기본 매체 티어 사용
  if (Object.keys(config.sourceTiers).length === 0) {
    config.sourceTiers = DEFAULT_SOURCE_TIERS
  }

  const categories = rawCategories.map((cat) => ({
    ...cat,
    priorityKeywords: (() => {
      try {
        const parsed = JSON.parse(cat.priorityKeywords)
        return Array.isArray(parsed) ? (parsed as { term: string; weight: number }[]) : []
      } catch { return [] as { term: string; weight: number }[] }
    })(),
    excludeKeywords: (() => {
      try {
        const parsed = JSON.parse(cat.excludeKeywords)
        return Array.isArray(parsed) ? (parsed as string[]) : []
      } catch { return [] as string[] }
    })(),
  }))

  return <ScoringClient initialConfig={config} initialCategories={categories} />
}
