/**
 * Contrato OpenAPI da agenda + catálogo das tools disponíveis para a
 * Assistente IA. Servido em /api/docs (Swagger UI) e /api/docs/openapi.json.
 *
 * As tools ficam documentadas aqui de propósito: elas são parte do contrato
 * da assistente, e quem for integrar/depurar precisa ver o schema de entrada
 * e o formato de resposta de cada uma no mesmo lugar que os endpoints REST.
 */
import { AGENDA_TOOLS } from './tools'
import { MIN_JUSTIFICATION_LENGTH } from './types'

const appointmentSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    service_id: { type: 'string', format: 'uuid', nullable: true },
    service_label: { type: 'string', description: 'Nome do serviço congelado no momento do agendamento.' },
    customer_name: { type: 'string' },
    customer_phone: { type: 'string', description: 'Somente dígitos.' },
    starts_at: { type: 'string', format: 'date-time' },
    ends_at: { type: 'string', format: 'date-time' },
    status: {
      type: 'string',
      enum: ['agendado', 'remarcado', 'cancelado', 'concluido', 'nao_compareceu'],
    },
    notes: { type: 'string', nullable: true },
    created_by: { type: 'string', enum: ['assistente', 'admin'] },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
} as const

const eventSchema = {
  type: 'object',
  description: 'Entrada de auditoria. Agendamento nunca é apagado — toda transição vira um evento.',
  properties: {
    id: { type: 'string', format: 'uuid' },
    appointment_id: { type: 'string', format: 'uuid' },
    action: { type: 'string', enum: ['created', 'rescheduled', 'cancelled', 'completed', 'no_show'] },
    actor_type: { type: 'string', enum: ['assistente', 'admin', 'cliente'] },
    actor_id: { type: 'string', nullable: true },
    justification: { type: 'string', nullable: true },
    previous_starts_at: { type: 'string', format: 'date-time', nullable: true },
    previous_ends_at: { type: 'string', format: 'date-time', nullable: true },
    new_starts_at: { type: 'string', format: 'date-time', nullable: true },
    new_ends_at: { type: 'string', format: 'date-time', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
  },
} as const

const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    code: {
      type: 'string',
      enum: ['validation', 'conflict', 'not_found', 'disabled', 'justification_too_short'],
    },
  },
} as const

