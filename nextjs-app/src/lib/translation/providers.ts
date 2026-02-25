/**
 * 번역 제공자 구현체
 *
 * 우선순위:
 *   1. Google Cloud Translation API  — 공식, 배치 지원, 월 500K자 무료
 *   2. LibreTranslate                — 오픈소스, 배치 지원 (배열 q)
 *   3. GTX (비공식 Google 엔드포인트) — 키 불필요, 단건 순차 처리, fallback 전용
 */

import type { TranslationProvider, ProviderOutput } from './types'

// ── 1. Google Cloud Translation API ──────────────────────────

export const googleProvider: TranslationProvider = {
  name: 'google',

  isConfigured() {
    return !!process.env.GOOGLE_TRANSLATE_API_KEY
  },

  async translate(texts, targetLang) {
    const key = process.env.GOOGLE_TRANSLATE_API_KEY!

    const res = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // q를 배열로 전달하면 단일 API 호출로 배치 번역
        body: JSON.stringify({ q: texts, target: targetLang, format: 'text' }),
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(
        err?.error?.message ?? `Google Translate HTTP ${res.status}`
      )
    }

    const data = await res.json()
    return (data.data.translations as Array<{ translatedText: string; detectedSourceLanguage?: string }>).map((t): ProviderOutput => ({
      translated: t.translatedText,
      sourceLang: t.detectedSourceLanguage ?? 'auto',
    }))
  },
}

// ── 2. LibreTranslate ─────────────────────────────────────────

export const libreProvider: TranslationProvider = {
  name: 'libretranslate',

  isConfigured() {
    return !!(process.env.LIBRETRANSLATE_URL || process.env.LIBRETRANSLATE_API_KEY)
  },

  async translate(texts, targetLang) {
    const baseUrl = (
      process.env.LIBRETRANSLATE_URL ?? 'https://libretranslate.com'
    ).replace(/\/$/, '')
    const apiKey = process.env.LIBRETRANSLATE_API_KEY

    const res = await fetch(`${baseUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: texts,          // 배열 전달 → 배치 번역
        source: 'auto',
        target: targetLang,
        format: 'text',
        ...(apiKey && { api_key: apiKey }),
      }),
      cache: 'no-store',
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error ?? `LibreTranslate HTTP ${res.status}`)
    }

    const data = await res.json()

    // 단일 텍스트 → string, 복수 → string[]
    const translations: string[] = Array.isArray(data.translatedText)
      ? data.translatedText
      : [data.translatedText]

    return translations.map((t): ProviderOutput => ({
      translated: t,
      sourceLang: 'auto',
    }))
  },
}

// ── 3. GTX — 비공식 Google Translate 엔드포인트 ───────────────
// ※ 공식 API가 아님. 언제든 변경/차단될 수 있으므로 fallback 전용.

async function gtxSingle(text: string, targetLang: string): Promise<ProviderOutput> {
  const url = new URL('https://translate.googleapis.com/translate_a/single')
  url.searchParams.set('client', 'gtx')
  url.searchParams.set('sl', 'auto')
  url.searchParams.set('tl', targetLang)
  url.searchParams.set('dt', 't')
  url.searchParams.set('q', text)

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) throw new Error(`GTX HTTP ${res.status}`)

  // 응답: [[[segment, original, ...], ...], null, "detected_lang", ...]
  const raw: [[string, string][]] = await res.json()
  const translated = (raw[0] ?? []).map(([seg]) => seg ?? '').join('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sourceLang = typeof (raw as any)[2] === 'string' ? (raw as any)[2] : 'auto'

  return { translated, sourceLang }
}

export const gtxProvider: TranslationProvider = {
  name: 'gtx',

  isConfigured() {
    return true // 키 불필요, 항상 사용 가능
  },

  async translate(texts, targetLang) {
    // GTX는 배치 미지원 → 80ms 간격 순차 처리 (레이트 리밋 방지)
    const results: ProviderOutput[] = []
    for (let i = 0; i < texts.length; i++) {
      results.push(await gtxSingle(texts[i], targetLang))
      if (i < texts.length - 1) {
        await new Promise<void>((r) => setTimeout(r, 80))
      }
    }
    return results
  },
}

/** 우선순위 순서의 제공자 목록 */
export const PROVIDERS: TranslationProvider[] = [
  googleProvider,
  libreProvider,
  gtxProvider,
]
