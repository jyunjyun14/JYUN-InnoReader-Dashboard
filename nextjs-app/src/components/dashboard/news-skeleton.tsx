function SkeletonBox({ className }: { className?: string }) {
  return <div className={`shimmer rounded ${className ?? ''}`} />
}

export function NewsCardSkeleton() {
  return (
    <div
      className="bg-card border border-border rounded-lg p-4"
      aria-hidden="true"
    >
      <div className="flex gap-3">
        {/* 체크박스 */}
        <SkeletonBox className="w-4 h-4 shrink-0 mt-1" />

        <div className="flex-1 min-w-0 space-y-2">
          {/* 제목 2줄 */}
          <SkeletonBox className="h-4 w-3/4" />
          <SkeletonBox className="h-4 w-1/2" />

          {/* 메타 */}
          <div className="flex gap-2 mt-2">
            <SkeletonBox className="h-3 w-20" />
            <SkeletonBox className="h-3 w-28" />
            <SkeletonBox className="h-3 w-8 ml-auto" />
          </div>

          {/* 스니펫 */}
          <div className="space-y-1.5 mt-2">
            <SkeletonBox className="h-3 w-full" />
            <SkeletonBox className="h-3 w-5/6" />
          </div>

          {/* 링크 */}
          <SkeletonBox className="h-3 w-16 mt-1" />
        </div>

        {/* 썸네일 */}
        <SkeletonBox className="w-20 h-16 shrink-0" />
      </div>
    </div>
  )
}

export function NewsSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-label="기사 불러오는 중...">
      {Array.from({ length: count }).map((_, i) => (
        <NewsCardSkeleton key={i} />
      ))}
    </div>
  )
}
