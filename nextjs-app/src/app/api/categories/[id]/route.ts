import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/categories/:id — 분야 수정 (name, color)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const { name, color } = await req.json()

  // 소유권 확인
  const existing = await prisma.category.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!existing) {
    return NextResponse.json({ error: '분야를 찾을 수 없습니다.' }, { status: 404 })
  }

  const updated = await prisma.category.update({
    where: { id: params.id },
    data: {
      ...(name?.trim() && { name: name.trim() }),
      ...(color && { color }),
    },
    include: { keywords: true },
  })

  return NextResponse.json({ category: updated })
}

// DELETE /api/categories/:id — 분야 삭제 (키워드 cascade 삭제)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const existing = await prisma.category.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!existing) {
    return NextResponse.json({ error: '분야를 찾을 수 없습니다.' }, { status: 404 })
  }

  await prisma.category.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}
