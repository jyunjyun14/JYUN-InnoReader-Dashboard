'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <Card className="shadow-xl shadow-primary/10 border-border/50 animate-fade-in">
        <CardContent className="pt-8 pb-6 text-center">
          <p className="text-sm text-destructive mb-4">유효하지 않은 접근입니다.</p>
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            비밀번호 찾기 다시 요청
          </Link>
        </CardContent>
      </Card>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || isLoading) return

    if (password !== confirm) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? '오류가 발생했습니다.')
        return
      }

      setDone(true)
      // 3초 후 로그인 페이지로 이동
      setTimeout(() => router.push('/login'), 3000)
    } catch {
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  if (done) {
    return (
      <Card className="shadow-xl shadow-primary/10 border-border/50 animate-fade-in">
        <CardContent className="pt-8 pb-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="text-base font-bold text-foreground">비밀번호가 변경되었습니다</h3>
            <p className="text-sm text-muted-foreground">
              잠시 후 로그인 페이지로 이동합니다.
            </p>
          </div>
        </CardContent>
        <CardFooter className="pt-0 justify-center">
          <Link href="/login" className="text-sm text-primary hover:underline font-semibold">
            지금 로그인하기
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="shadow-xl shadow-primary/10 border-border/50 animate-fade-in">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-2xl text-center font-bold">새 비밀번호 설정</CardTitle>
        <CardDescription className="text-center">
          새로 사용할 비밀번호를 입력하세요.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">새 비밀번호</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPw ? 'text' : 'password'}
                placeholder="8자 이상 입력하세요"
                autoComplete="new-password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="pr-10"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">비밀번호 확인</Label>
            <Input
              id="confirm"
              type="password"
              placeholder="비밀번호를 다시 입력하세요"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={isLoading}
            />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pt-0">
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !password || !confirm}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            비밀번호 변경
          </Button>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            로그인으로 돌아가기
          </Link>
        </CardFooter>
      </form>
    </Card>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
