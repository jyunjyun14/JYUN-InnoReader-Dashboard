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

  const row = await prisma.scoringConfig.findUnique({
    where: { userId: session.user.id },
  })

  const config = parseScoringConfig(row)

  // sourceTiers가 비어있으면 기본 매체 티어 사용
  if (Object.keys(config.sourceTiers).length === 0) {
    config.sourceTiers = DEFAULT_SOURCE_TIERS
  }

  return <ScoringClient initialConfig={config} />
}
