'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Settings, Tags, SlidersHorizontal, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  {
    title: '대시보드',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: '설정',
    href: '/settings',
    icon: Settings,
  },
  {
    title: '키워드 관리',
    href: '/settings/keywords',
    icon: Tags,
  },
  {
    title: '스코어 설정',
    href: '/settings/scoring',
    icon: SlidersHorizontal,
  },
]

export function Sidebar({ role }: { role?: string | null }) {
  const pathname = usePathname()

  return (
    <aside className="w-64 shrink-0 bg-card border-r border-border flex flex-col h-full">
      {/* 로고 */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm shadow-primary/30">
            <svg
              className="w-4 h-4 text-primary-foreground"
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
          <span className="font-semibold text-foreground">
            {process.env.NEXT_PUBLIC_APP_NAME ?? 'Dashboard'}
          </span>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))

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
              <item.icon
                className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : '')}
              />
              {item.title}
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* 관리자 패널 링크 */}
      {role === 'ADMIN' && (
        <div className="px-4 pb-2">
          <Link
            href="/admin"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              pathname.startsWith('/admin')
                ? 'bg-accent text-primary'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            )}
          >
            <ShieldCheck className={cn('h-4 w-4 shrink-0', pathname.startsWith('/admin') ? 'text-primary' : '')} />
            관리자 패널
            {pathname.startsWith('/admin') && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </Link>
        </div>
      )}

      {/* 하단 버전 표시 */}
      <div className="p-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">v0.1.0</p>
      </div>
    </aside>
  )
}
