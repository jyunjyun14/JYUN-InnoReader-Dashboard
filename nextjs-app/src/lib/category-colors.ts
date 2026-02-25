export interface ColorOption {
  id: string
  label: string
  dot: string
  bg: string
  text: string
  border: string
  badge: string
}

// Tailwind 클래스를 문자열로 보관 → JIT 빌드 시 모두 포함됨
export const CATEGORY_COLORS: ColorOption[] = [
  {
    id: 'violet',
    label: '보라',
    dot: 'bg-violet-500',
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    border: 'border-violet-200',
    badge: 'bg-violet-100 text-violet-700 border-violet-200',
  },
  {
    id: 'blue',
    label: '파랑',
    dot: 'bg-blue-500',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  {
    id: 'cyan',
    label: '청록',
    dot: 'bg-cyan-500',
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    border: 'border-cyan-200',
    badge: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  },
  {
    id: 'green',
    label: '초록',
    dot: 'bg-green-500',
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    badge: 'bg-green-100 text-green-700 border-green-200',
  },
  {
    id: 'emerald',
    label: '에메랄드',
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  {
    id: 'amber',
    label: '노랑',
    dot: 'bg-amber-500',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  {
    id: 'orange',
    label: '주황',
    dot: 'bg-orange-500',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    badge: 'bg-orange-100 text-orange-700 border-orange-200',
  },
  {
    id: 'red',
    label: '빨강',
    dot: 'bg-red-500',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700 border-red-200',
  },
  {
    id: 'pink',
    label: '분홍',
    dot: 'bg-pink-500',
    bg: 'bg-pink-50',
    text: 'text-pink-700',
    border: 'border-pink-200',
    badge: 'bg-pink-100 text-pink-700 border-pink-200',
  },
  {
    id: 'indigo',
    label: '남색',
    dot: 'bg-indigo-500',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    badge: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  },
]

export function getColor(id: string): ColorOption {
  return CATEGORY_COLORS.find((c) => c.id === id) ?? CATEGORY_COLORS[0]
}
