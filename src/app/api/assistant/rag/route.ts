import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('assistant_rag_documents')
    .select('id, filename, char_count, created_at')
    .order('created_at', { ascending: false })
  return NextResponse.json(data ?? [])
}

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

// Parse WhatsApp exported conversation text into readable plain text
function parseWhatsAppExport(raw: string): string {
  // WhatsApp exports look like: "DD/MM/AAAA HH:MM - Nome: mensagem"
  // or "[DD/MM/AAAA, HH:MM:SS] Nome: mensagem"
  const lines = raw.split('\n')
  const cleaned: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Strip date+time prefix
    const stripped = trimmed
      .replace(/^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(:\d{2})?\s*-\s*/, '')
      .replace(/^\[\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2}(:\d{2})?\]\s*/, '')
    // Skip system messages like <Media omitted>, cifras de chaves, etc.
    if (stripped.startsWith('<') || stripped.startsWith('~')) continue
    cleaned.push(stripped)
  }
  return cleaned.join('\n')
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Arquivo muito grande (máx 5 MB)' }, { status: 400 })
  }

  const allowedExtensions = ['.txt', '.pdf', '.docx', '.csv']
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!allowedExtensions.includes(ext)) {
    return NextResponse.json({ error: `Formato ${ext} não suportado` }, { status: 400 })
  }

  const arrayBuf = await file.arrayBuffer()
  let content = ''

  if (ext === '.pdf') {
    // For PDFs, store raw base64 and use a simple text extraction marker
    // Full PDF parsing requires a library — store as-is and note it's binary
    content = `[PDF: ${file.name} — ${file.size} bytes — processamento completo requer parse server-side]`
  } else if (ext === '.docx') {
    content = `[DOCX: ${file.name} — ${file.size} bytes — processamento completo requer parse server-side]`
  } else {
    // TXT, CSV, and WhatsApp exports
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuf)
    // Detect WhatsApp export by pattern
    const isWhatsApp = /\d{1,2}\/\d{1,2}\/\d{2,4}.*-.*:/.test(raw.slice(0, 500))
    content = isWhatsApp ? parseWhatsAppExport(raw) : raw
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('assistant_rag_documents').insert({
    filename: file.name,
    content,
    char_count: content.length,
  })

  if (error) {
    console.error('RAG insert error:', error)
    return NextResponse.json({ error: 'Erro ao salvar documento' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  const supabase = createServiceClient()
  await supabase.from('assistant_rag_documents').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
