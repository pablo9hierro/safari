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
}: {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  options: readonly string[]
  placeholder?: string
  className?: string
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
            // allow click on option before closing/validating
            setTimeout(() => {
              setOpen(false)
              onBlur?.()
            }, 100)
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={`input-field pr-10 ${className}`}
        />
        <Search className="absolute right-3 top-3.5 w-4 h-4 text-gray-300 pointer-events-none" />
      </div>

      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg py-1">
          {filtered.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(opt)}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-vr-red transition-colors"
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