const availabilitySchema = {
  oneOf: [
    {
      type: 'object',
      title: 'Disponível',
      properties: {
        available: { type: 'boolean', enum: [true] },
        starts_at: { type: 'string', format: 'date-time' },
        ends_at: { type: 'string', format: 'date-time' },
      },
    },
    {
      type: 'object',
      title: 'Indisponível',
      properties: {
        available: { type: 'boolean', enum: [false] },
        reason: {
          type: 'string',
          enum: ['ocupado', 'bloqueado', 'fora_do_horario', 'muito_em_cima'],
          description: 'Por que o horário não pode ser usado.',
        },
        detail: { type: 'string' },
        alternatives: {
          type: 'array',
          description: 'Horários livres reais para oferecer ao cliente.',
          items: {
            type: 'object',
            properties: {
              starts_at: { type: 'string', format: 'date-time' },
              ends_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  ],
} as const

const justificationProp = {
  type: 'string',
  minLength: MIN_JUSTIFICATION_LENGTH,
  description: `Obrigatória, mínimo ${MIN_JUSTIFICATION_LENGTH} caracteres. Validada no servidor — o contador do formulário é apenas conveniência. Vai literal para o cliente no WhatsApp.`,
} as const

const responses = {
  unauthorized: {
    description: 'Sessão de lojista ausente ou inválida.',
    content: { 'application/json': { schema: errorSchema } },
  },
  conflict: {
    description: 'Horário indisponível (ocupado, bloqueado ou fora do expediente).',
    content: { 'application/json': { schema: errorSchema } },
  },
  justification: {
    description: `Justificativa ausente ou com menos de ${MIN_JUSTIFICATION_LENGTH} caracteres.`,
    content: { 'application/json': { schema: errorSchema } },
  },
  notFound: {
    description: 'Agendamento não encontrado.',
    content: { 'application/json': { schema: errorSchema } },
  },
}

export function buildAgendaOpenApi() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'VR Tech — Agenda e Assistente IA',
      version: '1.0.0',
      description: [
        'Agenda de serviços da loja: **mesma fonte de verdade** usada pelo painel',
        '`/dashboard/agenda` e pelas ferramentas de tool calling da Assistente IA no WhatsApp.',
        '',
        '**Regras de negócio:**',
        '- Agendamento existe apenas para SERVIÇO. Produto segue o fluxo de venda/carrinho e nunca entra na agenda.',
        '- Serviço sempre exige agendamento, inclusive quando o cliente pede atendimento "agora".',
        '- Dois agendamentos não podem se sobrepor: a garantia é uma constraint `EXCLUDE` no Postgres, então requisições simultâneas pelo mesmo horário resultam em exatamente uma aceita (`409`).',
        `- Remarcação e cancelamento feitos pelo lojista exigem justificativa de no mínimo ${MIN_JUSTIFICATION_LENGTH} caracteres, validada no servidor.`,
        '- Nada é apagado: cancelar/remarcar são transições de status e geram registro de auditoria.',
        '',
        'As rotas exigem sessão de lojista (cookie do Supabase Auth do Resolutoo, o mesmo do `/dashboard`).',
      ].join('\n'),
    },
    servers: [{ url: 'http://localhost:3000', description: 'Desenvolvimento local' }],
    tags: [
      { name: 'Agenda', description: 'Endpoints REST usados pelo painel administrativo.' },
      {
        name: 'Assistente IA — Tools',
        description:
          'Ferramentas de tool calling registradas no pipeline da assistente. Só são oferecidas ao modelo quando `agenda_settings.appointment_ai_enabled = true` (feature flag por loja).',
      },
    ],
    paths: {
      '/api/appointments': {
        get: {
          tags: ['Agenda'],
          summary: 'Listar agendamentos',
          parameters: [
            { name: 'date', in: 'query', schema: { type: 'string', example: '2026-08-20' }, description: 'Dia local da loja (AAAA-MM-DD).' },
            { name: 'service_id', in: 'query', schema: { type: 'string' } },
            { name: 'customer', in: 'query', schema: { type: 'string' }, description: 'Busca parcial pelo nome.' },
            { name: 'phone', in: 'query', schema: { type: 'string' }, description: 'Formatação é ignorada.' },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['agendado', 'remarcado', 'cancelado', 'concluido', 'nao_compareceu'] } },
          ],
          responses: {
            200: { description: 'Lista de agendamentos.', content: { 'application/json': { schema: { type: 'array', items: appointmentSchema } } } },
            401: responses.unauthorized,
          },
        },
        post: {
          tags: ['Agenda'],
          summary: 'Criar agendamento pelo painel',
          description: 'Revalida disponibilidade antes de gravar e notifica o cliente por WhatsApp.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['customer_name', 'customer_phone', 'data', 'horario'],
                  properties: {
                    service_id: { type: 'string', description: 'ID do catálogo. Se ausente, informe `service_label`.' },
                    service_label: { type: 'string', description: 'Nome livre do serviço, quando não estiver no catálogo.' },
                    customer_name: { type: 'string' },
                    customer_phone: { type: 'string' },
                    data: { type: 'string', example: '2026-08-20' },
                    horario: { type: 'string', example: '14:00' },
                    duration_minutes: { type: 'integer', description: 'Padrão vem de `agenda_settings.default_duration_minutes`.' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Criado. `notified` indica se o WhatsApp saiu.',
              content: { 'application/json': { schema: { allOf: [appointmentSchema, { type: 'object', properties: { notified: { type: 'boolean' } } }] } } },
            },
            400: { description: 'Dados inválidos.', content: { 'application/json': { schema: errorSchema } } },
            401: responses.unauthorized,
            409: responses.conflict,
          },
        },
      },
      '/api/appointments/availability': {
        get: {
          tags: ['Agenda'],
          summary: 'Consultar disponibilidade',
          description: 'Com `time`, responde sobre aquele horário específico. Sem `time`, lista as próximas vagas livres.',
          parameters: [
            { name: 'date', in: 'query', schema: { type: 'string', example: '2026-08-20' } },
            { name: 'time', in: 'query', schema: { type: 'string', example: '14:00' } },
            { name: 'duration', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 12 } },
          ],
          responses: {
            200: { description: 'Resultado da consulta.', content: { 'application/json': { schema: availabilitySchema } } },
            401: responses.unauthorized,
          },
        },
      },
      '/api/appointments/{id}': {
        get: {
          tags: ['Agenda'],
          summary: 'Detalhe do agendamento com histórico',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: {
              description: 'Agendamento e trilha de auditoria.',
              content: { 'application/json': { schema: { allOf: [appointmentSchema, { type: 'object', properties: { events: { type: 'array', items: eventSchema } } }] } } },
            },
            401: responses.unauthorized,
            404: responses.notFound,
          },
        },
      },
      '/api/appointments/{id}/reschedule': {
        patch: {
          tags: ['Agenda'],
          summary: 'Remarcar (exige justificativa)',
          description: 'Move o agendamento e envia ao cliente uma mensagem com o novo horário e a justificativa literal.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['data', 'horario', 'justification'],
                  properties: {
                    data: { type: 'string', example: '2026-08-21' },
                    horario: { type: 'string', example: '16:00' },
                    justification: justificationProp,
                    duration_minutes: { type: 'integer', description: 'Se omitido, preserva a duração original.' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Remarcado.',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      appointmentSchema,
                      {
                        type: 'object',
                        properties: {
                          previous: { type: 'object', properties: { starts_at: { type: 'string' }, ends_at: { type: 'string' } } },
                          notified: { type: 'boolean' },
                        },
                      },
                    ],
                  },
                },
              },
            },
            401: responses.unauthorized,
            404: responses.notFound,
            409: responses.conflict,
            422: responses.justification,
          },
        },
      },
      '/api/appointments/{id}/cancel': {
        post: {
          tags: ['Agenda'],
          summary: 'Cancelar (exige justificativa)',
          description: 'Transição de status — o registro nunca é apagado. O horário volta a ficar disponível e o cliente é avisado.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['justification'], properties: { justification: justificationProp } },
              },
            },
          },
          responses: {
            200: {
              description: 'Cancelado.',
              content: { 'application/json': { schema: { allOf: [appointmentSchema, { type: 'object', properties: { notified: { type: 'boolean' } } }] } } },
            },
            401: responses.unauthorized,
            404: responses.notFound,
            422: responses.justification,
          },
        },
      },
    },
    components: {
      schemas: {
        Appointment: appointmentSchema,
        AppointmentEvent: eventSchema,
        Availability: availabilitySchema,
        Error: errorSchema,
        /**
         * Catálogo das tools, derivado da MESMA constante entregue ao modelo —
         * a doc não pode divergir do que a assistente realmente recebe.
         */
        AssistantTools: {
          type: 'object',
          description: 'Ferramentas de agenda disponíveis para a Assistente IA (tool calling OpenAI).',
          properties: Object.fromEntries(
            AGENDA_TOOLS.map((tool) => [
              tool.name,
              {
                type: 'object',
                description: tool.description,
                properties: {
                  input: tool.parameters,
                  output: {
                    type: 'string',
                    description:
                      'Texto devolvido ao modelo. Prefixos convencionados: "DISPONÍVEL", "INDISPONÍVEL (motivo)", "AGENDAMENTO CONFIRMADO", "CANCELADO", "REMARCADO" ou "FALHOU (código)". Com "FALHOU", a assistente não pode confirmar nada ao cliente.',
                  },
                },
              },
            ]),
          ),
        },
      },
    },
  }
}
