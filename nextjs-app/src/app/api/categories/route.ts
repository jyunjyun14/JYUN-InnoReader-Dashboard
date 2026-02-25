import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/categories — 로그인 사용자의 분야 목록 (키워드 포함)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const categories = await prisma.category.findMany({
    where: { userId: session.user.id },
    include: {
      keywords: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ categories })
}

// POST /api/categories — 새 분야 생성
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { name, color } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: '분야 이름은 필수입니다.' }, { status: 400 })
  }

  const category = await prisma.category.create({
    data: {
      userId: session.user.id,
      name: name.trim(),
      color: color ?? 'violet',
    },
    include: { keywords: true },
  })

  return NextResponse.json({ category }, { status: 201 })
}
