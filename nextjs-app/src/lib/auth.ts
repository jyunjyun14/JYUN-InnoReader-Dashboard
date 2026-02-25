import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    // "로그인 상태 유지" 미체크: 브라우저 세션 종료 시 만료 (30분)
    // "로그인 상태 유지" 체크: 30일 유지
    // → 실제 maxAge는 로그인 폼에서 signIn() 호출 시 결정할 수 없으므로
    //   쿠키 옵션으로 처리합니다. 기본값은 30일.
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    newUser: '/register',
    error: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: '이메일', type: 'email' },
        password: { label: '비밀번호', type: 'password' },
        rememberMe: { label: '로그인 상태 유지', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('이메일과 비밀번호를 입력해주세요.')
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user || !user.hashedPassword) {
          throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.')
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.hashedPassword
        )

        if (!isPasswordValid) {
          throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.')
        }

        // ADMIN_EMAIL 환경변수에 등록된 이메일이면 자동으로 ADMIN 승격
        let role = user.role
        const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase()
        if (adminEmail && user.email.toLowerCase() === adminEmail && user.role !== 'ADMIN') {
          await prisma.user.update({
            where: { id: user.id },
            data: { role: 'ADMIN' },
          })
          role = 'ADMIN'
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role,
          rememberMe: credentials.rememberMe === 'true',
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        // "로그인 상태 유지" 미체크 시 세션 만료 시간을 짧게 설정
        if ((user as any).rememberMe === false) {
          token.exp = Math.floor(Date.now() / 1000) + 30 * 60 // 30분
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    },
  },
}
