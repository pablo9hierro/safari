'use client'

/**
 * Seletor de data em três dropdowns (dia / mês / ano), no padrão brasileiro.
 * Existe no lugar do `<input type="date">` nativo porque o controle do
 * navegador impõe o formato do sistema (que costuma sair mm/dd/aaaa) e um
 * visual que não acompanha o resto do painel.
 */

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const SELECT =
  'bg-vr-black border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-vr-red transition-colors'

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

export default function DateDropdown({
  value,
  onChange,
  yearsAhead = 1,
  yearsBack = 0,
}: {
  /** Data no formato AAAA-MM-DD. */
  value: string
  onChange: (v: string) => void
  yearsAhead?: number
  yearsBack?: number
}) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const today = new Date()
  const year = m ? Number(m[1]) : today.getFullYear()
  const month = m ? Number(m[2]) : today.getMonth() + 1
  const day = m ? Number(m[3]) : today.getDate()

  const pad = (n: number) => String(n).padStart(2, '0')
  const emit = (y: number, mo: number, d: number) => {
    // Encurta o dia quando o mês novo é mais curto (31/01 → fevereiro).
    const maxDay = daysInMonth(y, mo)
    onChange(`${y}-${pad(mo)}-${pad(Math.min(d, maxDay))}`)
  }

  const anoAtual = today.getFullYear()
  const anos = Array.from(
    { length: yearsBack + yearsAhead + 1 },
    (_, i) => anoAtual - yearsBack + i,
  )
  const dias = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1)

  return (
    <div className="flex gap-2">
      <select
        aria-label="Dia"
        value={day}
        onChange={(e) => emit(year, month, Number(e.target.value))}
        className={SELECT}
      >
        {dias.map((d) => (
          <option key={d} value={d}>{pad(d)}</option>
        ))}
      </select>
      <select
        aria-label="Mês"
        value={month}
        onChange={(e) => emit(year, Number(e.target.value), day)}
        className={`${SELECT} flex-1`}
      >
        {MESES.map((nome, i) => (
          <option key={nome} value={i + 1}>{nome}</option>
        ))}
      </select>
      <select
        aria-label="Ano"
        value={year}
        onChange={(e) => emit(Number(e.target.value), month, day)}
        className={SELECT}
      >
        {anos.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
    </div>
  )
}
