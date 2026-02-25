/**
 * 접근 코드 해시 유틸 (Edge Runtime + Node.js 모두 호환)
 * Web Crypto API (crypto.subtle) 사용
 */

export const ACCESS_COOKIE = 'site_access'

/**
 * ACCESS_CODE + NEXTAUTH_SECRET → SHA-256 해시 (hex 문자열)
 * 미들웨어(Edge)와 API 라우트(Node.js) 양쪽에서 동일하게 동작
 */
export async function hashAccessCode(code: string): Promise<string> {
  const secret = (process.env.NEXTAUTH_SECRET ?? 'fallback-secret').trim()
  const data = new TextEncoder().encode(`${code}:${secret}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
