// Baixa uma imagem (URL pública do Storage) e converte pra data URL +
// dimensões, formato que doc.addImage() do jsPDF exige. Extraído de
// generateServiceOrderPdf.ts pra ser reaproveitado também no PDF de
// diagnóstico (mesma necessidade: embutir foto anexada pelo lojista).
const MIME_TO_FORMAT: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/jpg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
}

export function isImageUrl(url: string) {
  return !/\.(mp4|mov|webm|m4v)$/i.test(url)
}

export async function loadImage(url: string): Promise<{ dataUrl: string; width: number; height: number; format: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const format = MIME_TO_FORMAT[blob.type]
    if (!format) return null

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = reject
      img.src = dataUrl
    })

    return { dataUrl, format, ...dims }
  } catch {
    return null
  }
}
