import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAdminUserId } from '@/lib/admin'

// GET /api/categories — 공유 분야 목록 (ADMIN 유저 기준)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const adminId = await getAdminUserId()
  if (!adminId) {
    return NextResponse.json({ categories: [] })
  }

  const categories = await prisma.category.findMany({
    where: { userId: adminId },
    include: {
      keywords: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ categories })
}

// POST /api/categories — 새 분야 생성 (ADMIN 전용)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: '관리자만 분야를 생성할 수 있습니다.' }, { status: 403 })
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
