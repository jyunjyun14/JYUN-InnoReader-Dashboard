import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Header } from '@/components/layout/header'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Header user={session.user} role={session.user.role} />
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
