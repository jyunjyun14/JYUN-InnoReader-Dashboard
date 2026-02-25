import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  parseScoringConfig,
  DEFAULT_SCORING_CONFIG,
  DEFAULT_SOURCE_TIERS,
  type PriorityKeyword,
} from '@/lib/scoring'

/** GET /api/scoring-config — 현재 사용자의 설정 조회 (없으면 기본값) */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const row = await prisma.scoringConfig.findUnique({
    where: { userId: session.user.id },
  })

  // DB 행이 없으면 기본값 반환 (sourceTiers는 DEFAULT_SOURCE_TIERS 사용)
  if (!row) {
    return NextResponse.json(DEFAULT_SCORING_CONFIG)
  }

  const config = parseScoringConfig(row)

  // sourceTiers가 빈 객체면 기본 티어로 채워서 반환 (초기 설정 편의)
  if (Object.keys(config.sourceTiers).length === 0) {
    config.sourceTiers = DEFAULT_SOURCE_TIERS
  }

  return NextResponse.json(config)
}

/** PUT /api/scoring-config — upsert */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 형식입니다.' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const data = body as Record<string, unknown>

  // ── 유효성 검사 ─────────────────────────────────────────────
  const wK = Number(data.weightKeyword ?? 40)
  const wP = Number(data.weightPriority ?? 20)
  const wS = Number(data.weightSource ?? 20)
  const wR = Number(data.weightRecency ?? 20)

  if ([wK, wP, wS, wR].some((v) => isNaN(v) || v < 0 || v > 100)) {
    return NextResponse.json(
      { error: '가중치는 0~100 사이의 숫자여야 합니다.' },
      { status: 400 }
    )
  }

  // 우선 키워드 검증
  const rawPriority = Array.isArray(data.priorityKeywords) ? data.priorityKeywords : []
  const priorityKeywords: PriorityKeyword[] = rawPriority
    .filter(
      (pk): pk is { term: string; weight: number } =>
        pk && typeof pk === 'object' && typeof pk.term === 'string' && pk.term.trim() !== ''
    )
    .map((pk) => ({
      term: String(pk.term).trim().slice(0, 100),
      weight: Math.min(5, Math.max(1, Number(pk.weight) || 1)),
    }))

  // 제외 키워드 검증
  const rawExclude = Array.isArray(data.excludeKeywords) ? data.excludeKeywords : []
  const excludeKeywords: string[] = rawExclude
    .filter((k): k is string => typeof k === 'string' && k.trim() !== '')
    .map((k) => String(k).trim().slice(0, 100))

  // 매체 티어 검증
  const rawTiers = data.sourceTiers && typeof data.sourceTiers === 'object' && !Array.isArray(data.sourceTiers)
    ? (data.sourceTiers as Record<string, unknown>)
    : {}
  const sourceTiers: Record<string, 1 | 2> = {}
  for (const [domain, tier] of Object.entries(rawTiers)) {
    if (tier === 1 || tier === 2) {
      sourceTiers[domain.trim().toLowerCase()] = tier
    }
  }

  // ── DB upsert ────────────────────────────────────────────────
  const saved = await prisma.scoringConfig.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      priorityKeywords: JSON.stringify(priorityKeywords),
      excludeKeywords: JSON.stringify(excludeKeywords),
      sourceTiers: JSON.stringify(sourceTiers),
      weightKeyword: wK,
      weightPriority: wP,
      weightSource: wS,
      weightRecency: wR,
    },
    update: {
      priorityKeywords: JSON.stringify(priorityKeywords),
      excludeKeywords: JSON.stringify(excludeKeywords),
      sourceTiers: JSON.stringify(sourceTiers),
      weightKeyword: wK,
      weightPriority: wP,
      weightSource: wS,
      weightRecency: wR,
    },
  })

  return NextResponse.json(parseScoringConfig(saved))
}
