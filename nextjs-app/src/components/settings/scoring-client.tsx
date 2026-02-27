'use client'

import { useState, useMemo, useCallback } from 'react'
import { Plus, X, Save, RotateCcw, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  DEFAULT_SCORING_CONFIG,
  DEFAULT_SOURCE_TIERS,
  TIER1_DOMAINS,
  TIER2_DOMAINS,
  scoreWithBreakdown,
  type ScoringConfig,
  type PriorityKeyword,
} from '@/lib/scoring'

// ── 타입 ──────────────────────────────────────────────────────
type WeightKey = 'weightKeyword' | 'weightPriority' | 'weightSource' | 'weightRecency'
type Tab = 'weights' | 'priority' | 'exclude' | 'sources'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface CategoryPriorityKeyword {
  term: string
  weight: number
}

interface CategoryWithExclude {
  id: string
  name: string
  color: string
  keywords: { id: string; term: string }[]
  priorityKeywords: CategoryPriorityKeyword[]
  excludeKeywords: string[]
}

interface Props {
  initialConfig: ScoringConfig
  initialCategories: CategoryWithExclude[]
}

// ── 프리뷰용 샘플 데이터 ───────────────────────────────────────
const SAMPLE_QUERY = 'AI OR drug discovery'
const NOW = Date.now()
const SAMPLE_ARTICLES = [
  {
    title: 'AI Discovers Novel Drug Compound for Cancer Treatment',
    snippet:
      'Researchers at Stanford used AI drug discovery methods to identify a promising candidate targeting cancer cells with 90% efficacy in clinical trials.',
    source: 'nature.com',
    publishedAt: new Date(NOW - 2 * 3_600_000).toISOString(),    // 2h ago
  },
  {
    title: 'Digital Health AI Startup Raises $50M in Series B',
    snippet:
      'A digital health company focused on AI-powered diagnostics has secured significant funding to expand its platform across Asia.',
    source: 'fiercepharma.com',
    publishedAt: new Date(NOW - 4 * 86_400_000).toISOString(),   // 4d ago
  },
  {
    title: 'Healthcare Stock Rally Continues Amid Market Uncertainty',
    snippet:
      'Healthcare stocks saw gains this week as investor confidence grows following regulatory approvals for new treatments.',
    source: 'unknown-news.com',
    publishedAt: new Date(NOW - 20 * 86_400_000).toISOString(),  // 20d ago
  },
] as const

// ── 색상 ──────────────────────────────────────────────────────
const WEIGHT_META: Record<WeightKey, { label: string; bg: string; hex: string; accent: string; desc: string }> = {
  weightKeyword:  { label: '키워드 매칭', bg: 'bg-violet-500', hex: '#7C3AED', accent: 'accent-violet-600', desc: '제목·스니펫 키워드 포함 여부 (+20/+10점)' },
  weightPriority: { label: '우선 키워드', bg: 'bg-blue-500',   hex: '#3B82F6', accent: 'accent-blue-600',   desc: '우선 키워드 가중치 보너스 (1~5배)' },
  weightSource:   { label: '매체 신뢰도', bg: 'bg-emerald-500', hex: '#10B981', accent: 'accent-emerald-600', desc: '1티어 100%, 2티어 50%' },
  weightRecency:  { label: '최신성',      bg: 'bg-amber-400',  hex: '#F59E0B', accent: 'accent-amber-500',  desc: '24h→100%, 3d→75%, 7d→50%, 30d→25%' },
}
const ALL_WEIGHT_KEYS: WeightKey[] = ['weightKeyword', 'weightPriority', 'weightSource', 'weightRecency']

// ── 헬퍼 함수 ─────────────────────────────────────────────────
function weightTotal(c: ScoringConfig) {
  return ALL_WEIGHT_KEYS.reduce((s, k) => s + (c[k] as number), 0)
}

