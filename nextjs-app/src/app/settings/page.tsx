import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'

export const metadata: Metadata = {
  title: '설정',
}

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-foreground">설정</h2>
        <p className="text-muted-foreground mt-1">계정 및 앱 설정을 관리하세요.</p>
      </div>

      {/* 프로필 */}
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>프로필 정보</CardTitle>
              <CardDescription>개인 정보를 업데이트하세요.</CardDescription>
            </div>
            <Badge variant="secondary">
              {session?.user?.role === 'ADMIN' ? '관리자' : '일반 사용자'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">이름</Label>
            <Input
              id="name"
              defaultValue={session?.user?.name ?? ''}
              placeholder="이름을 입력하세요"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              defaultValue={session?.user?.email ?? ''}
              placeholder="이메일을 입력하세요"
              disabled
              className="opacity-60"
            />
            <p className="text-xs text-muted-foreground">이메일은 변경할 수 없습니다.</p>
          </div>
          <Button>변경 사항 저장</Button>
        </CardContent>
      </Card>

      <Separator />

      {/* 비밀번호 변경 */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>비밀번호 변경</CardTitle>
          <CardDescription>보안을 위해 정기적으로 비밀번호를 변경하세요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">현재 비밀번호</Label>
            <Input id="current-password" type="password" placeholder="현재 비밀번호" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">새 비밀번호</Label>
            <Input id="new-password" type="password" placeholder="8자 이상 입력하세요" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">비밀번호 확인</Label>
            <Input id="confirm-password" type="password" placeholder="비밀번호를 다시 입력하세요" />
          </div>
          <Button>비밀번호 변경</Button>
        </CardContent>
      </Card>

      <Separator />

      {/* 위험 구역 */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">위험 구역</CardTitle>
          <CardDescription>이 작업은 되돌릴 수 없습니다. 신중하게 진행하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive">계정 삭제</Button>
        </CardContent>
      </Card>
    </div>
  )
}
