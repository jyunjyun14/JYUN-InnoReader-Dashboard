/**
 * POST /api/admin/cache-cleanup
 *
 * 만료된 SearchCache 항목을 삭제합니다.
 * 운영 환경에서는 cron job 또는 Vercel Cron으로 호출하세요.
 * (예: 매일 새벽 3시에 실행)
 *
 * 보안: ADMIN_CLEANUP_SECRET 환경변수로 인증
 */
import { NextRequest, NextResponse } from 'next/server'
import { cleanExpiredCache } from '@/lib/news-cache'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cleanup-secret')
  const expected = process.env.ADMIN_CLEANUP_SECRET

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const deleted = await cleanExpiredCache()
  return NextResponse.json({
    success: true,
    deleted,
    message: `만료된 캐시 ${deleted}건 삭제 완료`,
  })
}
