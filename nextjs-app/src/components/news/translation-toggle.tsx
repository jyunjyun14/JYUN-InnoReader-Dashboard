'use client'

import { useState } from 'react'
import { Languages, Loader2, RotateCcw, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TranslationToggleProps {
  /** 원문 제목 */
  original: string
  /** 미리 로드된 한국어 번역 (없으면 클릭 시 on-demand 번역) */
  titleKo?: string
  /** 컨테이너 클래스 */
  className?: string
  /** 제목 텍스트 클래스 */
  textClassName?: string
}

type State = 'idle' | 'loading' | 'done' | 'failed'

export function TranslationToggle({
  original,
  titleKo: initialKo = '',
  className,
  textClassName,
}: TranslationToggleProps) {
  const [showKorean, setShowKorean] = useState(!!initialKo)
  const [ko, setKo] = useState(initialKo)
  const [state, setState] = useState<State>(initialKo ? 'done' : 'idle')

  const displayText = showKorean && ko ? ko : original

  async function handleToggle() {
    // 이미 번역 있음 → 단순 토글
    if (ko) {
      setShowKorean((v) => !v)
      return
    }

    // 번역 요청
    setState('loading')
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: [original] }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      const translated: string = data.results?.[0]?.translated ?? ''
      const status: string = data.results?.[0]?.status ?? 'failed'

      if (translated && status !== 'failed') {
        setKo(translated)
        setShowKorean(true)
        setState('done')
      } else {
        // 이미 한국어이거나 번역 결과 없음
        setState(status === 'skipped' ? 'done' : 'failed')
        if (status === 'skipped') {
          setKo(original) // 원문 그대로 사용
          setShowKorean(true)
        }
      }
    } catch {
      setState('failed')
    }
  }

  async function handleRetry() {
    setState('idle')
    setKo('')
    setShowKorean(false)
    await handleToggle()
  }

  return (
    <div className={cn('group/tt flex items-start gap-1.5', className)}>
      {/* 제목 텍스트 */}
      <span className={cn('flex-1 leading-snug', textClassName)}>
        {displayText}
      </span>

      {/* 번역 토글 버튼 */}
      <button
        onClick={state === 'failed' ? handleRetry : handleToggle}
        disabled={state === 'loading'}
        title={
          state === 'loading'
            ? '번역 중...'
            : state === 'failed'
            ? '다시 시도'
            : showKorean
            ? '원문 보기'
            : '한국어로 번역'
        }
        aria-label={showKorean ? '원문 보기' : '한국어로 번역'}
        className={cn(
          'shrink-0 mt-0.5 p-1 rounded-md transition-all duration-150',
          // 호버 시만 표시 (포커스 시 항상 표시)
          'opacity-0 group-hover/tt:opacity-100 focus-visible:opacity-100',
          state === 'loading' && 'cursor-wait opacity-60',
          state === 'failed' && 'text-destructive hover:bg-destructive/10 opacity-70',
          state === 'done' && showKorean
            ? 'text-primary bg-primary/10'
            : 'text-muted-foreground hover:text-primary hover:bg-accent'
        )}
      >
        {state === 'loading' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : state === 'failed' ? (
          <RotateCcw className="h-3.5 w-3.5" />
        ) : state === 'done' && showKorean ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Languages className="h-3.5 w-3.5" />
        )}
      </button>

      {/* 번역 상태 뱃지 (번역된 경우에만) */}
      {state === 'done' && showKorean && ko !== original && (
        <span className="shrink-0 mt-1 text-[10px] text-muted-foreground/50 font-mono">
          번역
        </span>
      )}
    </div>
  )
}

// ── 뉴스 목록용 일괄 번역 훅 ─────────────────────────────────

import { useCallback } from 'react'

interface UseTranslateAllOptions {
  onComplete?: (results: Record<string, string>) => void
}

/**
 * 뉴스 목록 페이지에서 "전체 번역" 버튼 구현용 훅.
 *
 * @example
 * const { translateAll, isTranslating } = useTranslateAll({ onComplete: (map) => ... })
 * <button onClick={() => translateAll(titles)}>전체 번역</button>
 */
export function useTranslateAll(options?: UseTranslateAllOptions) {
  const [isTranslating, setIsTranslating] = useState(false)
  const [progress, setProgress] = useState(0)

  const translateAll = useCallback(
    async (texts: string[]) => {
      if (isTranslating || texts.length === 0) return

      setIsTranslating(true)
      setProgress(0)

      const BATCH_SIZE = 10
      const resultMap: Record<string, string> = {}

      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE)

        try {
          const res = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts: batch }),
          })

          if (res.ok) {
            const data = await res.json()
            for (const r of data.results ?? []) {
              if (r.translated) resultMap[r.original] = r.translated
            }
          }
        } catch {
          // 배치 실패 → 해당 배치 스킵하고 계속
        }

        setProgress(Math.min(100, Math.round(((i + BATCH_SIZE) / texts.length) * 100)))
      }

      options?.onComplete?.(resultMap)
      setIsTranslating(false)
      setProgress(100)
    },
    [isTranslating, options]
  )

  return { translateAll, isTranslating, progress }
}
