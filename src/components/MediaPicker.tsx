'use client'

import { useRef } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { Camera, Paperclip } from 'lucide-react'

// Extraído de ServiceOrderPanel.tsx (onde já funcionava pra mídia de OS)
// pra ser reaproveitado no diagnóstico também -- mesma necessidade: lojista
// anexar foto/vídeo, cliente ver depois. Bucket/caminho ficam por conta de
// quem chama, pra cada tela guardar no lugar que já usa.
export function isVideo(url: string) {
  return /\.(mp4|mov|webm|m4v)$/i.test(url)
}

export async function uploadMediaFiles(
  supabase: SupabaseClient<any, any, any>,
  bucket: string,
  pathPrefix: string,
  files: File[],
): Promise<string[]> {
  const urls: string[] = []
  for (const file of files) {
    const ext = file.name.split('.').pop()
    const fileName = `${pathPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from(bucket).upload(fileName, file)
    if (!error) {
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(fileName)
      urls.push(pub.publicUrl)
    }
  }
  return urls
}

export function MediaThumb({ url, size = 'md' }: { url: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm'
    ? 'w-14 h-14 object-cover rounded-lg border border-gray-200'
    : 'w-28 h-28 object-cover rounded-lg border border-gray-200'
  return isVideo(url) ? (
    <video src={url} controls className={cls} />
  ) : (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Mídia anexada" className={cls} />
    </a>
  )
}

export function MediaPickerButtons({ onFiles }: { onFiles: (files: File[]) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-vr-red transition-colors border border-gray-200 rounded-lg px-2 py-1.5"
      >
        <Camera className="w-3.5 h-3.5" />
        Câmera
      </button>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-vr-red transition-colors border border-gray-200 rounded-lg px-2 py-1.5"
      >
        <Paperclip className="w-3.5 h-3.5" />
        Anexar
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
    </div>
  )
}
