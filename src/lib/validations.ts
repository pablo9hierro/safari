import { z } from 'zod'

export const serviceRequestSchema = z.object({
  customer_name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  customer_phone: z
    .string()
    .min(10, 'Telefone inválido')
    .max(15, 'Telefone inválido')
    .regex(/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/, 'Formato inválido. Ex: (11) 99999-9999'),
  customer_email: z.string().email('E-mail inválido'),
  phone_model: z.string().min(2, 'Informe o modelo do celular'),
  problem_description: z.string().min(10, 'Descreva o problema com pelo menos 10 caracteres'),
  self_pickup: z.boolean().optional(),
  address_lat: z.number().optional(),
  address_lng: z.number().optional(),
  address_label: z.string().optional(),
  address_bairro: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.self_pickup) return
  if (!data.address_lat || !data.address_lng) {
    ctx.addIssue({ code: 'custom', path: ['address_lat'], message: 'Selecione o endereço no mapa' })
  }
})

export type ServiceRequestSchema = z.infer<typeof serviceRequestSchema>