function normalizeWeights(c: ScoringConfig): ScoringConfig {
  const total = weightTotal(c)
  if (total === 0)
    return { ...c, weightKeyword: 40, weightPriority: 20, weightSource: 20, weightRecency: 20 }
  const f = 100 / total
  return {
    ...c,
    weightKeyword:  Math.round(c.weightKeyword  * f),
    weightPriority: Math.round(c.weightPriority * f),
    weightSource:   Math.round(c.weightSource   * f),
    weightRecency:  Math.round(c.weightRecency  * f),
  }
}

/**
 * 연동 슬라이더: changedKey를 newRaw로 변경하면 나머지가 비례 조정되어 합계 100 유지
 */
function adjustLinked(config: ScoringConfig, changedKey: WeightKey, newRaw: number): ScoringConfig {
  const clamped = Math.max(0, Math.min(100, Math.round(newRaw)))
  const oldVal  = config[changedKey] as number
  const delta   = clamped - oldVal
  if (delta === 0) return config

  const otherKeys    = ALL_WEIGHT_KEYS.filter((k) => k !== changedKey)
  const totalOthers  = otherKeys.reduce((s, k) => s + (config[k] as number), 0)
  const result       = { ...config, [changedKey]: clamped } as ScoringConfig

  if (totalOthers === 0) {
    if (delta < 0) {
      // 다른 값이 모두 0인데 changedKey를 낮추는 경우 → 차이를 균등 배분
      const freed  = -delta
      const share  = Math.floor(freed / otherKeys.length)
      let remainder = freed - share * otherKeys.length
      otherKeys.forEach((k) => {
        const extra = remainder > 0 ? 1 : 0
        remainder -= extra
        ;(result as unknown as Record<string, unknown>)[k] = share + extra
      })
    }
    return result
  }

  // 비례 감소/증가
  const rawAdjusted = otherKeys.map((k) => ({
    key: k,
    val: Math.max(0, (config[k] as number) - delta * ((config[k] as number) / totalOthers)),
  }))

  const rounded = rawAdjusted.map((o) => ({ ...o, val: Math.round(o.val) }))
  const sumRounded = rounded.reduce((s, o) => s + o.val, 0)
  const diff = (100 - clamped) - sumRounded

  // 반올림 오차를 가장 큰 항목에 보정
  if (diff !== 0 && rounded.length > 0) {
    const maxIdx = rounded.reduce((best, _, i) => (rounded[i].val > rounded[best].val ? i : best), 0)
    rounded[maxIdx].val = Math.max(0, rounded[maxIdx].val + diff)
  }

  rounded.forEach((o) => { (result as unknown as Record<string, unknown>)[o.key] = o.val })
  return result
}

