'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Shield, ShieldOff, KeyRound, Trash2, Copy, Check, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface UserRow {
  id: string
  name: string | null
  email: string
  role: string
  createdAt: Date | string
  _count: { categories: number }
}

interface UsersClientProps {
  initialUsers: UserRow[]
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  variant = 'destructive',
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'destructive' | 'default'
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl border border-border shadow-xl p-6 w-full max-w-sm mx-4">
        <h3 className="text-base font-bold text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-5">{description}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            취소
          </Button>
          <Button
            size="sm"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ResetLinkDialog({
  open,
  resetUrl,
  onClose,
}: {
  open: boolean
  resetUrl: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  if (!open) return null

  const handleCopy = async () => {
    await navigator.clipboard.writeText(resetUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl border border-border shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-foreground">비밀번호 초기화 링크</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          아래 링크를 사용자에게 전달하세요. 링크는 <strong>1시간</strong> 후 만료됩니다.
        </p>
        <div className="bg-secondary rounded-lg p-3 flex items-center gap-2 mb-4">
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
        <Button className="w-full" onClick={onClose}>
          확인
        </Button>
      </div>
    </div>
  )
}

export function UsersClient({ initialUsers }: UsersClientProps) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers)
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)
  const [resetUrl, setResetUrl] = useState('')
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handleToggleRole(user: UserRow) {
    const newRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN'
    setLoadingId(user.id + '-role')

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'role', role: newRole }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? '역할 변경에 실패했습니다.')
        return
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u))
      )
      toast.success(
        `${user.name ?? user.email}의 역할이 ${newRole === 'ADMIN' ? '관리자' : '일반 사용자'}로 변경되었습니다.`
      )
    } finally {
      setLoadingId(null)
    }
  }

  async function handleResetPassword(user: UserRow) {
    setLoadingId(user.id + '-reset')

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resetPassword' }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? '초기화 링크 생성에 실패했습니다.')
        return
      }

      setResetUrl(data.resetUrl)
      setShowResetDialog(true)
    } finally {
      setLoadingId(null)
    }
  }

  async function handleDelete(user: UserRow) {
    setLoadingId(user.id + '-delete')
    setDeleteTarget(null)

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? '계정 삭제에 실패했습니다.')
        return
      }

      setUsers((prev) => prev.filter((u) => u.id !== user.id))
      toast.success(`${user.name ?? user.email} 계정이 삭제되었습니다.`)
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <>
      <Card className="border-border/50">
        <CardContent className="p-0">
          {/* 헤더 */}
          <div className="grid grid-cols-[1fr_160px_80px_80px_auto] gap-4 px-5 py-3 bg-secondary/60 rounded-t-xl border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span>사용자</span>
            <span>가입일</span>
            <span>분야</span>
            <span>역할</span>
            <span>액션</span>
          </div>

          {users.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              사용자가 없습니다.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="grid grid-cols-[1fr_160px_80px_80px_auto] gap-4 px-5 py-4 items-center hover:bg-accent/30 transition-colors"
                >
                  {/* 사용자 정보 */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user.name ?? '이름 없음'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>

                  {/* 가입일 */}
                  <span className="text-xs text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString('ko-KR')}
                  </span>

                  {/* 분야 수 */}
                  <span className="text-sm text-foreground text-center">
                    {user._count.categories}
                  </span>

                  {/* 역할 배지 */}
                  <div>
                    <Badge
                      variant={user.role === 'ADMIN' ? 'default' : 'secondary'}
                      className={user.role === 'ADMIN' ? 'bg-primary text-xs' : 'text-xs'}
                    >
                      {user.role === 'ADMIN' ? '관리자' : '일반'}
                    </Badge>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex items-center gap-1">
                    {/* 역할 변경 */}
                    <button
                      onClick={() => handleToggleRole(user)}
                      disabled={loadingId === user.id + '-role'}
                      title={user.role === 'ADMIN' ? '관리자 권한 해제' : '관리자로 승격'}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-accent transition-colors disabled:opacity-40"
                    >
                      {user.role === 'ADMIN' ? (
                        <ShieldOff className="h-4 w-4" />
                      ) : (
                        <Shield className="h-4 w-4" />
                      )}
                    </button>

                    {/* 비밀번호 초기화 */}
                    <button
                      onClick={() => handleResetPassword(user)}
                      disabled={loadingId === user.id + '-reset'}
                      title="비밀번호 초기화 링크 생성"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-40"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>

                    {/* 계정 삭제 */}
                    <button
                      onClick={() => setDeleteTarget(user)}
                      disabled={loadingId === user.id + '-delete'}
                      title="계정 삭제"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 계정 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="계정 삭제"
        description={`${deleteTarget?.name ?? deleteTarget?.email} 계정을 삭제하시겠습니까? 분야, 키워드, 설정이 모두 삭제되며 복구할 수 없습니다.`}
        confirmLabel="삭제"
        variant="destructive"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* 비밀번호 초기화 링크 다이얼로그 */}
      <ResetLinkDialog
        open={showResetDialog}
        resetUrl={resetUrl}
        onClose={() => {
          setShowResetDialog(false)
          setResetUrl('')
        }}
      />
    </>
  )
}
