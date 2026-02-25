/**
 * POST /api/translate
 *
 * 뉴스 제목 등 텍스트를 한국어로 번역합니다.
 *
 * Request body:
 *   { texts: string[], targetLang?: string }
 *
 * Response:
 *   { results: TranslationResult[], provider: string, stats: {...} }
 *
 * 우선순위: Google Cloud Translation → LibreTranslate → GTX(비공식)
 * 번역 결과는 DB에 캐싱됩니다 (재번역 방지).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { translateBatch } from '@/lib/translation'
import type { TranslateApiResponse } from '@/lib/translation/types'

const MAX_TEXTS = 50
const MAX_TEXT_LENGTH = 500

export async function POST(req: NextRequest) {
  // ── 인증 ───────────────────────────────────────────────────
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  // ── 요청 파싱 ──────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: '요청 본문이 올바른 JSON 형식이 아닙니다.' },
      { status: 400 }
    )
  }

  if (!body || typeof body !== 'object' || !('texts' in body)) {
    return NextResponse.json(
      { error: '{ texts: string[] } 형태로 보내주세요.' },
      { status: 400 }
    )
  }

  const { texts, targetLang = 'ko' } = body as { texts: unknown; targetLang?: string }

  // ── 유효성 검사 ────────────────────────────────────────────
  if (!Array.isArray(texts) || texts.length === 0) {
    return NextResponse.json(
      { error: '번역할 텍스트 배열(texts)이 필요합니다.' },
      { status: 400 }
    )
  }

  if (texts.length > MAX_TEXTS) {
    return NextResponse.json(
      { error: `한 번에 최대 ${MAX_TEXTS}개까지 번역 가능합니다.` },
      { status: 400 }
    )
  }

  if (!['ko', 'en', 'ja', 'zh', 'de', 'fr'].includes(targetLang)) {
    return NextResponse.json(
      { error: '지원하지 않는 targetLang입니다. (ko, en, ja, zh, de, fr)' },
      { status: 400 }
    )
  }

  // 문자열만 필터링 + 길이 제한
  const validTexts = (texts as unknown[])
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.slice(0, MAX_TEXT_LENGTH))

  if (validTexts.length === 0) {
    return NextResponse.json(
      { error: '유효한 텍스트가 없습니다.' },
      { status: 400 }
    )
  }

  // ── 번역 실행 ─────────────────────────────────────────────
  try {
    const results = await translateBatch(validTexts, targetLang)

    const stats = {
      total: results.length,
      cached: results.filter((r) => r.status === 'cached').length,
      translated: results.filter((r) => r.status === 'translated').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
    }

    const activeProvider =
      results.find((r) => r.status === 'translated')?.provider ?? 'cache'

    const response: TranslateApiResponse = {
      results,
      provider: activeProvider,
      stats,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[TRANSLATE_API_ERROR]', error)
    return NextResponse.json(
      { error: '번역 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500 }
    )
  }
}
