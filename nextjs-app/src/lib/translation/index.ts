/**
 * 통합 번역 서비스
 *
 * 실행 순서:
 *   1. DB 캐시 조회
 *   2. 미캐시 항목 → 설정된 제공자 순서대로 시도 (Google → LibreTranslate → GTX)
 *   3. 성공 결과 캐시 저장 (백그라운드)
 *   4. 전체 결과 반환 (실패 시 translated: '')
 */

import { PROVIDERS } from './providers'
import { lookupCache, writeCache } from './cache'
import type { TranslationResult, TranslationStatus } from './types'

// ── 언어 감지 ─────────────────────────────────────────────────

/** 이미 한국어인지 확인 */
function isKorean(text: string): boolean {
  return /[\uAC00-\uD7AF\u3131-\u318E]/.test(text)
}

/**
 * 번역이 필요한지 확인.
 * 한국어는 이미 타겟이므로 스킵. 빈 문자열도 스킵.
 * 일본어·중국어·아랍어 등 비한국어 텍스트는 모두 번역 대상.
 */
function needsTranslation(text: string): boolean {
  if (!text.trim()) return false
  return !isKorean(text)
}

// ── 메인 번역 함수 ────────────────────────────────────────────

/**
 * 텍스트 배열을 targetLang으로 번역합니다.
 *
 * @param texts      번역할 텍스트 배열
 * @param targetLang 목표 언어 (기본: 'ko')
 * @returns          TranslationResult 배열 (texts와 동일 길이, 동일 순서)
 */
export async function translateBatch(
  texts: string[],
  targetLang = 'ko'
): Promise<TranslationResult[]> {
  if (texts.length === 0) return []

  // 1. DB 캐시 조회
  const cacheMap = await lookupCache(texts, targetLang).catch(
    () => new Map<string, { translated: string; provider: string }>()
  )

  // 2. 캐시 미스이면서 번역 필요한 항목 추출 (순서/인덱스 보존)
  type PendingItem = { originalIndex: number; text: string }
  const pending: PendingItem[] = texts
    .map((text, originalIndex) => ({ originalIndex, text }))
    .filter(({ text }) => !cacheMap.has(text) && needsTranslation(text))

  // 3. 제공자 순서로 번역 시도
  let providerName = 'none'
  let providerOutputs: Array<{ translated: string; sourceLang: string }> = []

  if (pending.length > 0) {
    const pendingTexts = pending.map((p) => p.text)

    for (const provider of PROVIDERS) {
      if (!provider.isConfigured()) continue
      try {
        providerOutputs = await provider.translate(pendingTexts, targetLang)
        providerName = provider.name
        break
      } catch (err) {
        console.warn(
          `[TRANSLATE] ${provider.name} 실패 →`,
          err instanceof Error ? err.message : err
        )
      }
    }

    // 성공 결과 캐시 저장 (백그라운드, 응답 지연 없음)
    if (providerName !== 'none' && providerOutputs.length === pending.length) {
      writeCache(
        pending.map(({ text }, i) => ({
          original: text,
          translated: providerOutputs[i].translated,
          sourceLang: providerOutputs[i].sourceLang,
          provider: providerName,
        })),
        targetLang
      ).catch((err) => console.error('[TRANSLATE_CACHE_WRITE]', err))
    }
  }

  // 4. 결과 조합 — texts 배열과 동일 길이·순서 유지
  let providerIdx = 0

  return texts.map((text): TranslationResult => {
    // 캐시 히트
    if (cacheMap.has(text)) {
      const { translated, provider } = cacheMap.get(text)!
      return {
        original: text,
        translated,
        sourceLang: 'cached',
        provider,
        cached: true,
        status: 'cached',
      }
    }

    // 번역 불필요 (이미 한국어)
    if (!needsTranslation(text)) {
      return {
        original: text,
        translated: text,
        sourceLang: 'ko',
        provider: 'skip',
        cached: false,
        status: 'skipped',
      }
    }

    // 번역 결과 매핑
    const out = providerOutputs[providerIdx++]
    if (out) {
      return {
        original: text,
        translated: out.translated,
        sourceLang: out.sourceLang,
        provider: providerName,
        cached: false,
        status: 'translated',
      }
    }

    // 모든 제공자 실패
    return {
      original: text,
      translated: '',   // UI에서 원문 fallback
      sourceLang: 'unknown',
      provider: 'failed',
      cached: false,
      status: 'failed',
    }
  })
}

// ── 하위 호환 헬퍼 (google-search.ts 등에서 사용) ─────────────

/** translateBatch의 간편 래퍼 — titleKo 배열만 반환 */
export async function batchTranslateToKorean(texts: string[]): Promise<string[]> {
  const results = await translateBatch(texts, 'ko')
  return results.map((r) => r.translated)
}
