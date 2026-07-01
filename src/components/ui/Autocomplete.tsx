'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'

export default function Autocomplete({
  value,
  onChange,
  onBlur,
  options,
  placeholder,
  className = '',
  dark = false,
}: {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  options: readonly string[]
  placeholder?: string
  className?: string
  dark?: boolean
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => setQuery(value), [value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = (
    query.trim().length === 0
      ? options
      : options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()))
  ).slice(0, 30)

  const select = (opt: string) => {
    setQuery(opt)
    onChange(opt)
    setOpen(false)
  }

  const inputCls = dark
    ? `w-full px-4 py-3 rounded-xl border border-white/10 bg-vr-black text-white placeholder-white/25 focus:border-vr-red/60 focus:ring-1 focus:ring-vr-red/10 outline-none transition-all duration-200 pr-10 ${className}`
    : `input-field pr-10 ${className}`

  const dropdownCls = dark
    ? 'absolute z-20 mt-1 w-full max-h-52 overflow-y-auto bg-vr-graphite border border-white/10 rounded-xl shadow-2xl py-1'
    : 'absolute z-20 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg py-1'

  const optionCls = dark
    ? 'w-full text-left px-4 py-2 text-sm text-vr-silver hover:bg-vr-red/10 hover:text-white transition-colors'
    : 'w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-vr-red transition-colors'

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTimeout(() => {
              setOpen(false)
              onBlur?.()
            }, 100)
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={inputCls}
        />
        <Search className={`absolute right-3 top-3.5 w-4 h-4 pointer-events-none ${dark ? 'text-white/20' : 'text-gray-300'}`} />
      </div>

      {open && filtered.length > 0 && (
        <ul className={dropdownCls}>
          {filtered.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(opt)}
                className={optionCls}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
