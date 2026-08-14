import { NextRequest, NextResponse } from 'next/server'
import { getDayAvailability, getSettings, resolveService } from '@/lib/agenda/service'
import { bookingWindowDays } from '@/lib/agenda/slots'
import { errorResponse } from '@/lib/agenda/http'

/**
 * GET /api/agenda/public/availability?service_id=...
 *
 * Horários livres de hoje e amanhã para o cliente escolher no checkout.
 * Pública de propósito (a vitrine não tem login), e por isso NÃO devolve os
 * rótulos internos: o cliente vê apenas quais horários estão livres, nunca
 * quem está marcado nem o motivo de um bloqueio.
 */
export async function GET(req: NextRequest) {
  try {
    const serviceId = req.nextUrl.searchParams.get('service_id')
    const settings = await getSettings()

    // A duração do serviço é o que define o tamanho do horário reservado.
    let duration = settings.default_duration_minutes
    if (serviceId) {
      try {
        duration = (await resolveService(serviceId, null)).duration_minutes
      } catch {
        // Serviço fora do catálogo (item avulso) usa a duração padrão.
      }
    }

    const dias = await Promise.all(
      bookingWindowDays().map(async (dia) => ({
        date: dia.key,
        label: dia.label,
        slots: (await getDayAvailability(dia.key, duration))
          .filter((s) => s.available)
          .map((s) => ({ starts_at: s.starts_at, ends_at: s.ends_at })),
      })),
    )

    return NextResponse.json({ duration_minutes: duration, days: dias })
  } catch (e) {
    return errorResponse(e)
  }
}
