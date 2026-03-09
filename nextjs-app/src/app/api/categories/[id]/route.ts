import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ADMIN 여부 확인 헬퍼
async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return { error: '인증이 필요합니다.', status: 401 }
  if (session.user.role !== 'ADMIN') return { error: '관리자만 수정할 수 있습니다.', status: 403 }
  return { session }
}

// PATCH /api/categories/:id — 분야 수정 (ADMIN 전용)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { name, color, priorityKeywords, excludeKeywords } = await req.json()

  const existing = await prisma.category.findFirst({ where: { id: params.id } })
  if (!existing) {
    return NextResponse.json({ error: '분야를 찾을 수 없습니다.' }, { status: 404 })
  }

  const updated = await prisma.category.update({
    where: { id: params.id },
    data: {
      ...(name?.trim() && { name: name.trim() }),
      ...(color && { color }),
      ...(Array.isArray(priorityKeywords) && {
        priorityKeywords: JSON.stringify(
          priorityKeywords
            .filter((pk: unknown) => pk && typeof pk === 'object')
            .map((pk: unknown) => {
              const p = pk as Record<string, unknown>
              return { term: String(p.term ?? ''), weight: Number(p.weight ?? 3) }
            })
            .filter((pk: { term: string; weight: number }) => pk.term)
        ),
      }),
      ...(Array.isArray(excludeKeywords) && {
        excludeKeywords: JSON.stringify(excludeKeywords.map(String).filter(Boolean)),
      }),
    },
    include: { keywords: true },
  })

  return NextResponse.json({ category: updated })
}

// DELETE /api/categories/:id — 분야 삭제 (ADMIN 전용)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const existing = await prisma.category.findFirst({ where: { id: params.id } })
  if (!existing) {
    return NextResponse.json({ error: '분야를 찾을 수 없습니다.' }, { status: 404 })
  }

  await prisma.category.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}
