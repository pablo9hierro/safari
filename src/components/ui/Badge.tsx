import { ReactNode } from 'react'

export type BadgeColor = 'gray' | 'red' | 'green' | 'yellow' | 'blue' | 'purple' | 'orange' | 'indigo' | 'rose'

const COLOR_CLASSES: Record<BadgeColor, string> = {
  gray: 'bg-zinc-100 text-zinc-700',
  red: 'bg-red-100 text-red-700',
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  rose: 'bg-rose-100 text-rose-700',
}

export default function Badge({
  children,
  color = 'gray',
  icon,
  className = '',
}: {
  children: ReactNode
  color?: BadgeColor
  icon?: ReactNode
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full w-fit ${COLOR_CLASSES[color]} ${className}`}>
      {icon}
      {children}
    </span>
  )
}
