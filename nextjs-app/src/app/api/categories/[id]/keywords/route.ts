import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/categories/:id/keywords — 키워드 추가
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { term } = await req.json()

  if (!term?.trim()) {
    return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 })
  }

  // 소유권 확인
  const category = await prisma.category.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!category) {
    return NextResponse.json({ error: '분야를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 중복 확인
  const existing = await prisma.keyword.findFirst({
    where: { categoryId: params.id, term: term.trim() },
  })
  if (existing) {
    return NextResponse.json({ error: '이미 등록된 키워드입니다.' }, { status: 409 })
  }

  const keyword = await prisma.keyword.create({
    data: { categoryId: params.id, term: term.trim() },
  })

  return NextResponse.json({ keyword }, { status: 201 })
}
