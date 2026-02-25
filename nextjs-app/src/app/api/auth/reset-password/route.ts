import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { token, password } = body

    if (!token || !password) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 })
    }

    const verificationToken = await prisma.verificationToken.findFirst({
      where: { token },
    })

    if (!verificationToken) {
      return NextResponse.json({ error: '유효하지 않은 링크입니다.' }, { status: 400 })
    }

    if (verificationToken.expires < new Date()) {
      // 만료된 토큰 삭제
      await prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: verificationToken.identifier,
            token,
          },
        },
      })
      return NextResponse.json(
        { error: '링크가 만료되었습니다. 다시 요청해주세요.' },
        { status: 400 }
      )
    }

    // 비밀번호 업데이트
    const hashedPassword = await bcrypt.hash(password, 12)
    await prisma.user.update({
      where: { email: verificationToken.identifier },
      data: { hashedPassword },
    })

    // 사용된 토큰 삭제
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: verificationToken.identifier,
          token,
        },
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[RESET_PASSWORD_ERROR]', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
