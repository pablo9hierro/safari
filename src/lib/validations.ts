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
  address_cep: z
    .string()
    .length(9, 'CEP inválido')
    .regex(/^\d{5}-\d{3}$/, 'Formato inválido. Ex: 01001-000'),
  address_number: z.string().min(1, 'Informe o número'),
  address_reference: z.string().min(5, 'Informe um ponto de referência'),
})

export type ServiceRequestSchema = z.infer<typeof serviceRequestSchema>