// ── SVG 도넛 차트 ─────────────────────────────────────────────
function DonutChart({ config }: { config: ScoringConfig }) {
  const R  = 38
  const C  = 2 * Math.PI * R   // ≈ 238.76
  const CX = 50
  const CY = 50
  const SW = 16
  const GAP = 3  // 세그먼트 사이 간격 (circumference px)

  const total = weightTotal(config) || 1
  let cumul = 0

  const segments = ALL_WEIGHT_KEYS.map((k) => {
    const val    = config[k] as number
    const rawLen = (val / total) * C
    const len    = Math.max(0, rawLen - GAP)
    const offset = C - cumul
    cumul += rawLen
    return { key: k, len, offset }
  })

  return (
    <div className="relative w-36 h-36 shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
        {/* 배경 트랙 */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#EDE9FE" strokeWidth={SW} />
        {segments.map((seg) =>
          seg.len > 0 ? (
            <circle
              key={seg.key}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={WEIGHT_META[seg.key as WeightKey].hex}
              strokeWidth={SW}
              strokeDasharray={`${seg.len} ${C - seg.len}`}
              strokeDashoffset={seg.offset}
              strokeLinecap="butt"
            />
          ) : null
        )}
      </svg>
      {/* 중앙 텍스트 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-lg font-bold text-foreground leading-none">{total}</span>
        <span className="text-[10px] text-muted-foreground">점</span>
      </div>
    </div>
  )
}

// ── 스코어 프리뷰 패널 ─────────────────────────────────────────
function ScorePreviewPanel({ config }: { config: ScoringConfig }) {
  const breakdowns = useMemo(
    () =>
      SAMPLE_ARTICLES.map((a) =>
        scoreWithBreakdown({ ...a, searchQuery: SAMPLE_QUERY }, config)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      config.weightKeyword, config.weightPriority, config.weightSource, config.weightRecency,
      config.priorityKeywords, config.excludeKeywords, config.sourceTiers,
    ]
  )

  function badgeClass(total: number) {
    if (total >= 85) return 'bg-violet-700 text-white'
    if (total >= 70) return 'bg-violet-500 text-white'
    if (total >= 50) return 'bg-violet-200 text-violet-900'
    if (total >= 30) return 'bg-amber-200 text-amber-800'
    return 'bg-gray-100 text-gray-500'
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-foreground">실시간 스코어 프리뷰</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          검색어: <code className="font-mono bg-secondary px-1 rounded">{SAMPLE_QUERY}</code>
        </p>
      </div>

      {SAMPLE_ARTICLES.map((article, i) => {
        const bd = breakdowns[i]
        return (
          <div key={i} className="rounded-lg border border-border bg-background p-3 space-y-2">
            {/* 점수 배지 + 제목 */}
            <div className="flex items-start gap-2">
              <span className={cn('shrink-0 mt-0.5 text-xs font-bold px-1.5 py-0.5 rounded min-w-[2rem] text-center', badgeClass(bd.total))}>
                {Math.round(bd.total)}
              </span>
              <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
                {article.title}
              </p>
            </div>

            {/* 출처 */}
            <p className="text-[11px] text-muted-foreground">{article.source}</p>

            {/* 컴포넌트별 점수 막대 */}
            <div className="space-y-1">
              <BreakdownRow label="키워드" val={bd.keyword}  max={config.weightKeyword  || 1} color="bg-violet-500" />
              <BreakdownRow label="우선KW" val={bd.priority} max={config.weightPriority || 1} color="bg-blue-500" />
              <BreakdownRow label="매체"   val={bd.source}   max={config.weightSource   || 1} color="bg-emerald-500" />
              <BreakdownRow label="최신성" val={bd.recency}  max={config.weightRecency  || 1} color="bg-amber-400" />
              {bd.penalty < 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground w-10 shrink-0">제외</span>
                  <span className="text-[10px] font-semibold text-destructive">−30점</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BreakdownRow({ label, val, max, color }: { label: string; val: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (val / max) * 100) : 0
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground w-10 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-200', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground w-7 text-right">{Math.round(val)}</span>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export function ScoringClient({ initialConfig, initialCategories }: Props) {
  const [config, setConfig] = useState<ScoringConfig>(initialConfig)
  const [categories, setCategories] = useState<CategoryWithExclude[]>(initialCategories)
  const [tab,    setTab]    = useState<Tab>('weights')
  const [status, setStatus] = useState<SaveStatus>('idle')

  const total        = weightTotal(config)
  const isNormalized = total === 100

  const handleSave = useCallback(async () => {
    setStatus('saving')
    try {
      const toSave = isNormalized ? config : normalizeWeights(config)
      const res = await fetch('/api/scoring-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSave),
      })
      if (!res.ok) throw new Error('저장 실패')
      const saved: ScoringConfig = await res.json()
      setConfig(saved)
      setStatus('saved')
      toast.success('스코어링 설정이 저장되었습니다')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('error')
      toast.error('설정 저장에 실패했습니다. 다시 시도해주세요.')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }, [config, isNormalized])

  const handleReset = () => setConfig({ ...DEFAULT_SCORING_CONFIG, sourceTiers: DEFAULT_SOURCE_TIERS })

  const TABS: { id: Tab; label: string }[] = [
    { id: 'weights',  label: '가중치' },
    { id: 'priority', label: '우선 키워드' },
    { id: 'exclude',  label: '제외 키워드' },
    { id: 'sources',  label: '매체 티어' },
  ]

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">스코어링 설정</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            뉴스 기사 적합도 점수 계산 방식을 커스텀합니다 (0~100점)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5" /> 초기화
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={status === 'saving'}>
            {status === 'saving' ? '저장 중...'
             : status === 'saved'  ? <><Check className="h-3.5 w-3.5" /> 저장됨</>
             : status === 'error'  ? '오류 발생'
             : <><Save className="h-3.5 w-3.5" /> 저장하기</>}
          </Button>
        </div>
      </div>

      {/* 2컬럼 그리드 */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
        {/* 왼쪽: 탭 + 탭 콘텐츠 */}
        <div>
          <div className="flex gap-1 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                  tab === t.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="pt-5">
            {tab === 'weights'  && <WeightsTab  config={config} onChange={setConfig} />}
            {tab === 'priority' && <PriorityTab categories={categories} onCategoriesChange={setCategories} />}
            {tab === 'exclude'  && <ExcludeTab  categories={categories} onCategoriesChange={setCategories} />}
            {tab === 'sources'  && <SourcesTab  config={config} onChange={setConfig} />}
          </div>
        </div>

        {/* 오른쪽: sticky 프리뷰 */}
        <div className="sticky top-6">
          <div className="rounded-xl border border-border bg-card p-4">
            <ScorePreviewPanel config={config} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 1. 가중치 탭 ──────────────────────────────────────────────
function WeightsTab({ config, onChange }: { config: ScoringConfig; onChange: (c: ScoringConfig) => void }) {
  const total = weightTotal(config)
  const isOk  = total === 100

  return (
    <div className="space-y-6">
      {/* 도넛 차트 + 범례 */}
      <div className="flex items-center gap-5">
        <DonutChart config={config} />
        <div className="flex-1 space-y-1.5">
          {ALL_WEIGHT_KEYS.map((k) => {
            const val = config[k] as number
            const pct = total > 0 ? Math.round((val / total) * 100) : 0
            return (
              <div key={k} className="flex items-center gap-2">
                <span className={cn('w-2.5 h-2.5 rounded-sm shrink-0', WEIGHT_META[k].bg)} />
                <span className="text-xs text-muted-foreground w-[4.5rem]">{WEIGHT_META[k].label}</span>
                <span className="text-xs font-semibold text-foreground w-8">{val}점</span>
                <span className="text-xs text-muted-foreground">({pct}%)</span>
              </div>
            )
          })}
          <div className={cn('text-xs font-medium pt-1 border-t border-border mt-0.5', isOk ? 'text-emerald-600' : 'text-amber-600')}>
            합계: {total}점 {isOk ? '✓' : '— 저장 시 자동 정규화'}
          </div>
        </div>
      </div>

      <Separator />

      {/* 연동 슬라이더 */}
      <div className="space-y-5">
        {ALL_WEIGHT_KEYS.map((k) => {
          const { label, accent, desc } = WEIGHT_META[k]
          const val = config[k] as number
          return (
            <div key={k} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">{label}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={val}
                  onChange={(e) => onChange(adjustLinked(config, k, parseInt(e.target.value) || 0))}
                  className="w-16 h-8 px-2 text-right text-sm border border-border rounded bg-background"
                />
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={val}
                onChange={(e) => onChange(adjustLinked(config, k, parseInt(e.target.value)))}
                className={cn('w-full h-2', accent)}
              />
            </div>
          )
        })}
      </div>

      {/* 공식 설명 */}
      <div className="bg-secondary/50 rounded-lg p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground mb-1.5">점수 계산 공식</p>
        <p>총점 = 키워드 + 우선키워드 + 매체신뢰도 + 최신성 − 제외키워드(−30점)</p>
        <p>• 제목 키워드 일치: +20점, 정확한 단어 일치 추가 +10점</p>
        <p>• 스니펫 키워드 일치: +10점 (최대 설정값)</p>
        <p>• 제외 키워드 포함 시: −30점 감점 (최솟값 0점)</p>
      </div>
    </div>
  )
}

// ── 2. 우선 키워드 탭 (분야별) ────────────────────────────────
function PriorityTab({
  categories,
  onCategoriesChange,
}: {
  categories: CategoryWithExclude[]
  onCategoriesChange: (cats: CategoryWithExclude[]) => void
}) {
  if (categories.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        분야가 없습니다.{' '}
        <a href="/settings/keywords" className="text-primary hover:underline">
          키워드 설정
        </a>
        에서 분야를 먼저 추가하세요.
      </div>
    )
  }

  function handleUpdate(categoryId: string, keywords: CategoryPriorityKeyword[]) {
    onCategoriesChange(
      categories.map((c) => (c.id === categoryId ? { ...c, priorityKeywords: keywords } : c))
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        분야별로 <strong className="text-foreground">가중치 보너스</strong>를 줄 키워드를 설정합니다.
        해당 키워드가 기사에 포함되면 스코어가 올라갑니다.
      </p>
      {categories.map((cat) => (
        <CategoryPrioritySection
          key={cat.id}
          category={cat}
          onUpdate={(kws) => handleUpdate(cat.id, kws)}
        />
      ))}
    </div>
  )
}

const WEIGHT_LABELS: Record<number, string> = { 1: '낮음', 2: '보통-', 3: '보통', 4: '높음', 5: '최고' }

function CategoryPrioritySection({
  category,
  onUpdate,
}: {
  category: CategoryWithExclude
  onUpdate: (keywords: CategoryPriorityKeyword[]) => void
}) {
  const [input, setInput]   = useState('')
  const [weight, setWeight] = useState(3)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function save(keywords: CategoryPriorityKeyword[]) {
    setSaveStatus('saving')
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priorityKeywords: keywords }),
      })
      if (!res.ok) throw new Error()
      onUpdate(keywords)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }

  function addKeyword() {
    const t = input.trim()
    if (!t) return
    if (category.priorityKeywords.some((pk) => pk.term.toLowerCase() === t.toLowerCase())) return
    const next = [...category.priorityKeywords, { term: t, weight }]
    setInput('')
    setWeight(3)
    save(next)
  }

  function removeKeyword(term: string) {
    save(category.priorityKeywords.filter((k) => k.term !== term))
  }

  function updateWeight(term: string, w: number) {
    save(category.priorityKeywords.map((k) => k.term === term ? { ...k, weight: w } : k))
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* 분야 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: `var(--${category.color}-500, #7C3AED)` }}
          />
          <span className="text-sm font-semibold text-foreground">{category.name}</span>
          <span className="text-xs text-muted-foreground">
            ({category.priorityKeywords.length}개)
          </span>
        </div>
        <span className={cn(
          'text-xs font-medium',
          saveStatus === 'saved'  ? 'text-emerald-600' :
          saveStatus === 'error'  ? 'text-destructive' :
          saveStatus === 'saving' ? 'text-muted-foreground' : 'hidden'
        )}>
          {saveStatus === 'saving' ? '저장 중...' :
           saveStatus === 'saved'  ? '✓ 저장됨' :
           saveStatus === 'error'  ? '저장 실패' : ''}
        </span>
      </div>

      {/* 입력 */}
      <div className="flex gap-2">
        <Input
          placeholder="우선 키워드 입력 후 Enter (예: 의료 관세)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
          className="flex-1 h-8 text-sm"
        />
        <select
          value={weight}
          onChange={(e) => setWeight(Number(e.target.value))}
          className="h-8 px-2 rounded border border-border text-xs bg-background"
        >
          {[1, 2, 3, 4, 5].map((w) => (
            <option key={w} value={w}>{w}× ({WEIGHT_LABELS[w]})</option>
          ))}
        </select>
        <Button onClick={addKeyword} size="sm" className="gap-1 h-8 px-3">
          <Plus className="h-3.5 w-3.5" /> 추가
        </Button>
      </div>

      {/* 키워드 목록 */}
      {category.priorityKeywords.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">이 분야의 우선 키워드가 없습니다.</p>
      ) : (
        <div className="space-y-1.5">
          {category.priorityKeywords.map((pk) => (
            <div
              key={pk.term}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-background"
            >
              <span className="flex-1 text-xs font-medium text-foreground">{pk.term}</span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((w) => (
                  <button
                    key={w}
                    onClick={() => updateWeight(pk.term, w)}
                    className={cn(
                      'w-6 h-6 rounded text-[10px] font-semibold transition-colors',
                      pk.weight === w
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
                    )}
                  >
                    {w}
                  </button>
                ))}
                <span className="text-[10px] text-muted-foreground ml-1 w-10">{WEIGHT_LABELS[pk.weight]}</span>
              </div>
              <button
                onClick={() => removeKeyword(pk.term)}
                className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 3. 제외 키워드 탭 (분야별) ────────────────────────────────
function ExcludeTab({
  categories,
  onCategoriesChange,
}: {
  categories: CategoryWithExclude[]
  onCategoriesChange: (cats: CategoryWithExclude[]) => void
}) {
  if (categories.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        분야가 없습니다.{' '}
        <a href="/settings/keywords" className="text-primary hover:underline">
          키워드 설정
        </a>
        에서 분야를 먼저 추가하세요.
      </div>
    )
  }

  function handleUpdate(categoryId: string, keywords: string[]) {
    onCategoriesChange(
      categories.map((c) => (c.id === categoryId ? { ...c, excludeKeywords: keywords } : c))
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        분야별로 제외할 키워드를 설정합니다. 해당 키워드가 포함된 기사는{' '}
        <strong className="text-destructive">−30점</strong> 감점됩니다.
      </p>
      {categories.map((cat) => (
        <CategoryExcludeSection
          key={cat.id}
          category={cat}
          onUpdate={(kws) => handleUpdate(cat.id, kws)}
        />
      ))}
    </div>
  )
}

function CategoryExcludeSection({
  category,
  onUpdate,
}: {
  category: CategoryWithExclude
  onUpdate: (keywords: string[]) => void
}) {
  const [input, setInput] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function save(keywords: string[]) {
    setSaveStatus('saving')
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludeKeywords: keywords }),
      })
      if (!res.ok) throw new Error()
      onUpdate(keywords)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }

  function addKeyword() {
    const t = input.trim()
    if (!t || category.excludeKeywords.includes(t)) return
    const next = [...category.excludeKeywords, t]
    setInput('')
    save(next)
  }

  function removeKeyword(kw: string) {
    save(category.excludeKeywords.filter((k) => k !== kw))
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* 분야 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn(
            'w-2.5 h-2.5 rounded-full shrink-0',
            `bg-${category.color}-500`
          )} style={{ backgroundColor: `var(--${category.color}-500, #7C3AED)` }} />
          <span className="text-sm font-semibold text-foreground">{category.name}</span>
          <span className="text-xs text-muted-foreground">
            ({category.excludeKeywords.length}개)
          </span>
        </div>
        <span className={cn(
          'text-xs font-medium',
          saveStatus === 'saved' ? 'text-emerald-600' :
          saveStatus === 'error' ? 'text-destructive' :
          saveStatus === 'saving' ? 'text-muted-foreground' : 'hidden'
        )}>
          {saveStatus === 'saving' ? '저장 중...' :
           saveStatus === 'saved'  ? '✓ 저장됨' :
           saveStatus === 'error'  ? '저장 실패' : ''}
        </span>
      </div>

      {/* 입력 */}
      <div className="flex gap-2">
        <Input
          placeholder="제외 키워드 입력 후 Enter (예: 주식, stock price)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
          className="flex-1 h-8 text-sm"
        />
        <Button onClick={addKeyword} size="sm" variant="destructive" className="gap-1 h-8 px-3">
          <Plus className="h-3.5 w-3.5" /> 추가
        </Button>
      </div>

      {/* 키워드 목록 */}
      {category.excludeKeywords.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">이 분야의 제외 키워드가 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {category.excludeKeywords.map((kw) => (
            <span
              key={kw}
              className="flex items-center gap-1 px-2.5 py-1 bg-destructive/10 text-destructive rounded-full text-xs font-medium border border-destructive/20"
            >
              {kw}
              <button onClick={() => removeKeyword(kw)} className="hover:opacity-70 ml-0.5">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 4. 매체 티어 탭 ───────────────────────────────────────────
function SourcesTab({ config, onChange }: { config: ScoringConfig; onChange: (c: ScoringConfig) => void }) {
  const [domain, setDomain] = useState('')
  const [tier,   setTier]   = useState<1 | 2>(1)

  function addSource() {
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
    if (!d) return
    onChange({ ...config, sourceTiers: { ...config.sourceTiers, [d]: tier } })
    setDomain('')
    setTier(1)
  }

  const tier1Entries = Object.entries(config.sourceTiers).filter(([, t]) => t === 1)
  const tier2Entries = Object.entries(config.sourceTiers).filter(([, t]) => t === 2)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          1티어 +{config.weightSource}점, 2티어 +{Math.round(config.weightSource * 0.5)}점
          <span className="ml-1 text-xs">(가중치 탭에서 조정)</span>
        </p>
        <Button
          variant="ghost" size="sm" className="text-xs gap-1"
          onClick={() => onChange({ ...config, sourceTiers: DEFAULT_SOURCE_TIERS })}
        >
          <RotateCcw className="h-3 w-3" /> 기본값 복원
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="도메인 입력 (예: nature.com)"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSource()}
          className="flex-1"
        />
        <select
          value={tier}
          onChange={(e) => setTier(Number(e.target.value) as 1 | 2)}
          className="h-9 px-2 rounded border border-border text-sm bg-background"
        >
          <option value={1}>1티어 (신뢰도 높음)</option>
          <option value={2}>2티어 (전문 매체)</option>
        </select>
        <Button onClick={addSource} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> 추가
        </Button>
      </div>

      <Separator />

      <SourceTierSection
        label="1티어 매체"
        labelClass="bg-violet-100 text-violet-700 border-violet-200"
        bonus={`+${config.weightSource}점`}
        entries={tier1Entries}
        isDefault={(d) => TIER1_DOMAINS.includes(d)}
        currentTier={1}
        onRemove={(d) => { const next = { ...config.sourceTiers }; delete next[d]; onChange({ ...config, sourceTiers: next }) }}
        onChangeTier={(d, t) => onChange({ ...config, sourceTiers: { ...config.sourceTiers, [d]: t } })}
      />

      <Separator />

      <SourceTierSection
        label="2티어 매체"
        labelClass="bg-blue-100 text-blue-700 border-blue-200"
        bonus={`+${Math.round(config.weightSource * 0.5)}점`}
        entries={tier2Entries}
        isDefault={(d) => TIER2_DOMAINS.includes(d)}
        currentTier={2}
        onRemove={(d) => { const next = { ...config.sourceTiers }; delete next[d]; onChange({ ...config, sourceTiers: next }) }}
        onChangeTier={(d, t) => onChange({ ...config, sourceTiers: { ...config.sourceTiers, [d]: t } })}
      />
    </div>
  )
}

function SourceTierSection({
  label, labelClass, bonus, entries, isDefault, currentTier, onRemove, onChangeTier,
}: {
  label: string
  labelClass: string
  bonus: string
  entries: [string, 1 | 2][]
  isDefault: (d: string) => boolean
  currentTier: 1 | 2
  onRemove: (d: string) => void
  onChangeTier: (d: string, t: 1 | 2) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', labelClass)}>{label}</span>
        <span className="text-xs text-muted-foreground">{bonus}</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">해당 티어에 매체가 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {entries.map(([domain]) => (
            <div
              key={domain}
              className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border bg-card text-sm"
            >
              <span className="text-foreground">{domain}</span>
              {isDefault(domain) && <span className="text-[10px] text-muted-foreground/50">기본</span>}
              <button
                onClick={() => onChangeTier(domain, currentTier === 1 ? 2 : 1)}
                className="text-[10px] text-muted-foreground hover:text-primary px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                title={`${currentTier === 1 ? '2티어' : '1티어'}로 이동`}
              >
                → {currentTier === 1 ? '2' : '1'}티어
              </button>
              <button
                onClick={() => onRemove(domain)}
                className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
