import { prisma } from '@/lib/prisma'

const DEFAULT_TEMPLATES = [
  {
    name: '바이오헬스 일반',
    color: 'emerald',
    keywords: ['biohealth', 'healthcare innovation'],
  },
  {
    name: '디지털 헬스',
    color: 'blue',
    keywords: ['digital health', 'telemedicine', 'mHealth'],
  },
  {
    name: '의료 AI',
    color: 'violet',
    keywords: ['medical AI', 'clinical AI', 'healthcare machine learning'],
  },
]

export async function createDefaultCategories(userId: string): Promise<void> {
  for (const template of DEFAULT_TEMPLATES) {
    await prisma.category.create({
      data: {
        userId,
        name: template.name,
        color: template.color,
        keywords: {
          create: template.keywords.map((term) => ({ term })),
        },
      },
    })
  }
}
