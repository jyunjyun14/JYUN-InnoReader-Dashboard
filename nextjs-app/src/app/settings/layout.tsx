import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen bg-secondary overflow-hidden">
      <Sidebar role={session.user.role} />
      <div className="flex flex-col flex-1 min-w-0">
        <Header user={session.user} role={session.user.role} />
        {/* overflow-hidden + flex: 키워드 페이지의 2-panel이 가득 채울 수 있도록 */}
        <main className="flex-1 overflow-hidden p-6 flex flex-col">
          {children}
        </main>
      </div>
    </div>
  )
}
