'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Mail, ArrowLeft, Copy, Check } from 'lucide-react'
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [resetUrl, setResetUrl] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || isLoading) return

    setIsLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? '오류가 발생했습니다.')
        return
      }

      if (data.resetUrl) {
        // 이메일 서비스 미설정 — 링크 직접 표시
        setResetUrl(data.resetUrl)
      }
      setDone(true)
    } catch {
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(resetUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="shadow-xl shadow-primary/10 border-border/50 animate-fade-in">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-2xl text-center font-bold">비밀번호 찾기</CardTitle>
        <CardDescription className="text-center">
          {done
            ? resetUrl
              ? '아래 링크로 비밀번호를 재설정하세요.'
              : '이메일을 확인하세요.'
            : '가입한 이메일을 입력하시면 재설정 링크를 보내드립니다.'}
        </CardDescription>
      </CardHeader>

      {done ? (
        <CardContent className="space-y-4">
          {resetUrl ? (
            /* 이메일 서비스 미설정 → 링크 표시 */
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700 font-medium mb-1">이메일 서비스가 설정되지 않았습니다</p>
                <p className="text-xs text-amber-600">아래 링크를 복사해서 사용자에게 전달하거나 직접 접속하세요.</p>
              </div>
              <div className="bg-secondary rounded-lg p-3 flex items-start gap-2">
                <p className="text-xs text-foreground font-mono break-all flex-1 leading-relaxed">
                  {resetUrl}
                </p>
                <button
                  onClick={handleCopy}
                  className="shrink-0 p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
                  title="복사"
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ) : (
            /* 이메일 발송 완료 */
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">{email}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  로 재설정 링크를 발송했습니다.<br />
                  메일함(스팸 포함)을 확인해주세요.
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                링크는 1시간 동안 유효합니다.
              </p>
            </div>
          )}
        </CardContent>
      ) : (
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pt-0">
            <Button type="submit" className="w-full" disabled={isLoading || !email.trim()}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              재설정 링크 받기
            </Button>
          </CardFooter>
        </form>
      )}

      <CardFooter className="pt-0 justify-center">
        <Link
          href="/login"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          로그인으로 돌아가기
        </Link>
      </CardFooter>
    </Card>
  )
}
