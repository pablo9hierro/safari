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
  address_neighborhood: z.string().optional(),
  address_reference: z.string().optional(),
}).superRefine((data, ctx) => {
  // Sem endereço pra validar quando o cliente mesmo vai levar/buscar o aparelho.
  if (data.self_pickup) return
  if (!data.address_neighborhood || data.address_neighborhood.trim().length < 1) {
    ctx.addIssue({ code: 'custom', path: ['address_neighborhood'], message: 'Selecione o bairro' })
  }
  if (!data.address_reference || data.address_reference.trim().length < 3) {
    ctx.addIssue({ code: 'custom', path: ['address_reference'], message: 'Informe um ponto de referência' })
  }
})

export type ServiceRequestSchema = z.infer<typeof serviceRequestSchema>
