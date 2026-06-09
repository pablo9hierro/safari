import { HTMLAttributes, ReactNode } from 'react'

export default function Card({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`bg-white rounded-2xl shadow-xl ${className}`} {...props}>
      {children}
    </div>
  )
}

export function DarkCard({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`bg-vr-graphite border border-white/5 rounded-2xl ${className}`} {...props}>
      {children}
    </div>
  )
}
