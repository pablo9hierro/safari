'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Send, Loader2, Bot, UserCog } from 'lucide-react'
import { apiPath } from '@/lib/storeProxyLink'
import { createClient } from '@/lib/supabase/client'

type ConversationSummary = {
  id: string
  phone: string
  customer_name: string | null
  status: 'aberta' | 'fechada'
  human_override: boolean
  started_at: string
  last_message_at: string
  closed_at: string | null
}

type Message = {
  id: string
  direction: 'inbound' | 'outbound'
  sender_type: 'cliente' | 'assistente' | 'humano'
  content: string
  created_at: string
}

function timeLabel(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function initials(name: string | null, phone: string) {
  const base = (name ?? phone).trim()
  return base.slice(0, 2).toUpperCase()
}

export default function ChatClient() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [active, setActive] = useState<ConversationSummary | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadConversations = async () => {
    const res = await fetch(apiPath('/api/chat/conversations'))
    if (res.ok) setConversations(await res.json())
    setLoadingList(false)
  }

  useEffect(() => {
    loadConversations()
    const supabase = createClient()
    const channel = supabase
      .channel('chat_conversations_list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'vrtech', table: 'assistant_conversations' },
        () => loadConversations(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openConversation = async (id: string) => {
    setActiveId(id)
    setLoadingThread(true)
    setError(null)
    const res = await fetch(apiPath(`/api/chat/conversations/${id}`))
    if (res.ok) {
      const json = await res.json()
      setActive(json.conversation)
      setMessages(json.messages)
    }
    setLoadingThread(false)
  }

  useEffect(() => {
    if (!activeId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`chat_thread_${activeId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'vrtech', table: 'assistant_messages', filter: `conversation_id=eq.${activeId}` },
        (payload) => {
          setMessages((prev) => (prev.some((m) => m.id === (payload.new as Message).id) ? prev : [...prev, payload.new as Message]))
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'vrtech', table: 'assistant_conversations', filter: `id=eq.${activeId}` },
        (payload) => setActive(payload.new as ConversationSummary),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const notifyTyping = (typing: boolean) => {
    if (!activeId) return
    fetch(apiPath(`/api/chat/conversations/${activeId}/typing`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typing }),
    }).catch(() => {})
  }

  const onDraftChange = (value: string) => {
    setDraft(value)
    notifyTyping(true)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => notifyTyping(false), 4000)
  }

  const send = async () => {
    const content = draft.trim()
    if (!content || !activeId) return
    setSending(true)
    setError(null)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    notifyTyping(false)
    try {
      const res = await fetch(apiPath(`/api/chat/conversations/${activeId}/send`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao enviar mensagem')
      setMessages((prev) => (prev.some((m) => m.id === json.id) ? prev : [...prev, json]))
      setDraft('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar mensagem.')
    } finally {
      setSending(false)
    }
  }

  const toggleOverride = async () => {
    if (!activeId || !active) return
    const res = await fetch(apiPath(`/api/chat/conversations/${activeId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ human_override: !active.human_override }),
    })
    if (res.ok) setActive(await res.json())
  }

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()),
    [conversations],
  )

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* Lista de conversas */}
      <div className="w-80 shrink-0 border-r border-white/5 flex flex-col">
        <div className="p-4 border-b border-white/5">
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-vr-red" />
            Chat
          </h1>
          <p className="text-xs text-vr-silver/50 mt-0.5">Conversas do WhatsApp com a assistente.</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="p-4 flex items-center gap-2 text-sm text-vr-silver/40">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : sortedConversations.length === 0 ? (
            <p className="p-4 text-sm text-vr-silver/40">Nenhuma conversa ainda.</p>
          ) : (
            sortedConversations.map((c) => (
              <button
                key={c.id}
                onClick={() => openConversation(c.id)}
                className={`w-full text-left flex items-center gap-3 p-3.5 border-b border-white/5 hover:bg-white/5 transition-colors ${
                  activeId === c.id ? 'bg-white/5' : ''
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-vr-red/20 text-vr-red flex items-center justify-center text-xs font-bold shrink-0">
                  {initials(c.customer_name, c.phone)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-white truncate">{c.customer_name || c.phone}</p>
                    <span className="text-[10px] text-vr-silver/40 shrink-0">{timeLabel(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {c.human_override && (
                      <span className="text-[10px] bg-vr-red/20 text-vr-red px-1.5 py-0.5 rounded-full">Você assumiu</span>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.status === 'aberta' ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-vr-silver/40'}`}>
                      {c.status === 'aberta' ? 'aberta' : 'fechada'}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-vr-silver/30 text-sm">
            Selecione uma conversa pra ver as mensagens.
          </div>
        ) : loadingThread ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-vr-silver/40" />
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{active?.customer_name || active?.phone}</p>
                <p className="text-xs text-vr-silver/40">{active?.phone}</p>
              </div>
              <button
                onClick={toggleOverride}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl transition-colors ${
                  active?.human_override
                    ? 'bg-vr-red text-white hover:bg-vr-red/90'
                    : 'bg-vr-graphite text-vr-silver/70 hover:text-white border border-white/8'
                }`}
              >
                <UserCog className="w-3.5 h-3.5" />
                {active?.human_override ? 'Devolver pra IA' : 'Assumir conversa'}
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => {
                const fromClient = m.sender_type === 'cliente'
                return (
                  <div key={m.id} className={`flex ${fromClient ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-3.5 py-2.5 ${
                      fromClient ? 'bg-vr-graphite text-white' : m.sender_type === 'humano' ? 'bg-vr-red text-white' : 'bg-vr-red/20 text-white'
                    }`}>
                      {!fromClient && (
                        <p className="text-[10px] opacity-70 mb-0.5 flex items-center gap-1">
                          {m.sender_type === 'humano' ? <><UserCog className="w-2.5 h-2.5" /> Você</> : <><Bot className="w-2.5 h-2.5" /> Assistente</>}
                        </p>
                      )}
                      <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                      <p className="text-[10px] opacity-50 mt-1 text-right">{timeLabel(m.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            {error && <p className="px-4 text-sm text-red-400">{error}</p>}

            <div className="p-3.5 border-t border-white/5 flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Escreva uma mensagem..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-vr-black border border-white/8 text-white text-sm placeholder-vr-silver/30 outline-none focus:border-vr-red/50 transition-colors"
              />
              <button
                onClick={send}
                disabled={sending || !draft.trim()}
                className="p-2.5 rounded-xl bg-vr-red text-white hover:bg-vr-red/90 disabled:opacity-40 transition-colors"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
