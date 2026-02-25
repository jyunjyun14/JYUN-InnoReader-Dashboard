import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'node:crypto'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const { id } = params
  const body = await req.json().catch(() => ({}))

  // 역할 변경
  if (body.action === 'role') {
    if (id === session.user.id && body.role === 'USER') {
      return NextResponse.json(
        { error: '자신의 관리자 권한은 해제할 수 없습니다.' },
        { status: 400 }
      )
    }
    const user = await prisma.user.update({
      where: { id },
      data: { role: body.role },
      select: { id: true, role: true },
    })
    return NextResponse.json(user)
  }

  // 관리자가 비밀번호 초기화 링크 생성
  if (body.action === 'resetPassword') {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { email: true },
    })
    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })
    }

    await prisma.verificationToken.deleteMany({ where: { identifier: user.email } })

    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1시간

    await prisma.verificationToken.create({
      data: { identifier: user.email, token, expires },
    })

    const appUrl = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
    const resetUrl = `${appUrl}/reset-password?token=${token}`

    return NextResponse.json({ resetUrl })
  }

  return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const { id } = params

  if (id === session.user.id) {
    return NextResponse.json({ error: '자기 자신을 삭제할 수 없습니다.' }, { status: 400 })
  }

  await prisma.user.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
