import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'

/** SHA-1(sourceText + ':' + targetLang) */
function buildHash(text: string, targetLang: string): string {
  return createHash('sha1')
    .update(`${text.trim()}:${targetLang}`)
    .digest('hex')
}

/** 캐시 일괄 조회 → Map<원문, { translated, provider }> */
export async function lookupCache(
  texts: string[],
  targetLang: string
): Promise<Map<string, { translated: string; provider: string }>> {
  if (texts.length === 0) return new Map()

  const hashes = texts.map((t) => buildHash(t, targetLang))

  const rows = await prisma.translationCache.findMany({
    where: { textHash: { in: hashes } },
    select: { sourceText: true, translated: true, provider: true },
  })

  return new Map(rows.map((r) => [r.sourceText, { translated: r.translated, provider: r.provider }]))
}

/** 번역 결과를 DB에 일괄 저장 (upsert, 오류 무시) */
export async function writeCache(
  items: Array<{
    original: string
    translated: string
    sourceLang: string
    provider: string
  }>,
  targetLang: string
): Promise<void> {
  if (items.length === 0) return

  await Promise.allSettled(
    items.map((item) =>
      prisma.translationCache.upsert({
        where: { textHash: buildHash(item.original, targetLang) },
        update: {
          translated: item.translated,
          provider: item.provider,
        },
        create: {
          textHash: buildHash(item.original, targetLang),
          sourceText: item.original,
          translated: item.translated,
          sourceLang: item.sourceLang,
          targetLang,
          provider: item.provider,
        },
      })
    )
  )
}
