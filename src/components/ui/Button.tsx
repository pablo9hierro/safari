import { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-vr-red hover:bg-vr-red-dark text-white shadow-lg shadow-red-900/30',
  secondary: 'bg-vr-graphite hover:bg-vr-graphite-light text-white border border-white/10',
  outline: 'border-2 border-vr-red text-vr-red hover:bg-vr-red hover:text-white',
  ghost: 'text-vr-gray hover:text-white',
}

export default function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      className={`font-semibold py-3 px-6 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
