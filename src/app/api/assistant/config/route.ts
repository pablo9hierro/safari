import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('assistant_config')
    .select('*')
    .eq('id', 'default')
    .single()

  if (error || !data) {
    return NextResponse.json({
      id: 'default', enabled: false,
      prompt_interpreter: '',
      start_keywords: ['oi', 'olá', 'atendimento'],
      end_keywords: ['encerrar'],
      window_timeout_minutes: 30,
      message_batch_window_seconds: 8,
      min_response_chars: 150, max_response_chars: 300,
      ai_provider: 'openai', ai_model: 'gpt-4o-mini', api_key: null,
    })
  }
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  // A UI de edição mora em /meu-plano/assistente-ia (a-vrtek-gente), fora
  // do vrtech. Essa rota só existe hoje pra receber o write-through que o
  // a-vrtek-gente dispara depois de salvar lá -- por isso exige o segredo
  // compartilhado em vez de depender de sessão de dashboard.
  const secret = req.headers.get('x-sync-secret')
  if (!secret || secret !== process.env.ASSISTANT_SYNC_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const supabase = createServiceClient()

  // prompt_validator nunca é lido/escrito daqui — saiu do controle do
  // lojista, virou parte fixa de universalRules (ver pipeline.ts). Coluna
  // continua existindo no banco (não é destrutivo), só não é mais tocada.
  const payload = {
    id: 'default',
    enabled: body.enabled ?? false,
    prompt_interpreter: body.prompt_interpreter ?? '',
    start_keywords: Array.isArray(body.start_keywords)
      ? body.start_keywords
      : (body.start_keywords ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
    end_keywords: Array.isArray(body.end_keywords)
      ? body.end_keywords
      : (body.end_keywords ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
    window_timeout_minutes: Number(body.window_timeout_minutes) || 30,
    message_batch_window_seconds: Number(body.message_batch_window_seconds) || 8,
    min_response_chars: Number(body.min_response_chars) || 40,
    max_response_chars: Number(body.max_response_chars) || 300,
    ai_provider: body.ai_provider || 'openai',
    ai_model: body.ai_model || 'gpt-4o-mini',
    api_key: body.api_key?.trim() || null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('assistant_config')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
