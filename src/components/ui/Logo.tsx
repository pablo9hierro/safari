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
}: {
  size?: keyof typeof SIZES
  showTagline?: boolean
  /** Use dark text for the "TECH" part — for light backgrounds */
  light?: boolean
  className?: string
}) {
  const s = SIZES[size]
  return (
    <div className={`flex flex-col leading-none ${className}`}>
      <span className={`font-black tracking-tight ${s.word}`}>
        <span className="bg-gradient-to-br from-vr-red-light to-vr-red bg-clip-text text-transparent">
          VR
        </span>
        <span className={light ? 'text-vr-black' : 'text-white'}> TECH</span>
      </span>
      {showTagline && (
        <span className={`${s.tag} font-medium tracking-[0.25em] uppercase mt-1 ${light ? 'text-vr-gray' : 'text-vr-silver/60'}`}>
          Assistência Técnica Especializada
        </span>
      )}
    </div>
  )
}
