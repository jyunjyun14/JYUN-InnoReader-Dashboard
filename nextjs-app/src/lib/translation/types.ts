// ── 번역 제공자 인터페이스 ────────────────────────────────────

export interface ProviderOutput {
  translated: string
  sourceLang: string  // IETF 언어 태그 (예: "en", "ja") 또는 "auto"
}

export interface TranslationProvider {
  readonly name: string
  /** 필요한 환경변수가 설정되어 있으면 true */
  isConfigured(): boolean
  /** texts를 targetLang으로 번역. 순서 보장 필요 */
  translate(texts: string[], targetLang: string): Promise<ProviderOutput[]>
}

// ── 번역 결과 ─────────────────────────────────────────────────

export type TranslationStatus = 'translated' | 'cached' | 'skipped' | 'failed'

export interface TranslationResult {
  original: string
  translated: string  // 실패 시 '' (UI에서 원문 fallback)
  sourceLang: string
  provider: string
  cached: boolean
  status: TranslationStatus
}

// ── API 응답 ──────────────────────────────────────────────────

export interface TranslateApiResponse {
  results: TranslationResult[]
  provider: string
  stats: {
    total: number
    cached: number
    translated: number
    skipped: number
    failed: number
  }
}
