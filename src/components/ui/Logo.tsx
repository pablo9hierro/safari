const SIZES = {
  sm: { word: 'text-lg', tag: 'text-[9px]' },
  md: { word: 'text-2xl', tag: 'text-[10px]' },
  lg: { word: 'text-4xl sm:text-5xl', tag: 'text-xs' },
} as const

export default function Logo({
  size = 'md',
  showTagline = false,
  light = false,
  className = '',
  name,
}: {
  size?: keyof typeof SIZES
  showTagline?: boolean
  /** Use dark text for the "TECH" part — for light backgrounds */
  light?: boolean
  className?: string
  /** Nome real da loja (cadastro/onboarding) -- primeira palavra ganha o
   * gradiente, o resto fica na cor sólida. Sem isso, cai no "VR"/"TECH"
   * hardcoded de sempre (telas que ainda não buscam o nome real). */
  name?: string | null
}) {
  const s = SIZES[size]
  const [first, ...rest] = (name?.trim() || 'VR TECH').split(/\s+/)
  const restLabel = rest.length > 0 ? ` ${rest.join(' ')}` : ''
  return (
    <div className={`flex flex-col leading-none ${className}`}>
      <span className={`font-black tracking-tight ${s.word}`}>
        <span className="bg-gradient-to-br from-vr-red-light to-vr-red bg-clip-text text-transparent">
          {first}
        </span>
        <span className={light ? 'text-vr-black' : 'text-white'}>{restLabel}</span>
      </span>
      {showTagline && (
        <span className={`${s.tag} font-medium tracking-[0.25em] uppercase mt-1 ${light ? 'text-vr-gray' : 'text-vr-silver/60'}`}>
          Assistência Técnica Especializada
        </span>
      )}
    </div>
  )
}
