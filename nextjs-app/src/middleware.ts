import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { ACCESS_COOKIE, hashAccessCode } from '@/lib/access'

// 접근 코드 체크를 건너뛸 경로
function isAccessExempt(pathname: string): boolean {
  return (
    pathname === '/access' ||
    pathname.startsWith('/api/access') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  )
}

// 로그인 필요 경로
function isAuthRequired(pathname: string): boolean {
  return (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/admin')
  )
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── 1. 접근 코드 체크 ──────────────────────────────────────
  const requiredCode = process.env.ACCESS_CODE
  if (requiredCode && !isAccessExempt(pathname)) {
    const cookie = req.cookies.get(ACCESS_COOKIE)
    const expected = await hashAccessCode(requiredCode)

    if (!cookie || cookie.value !== expected) {
      const url = req.nextUrl.clone()
      url.pathname = '/access'
      // 원래 가려던 경로를 callbackUrl로 저장
      if (pathname !== '/') url.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(url)
    }
  }

  // ── 2. 인증 체크 (보호된 경로) ────────────────────────────
  if (isAuthRequired(pathname)) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    })
    if (!token) {
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  // 정적 파일 및 이미지 최적화 경로 제외
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
