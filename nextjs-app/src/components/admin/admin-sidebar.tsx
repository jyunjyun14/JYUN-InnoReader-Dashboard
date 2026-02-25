'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, ArrowLeft, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  {
    title: '시스템 현황',
    href: '/admin',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    title: '사용자 관리',
    href: '/admin/users',
    icon: Users,
  },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 shrink-0 bg-card border-r border-border flex flex-col h-full">
      {/* 로고 */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm shadow-primary/30">
            <ShieldCheck className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">관리자 패널</span>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + '/')

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-accent text-primary'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              )}
            >
              <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : '')} />
              {item.title}
              {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
            </Link>
          )
        })}
      </nav>

      {/* 하단 — 대시보드 복귀 */}
      <div className="p-4 border-t border-border space-y-1">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-all duration-150"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          대시보드로 이동
        </Link>
        <p className="text-xs text-muted-foreground text-center pt-2">v0.1.0</p>
      </div>
    </aside>
  )
}
