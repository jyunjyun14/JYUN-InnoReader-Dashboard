import { prisma } from './prisma'

/** DB에서 ADMIN 유저의 ID를 조회. 없으면 null. */
export async function getAdminUserId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  return admin?.id ?? null
}
