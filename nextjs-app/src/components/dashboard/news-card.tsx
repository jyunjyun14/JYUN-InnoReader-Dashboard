'use client'

import Image from 'next/image'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/news'

interface NewsCardProps {
  item: NewsItem
  checked: boolean
  onCheckedChange: (url: string, checked: boolean) => void
}

function getScoreBadgeClass(score0to10: number) {
  const s = score0to10 * 10
  if (s >= 85) return 'bg-violet-700 text-white'
  if (s >= 70) return 'bg-violet-500 text-white'
  if (s >= 50) return 'bg-violet-200 text-violet-900'
  if (s >= 30) return 'bg-amber-200 text-amber-800'
  return 'bg-gray-100 text-gray-500'
}

function formatDate(iso: string | null) {
  if (!iso) return '날짜 없음'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '날짜 없음'
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
}

const COUNTRY_FLAGS: Record<string, string> = {
  us: '🇺🇸', gb: '🇬🇧', au: '🇦🇺', ca: '🇨🇦',
  jp: '🇯🇵', kr: '🇰🇷', cn: '🇨🇳', in: '🇮🇳', sg: '🇸🇬',
  ae: '🇦🇪', sa: '🇸🇦', il: '🇮🇱', de: '🇩🇪', fr: '🇫🇷',
}

export function NewsCard({ item, checked, onCheckedChange }: NewsCardProps) {
  const score = Math.round(item.relevanceScore * 10)

  return (
    <article
      className={cn(
        'bg-card border rounded-lg p-4 transition-colors duration-150',
        checked ? 'border-violet-400 bg-violet-100' : 'border-border hover:border-border/80 hover:shadow-sm'
      )}
    >
      <div className="flex gap-3">
        {/* 체크박스 */}
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(item.link, e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-violet-600 cursor-pointer"
          aria-label={`선택: ${item.title}`}
        />

        {/* 본문 */}
        <div className="flex-1 min-w-0">
          {/* 제목: 한국어 번역 (있으면) + 원문 */}
          <div>
            <p className="text-sm font-semibold text-foreground leading-snug">
              {item.titleKo || item.title}
            </p>
            {item.titleKo && item.titleKo !== item.title && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                {item.title}
              </p>
            )}
          </div>

          {/* 메타 정보 */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/70">{item.source}</span>
            <span>·</span>
            <span>{formatDate(item.publishedAt)}</span>
            {item.country && (
              <>
                <span>·</span>
                <span title={item.country.toUpperCase()}>
                  {COUNTRY_FLAGS[item.country] ?? item.country.toUpperCase()}
                </span>
              </>
            )}
            <span className={cn('ml-auto px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums', getScoreBadgeClass(item.relevanceScore))}>
              {score}
            </span>
          </div>

          {/* 스니펫 */}
          {item.snippet && (
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {item.snippet}
            </p>
          )}

          {/* 원문 링크 */}
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
          >
            원문 보기
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* 썸네일 */}
        {item.thumbnailUrl && (
          <div className="relative w-20 h-16 shrink-0 rounded overflow-hidden bg-muted">
            <Image
              src={item.thumbnailUrl}
              alt=""
              fill
              className="object-cover"
              sizes="80px"
              onError={(e) => {
                // 이미지 로드 실패 시 숨기기
                ;(e.currentTarget as HTMLElement).parentElement!.style.display = 'none'
              }}
            />
          </div>
        )}
      </div>
    </article>
  )
}
