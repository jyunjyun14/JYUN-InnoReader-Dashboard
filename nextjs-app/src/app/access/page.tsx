'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, Lock } from 'lucide-react'

function AccessForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard'

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || isLoading) return

    setIsLoading(true)
    setError('')

    try {
      const res = await fetch('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })

      if (res.ok) {
        router.push(callbackUrl)
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? '접근 코드가 올바르지 않습니다.')
        setCode('')
      }
    } catch {
      setError('오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-accent/30 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-primary rounded-xl shadow-lg shadow-primary/30 mb-4">
            <svg
              className="w-6 h-6 text-primary-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {process.env.NEXT_PUBLIC_APP_NAME ?? '뉴스 대시보드'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">비즈니스 인사이트를 한눈에</p>
        </div>

        {/* 카드 */}
        <div className="bg-white rounded-2xl border border-border shadow-xl shadow-primary/10 p-8">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-bold text-foreground">접근 코드 입력</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            이 서비스는 초대된 사용자만 이용할 수 있습니다.
            <br />
            담당자에게 접근 코드를 문의하세요.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <input
                type="password"
                placeholder="접근 코드를 입력하세요"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isLoading}
                autoFocus
                autoComplete="off"
                className="w-full h-11 px-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors disabled:opacity-50"
                aria-label="접근 코드"
                aria-describedby={error ? 'access-error' : undefined}
              />
              {error && (
                <p
                  id="access-error"
                  className="text-sm text-destructive flex items-center gap-1"
                  role="alert"
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !code.trim()}
              className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  확인 중...
                </>
              ) : (
                '입장하기'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function AccessPage() {
  return (
    <Suspense>
      <AccessForm />
    </Suspense>
  )
}
