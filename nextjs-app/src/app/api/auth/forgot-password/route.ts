import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPasswordResetEmail, isMailConfigured } from '@/lib/mail'
import crypto from 'node:crypto'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = (body.email ?? '').trim().toLowerCase()

    if (!email) {
      return NextResponse.json({ error: '이메일을 입력해주세요.' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    // 사용자 존재 여부를 노출하지 않음
    if (!user) {
      return NextResponse.json({ sent: true })
    }

    // 기존 토큰 삭제 후 새 토큰 생성
    await prisma.verificationToken.deleteMany({ where: { identifier: email } })

    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1시간

    await prisma.verificationToken.create({
      data: { identifier: email, token, expires },
    })

    const appUrl = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
    const resetUrl = `${appUrl}/reset-password?token=${token}`

    if (isMailConfigured()) {
      await sendPasswordResetEmail(email, resetUrl)
      return NextResponse.json({ sent: true })
    }

    // 이메일 미설정 시 — 링크를 직접 반환 (소규모 팀 / 개발 환경)
    return NextResponse.json({ sent: false, resetUrl })
  } catch (error) {
    console.error('[FORGOT_PASSWORD_ERROR]', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
