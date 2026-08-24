export interface Ponto {
  lat: number
  lng: number
}

export interface EnderecoResultado extends Ponto {
  titulo: string
  subtitulo: string
  bairro?: string
  rua?: string
  numero?: string
  cidade?: string
}
