import { NextRequest, NextResponse } from 'next/server'
import { ACCESS_COOKIE, hashAccessCode } from '@/lib/access'

/** POST /api/access — 접근 코드 검증 + 쿠키 발급 */
export async function POST(req: NextRequest) {
  const requiredCode = process.env.ACCESS_CODE?.trim()

  // ACCESS_CODE 미설정 시 자동 허용 (개발 환경)
  if (!requiredCode) {
    return NextResponse.json({ ok: true })
  }

  let body: { code?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const inputCode = (body.code ?? '').trim()
  if (!inputCode) {
    return NextResponse.json({ error: '접근 코드를 입력해주세요.' }, { status: 400 })
  }

  // 코드 검증
  if (inputCode !== requiredCode) {
    // 무차별 대입 방지용 딜레이
    await new Promise((r) => setTimeout(r, 500))
    return NextResponse.json({ error: '접근 코드가 올바르지 않습니다.' }, { status: 401 })
  }

  // 해시 생성 후 httpOnly 쿠키 설정
  const hash = await hashAccessCode(requiredCode)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ACCESS_COOKIE, hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30일
  })

  return res
}
