import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// DELETE /api/keywords/:id — 키워드 삭제
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  // 소유권 확인 (keyword → category → user)
  const keyword = await prisma.keyword.findFirst({
    where: {
      id: params.id,
      category: { userId: session.user.id },
    },
  })
  if (!keyword) {
    return NextResponse.json({ error: '키워드를 찾을 수 없습니다.' }, { status: 404 })
  }

  await prisma.keyword.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}
