/**
 * Documentação OpenAPI das demais APIs do serviço VR Tech — assistente,
 * WhatsApp/Evolution, solicitações de reparo e consulta pública.
 *
 * Fica separada de `openapi.ts` (agenda) só por tamanho; as duas são unidas
 * no documento final servido em /api/docs.
 */

const serviceRequestSchema = {
  type: 'object',
  description: 'Solicitação de reparo aberta pelo cliente na vitrine.',
  properties: {
    id: { type: 'string', format: 'uuid' },
    created_at: { type: 'string', format: 'date-time' },
    customer_name: { type: 'string' },
    customer_phone: { type: 'string' },
    customer_email: { type: 'string' },
    phone_model: { type: 'string', nullable: true },
    problem_description: { type: 'string' },
    diagnosis_requested: { type: 'boolean' },
    selected_service_ids: { type: 'array', items: { type: 'string' } },
    estimated_quote: { type: 'number', nullable: true },
    image_url: { type: 'string', nullable: true },
    self_pickup: { type: 'boolean', description: 'true = cliente leva o aparelho na loja.' },
    address_lat: { type: 'number', nullable: true },
    address_lng: { type: 'number', nullable: true },
    address_label: { type: 'string', nullable: true },
    address_neighborhood: { type: 'string', nullable: true },
    address_city: { type: 'string', nullable: true },
    address_state: { type: 'string', nullable: true },
    shipping_price: { type: 'number', nullable: true },
    status: {
      type: 'string',
      enum: [
        'pending', 'accepted', 'rejected', 'retirada_local', 'em_busca',
        'in_progress', 'em_entrega', 'completed', 'em_pagamento',
        'delivered', 'finished', 'cancelled',
      ],
      description: 'Ciclo de vida da ordem de serviço. Toda solicitação nasce como `pending`.',
    },
    quote_value: { type: 'number', nullable: true, description: 'Orçamento fechado pelo lojista.' },
    owner_notes: { type: 'string', nullable: true },
  },
} as const

const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const

const assistantConfigSchema = {
  type: 'object',
  description: 'Configuração da Assistente IA (linha única `default`).',
  properties: {
    id: { type: 'string', example: 'default' },
    enabled: { type: 'boolean', description: 'Desligado, o webhook do WhatsApp ignora as mensagens.' },
    prompt_interpreter: { type: 'string', description: 'System prompt da 1ª camada (classifica a intenção).' },
    prompt_validator: { type: 'string', description: 'System prompt da 2ª camada (responde, com tool calling).' },
    start_keywords: { type: 'array', items: { type: 'string' }, description: 'Palavras que abrem uma conversa nova.' },
    end_keywords: { type: 'array', items: { type: 'string' }, description: 'Palavras que encerram a conversa.' },
    window_timeout_minutes: { type: 'integer', description: 'Inatividade que fecha a conversa automaticamente.' },
    message_batch_window_seconds: { type: 'integer', description: 'Janela de agrupamento de mensagens seguidas do cliente.' },
    min_response_chars: { type: 'integer' },
    max_response_chars: { type: 'integer' },
    ai_provider: { type: 'string', example: 'openai' },
    ai_model: { type: 'string', example: 'gpt-4o-mini' },
    api_key: { type: 'string', nullable: true, description: 'Se ausente, cai em `OPENAI_API_KEY` do ambiente.' },
  },
} as const

export const otherPaths = {
  '/api/assistant/config': {
    get: {
      tags: ['Assistente IA'],
      summary: 'Ler configuração da assistente',
      description: 'Se a linha ainda não existir, devolve os padrões (sem gravar nada).',
      responses: {
        200: { description: 'Configuração atual.', content: { 'application/json': { schema: assistantConfigSchema } } },
      },
    },
    put: {
      tags: ['Assistente IA'],
      summary: 'Salvar configuração da assistente',
      description: 'Upsert da linha `default`. Campos ausentes voltam ao padrão — envie o objeto completo.',
      requestBody: { required: true, content: { 'application/json': { schema: assistantConfigSchema } } },
      responses: {
        200: { description: 'Configuração salva.', content: { 'application/json': { schema: assistantConfigSchema } } },
        500: { description: 'Falha ao gravar.', content: { 'application/json': { schema: errorSchema } } },
      },
    },
  },

  '/api/assistant/message': {
    post: {
      tags: ['Assistente IA'],
      summary: 'Processar mensagem recebida do cliente',
      description: [
        'Núcleo da assistente: resolve a conversa, roda o pipeline de 2 camadas',
        '(interpretador → respondedor com tool calling) e envia a resposta por WhatsApp.',
        '',
        'Chamado internamente pelo webhook da Evolution — não é endpoint público.',
        'Exige o header `x-internal-secret`.',
        '',
        'Responde `200` mesmo quando decide não responder ao cliente; nesse caso',
        '`skipped` diz o motivo (assistente desligada, sem palavra de início,',
        'atendimento assumido por humano, etc).',
      ].join('\n'),
      parameters: [
        { name: 'x-internal-secret', in: 'header', required: true, schema: { type: 'string' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['phone', 'text'],
              properties: {
                phone: { type: 'string', description: 'Telefone do cliente (só dígitos).' },
                text: { type: 'string', description: 'Conteúdo da mensagem recebida.' },
                pushName: { type: 'string', description: 'Nome do contato no WhatsApp.' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Processado (com ou sem resposta enviada).',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  ok: { type: 'boolean' },
                  conversation_id: { type: 'string', format: 'uuid' },
                  action: { type: 'string', example: 'conversation_closed' },
                  skipped: {
                    type: 'string',
                    description: 'Motivo de não ter respondido.',
                    enum: ['no phone or text', 'assistant disabled', 'no active conversation and no start keyword', 'human_override'],
                  },
                },
              },
            },
          },
        },
        401: { description: 'Segredo interno ausente ou incorreto.', content: { 'application/json': { schema: errorSchema } } },
        500: { description: 'Falha ao criar a conversa.', content: { 'application/json': { schema: errorSchema } } },
      },
    },
  },

  '/api/assistant/rag': {
    get: {
      tags: ['Assistente IA'],
      summary: 'Listar documentos da base de conhecimento',
      description: 'Documentos usados como contexto adicional nas respostas da assistente.',
      responses: { 200: { description: 'Lista de documentos.', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } } },
    },
    post: {
      tags: ['Assistente IA'],
      summary: 'Enviar documento para a base de conhecimento',
      description: 'Upload `multipart/form-data`. Máximo 5 MB.',
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] },
          },
        },
      },
      responses: {
        200: { description: 'Documento salvo.' },
        400: { description: 'Arquivo ausente, maior que 5 MB ou de formato não suportado.', content: { 'application/json': { schema: errorSchema } } },
        500: { description: 'Falha ao salvar.', content: { 'application/json': { schema: errorSchema } } },
      },
    },
    delete: {
      tags: ['Assistente IA'],
      summary: 'Remover documento da base',
      description: 'Exclusão definitiva: o documento deixa de ser usado como contexto nas próximas respostas da assistente.',
      parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Removido.' },
        400: { description: '`id` não informado.', content: { 'application/json': { schema: errorSchema } } },
      },
    },
  },

  '/api/service-requests': {
    post: {
      tags: ['Solicitações de reparo'],
      summary: 'Abrir solicitação de reparo',
      description: 'Chamado pela vitrine quando o cliente conclui o formulário de diagnóstico. Nasce com status `pending`.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['customer_name', 'customer_phone', 'customer_email', 'problem_description'],
              properties: serviceRequestSchema.properties,
            },
          },
        },
      },
      responses: {
        200: { description: 'Solicitação criada.', content: { 'application/json': { schema: { type: 'object', properties: { data: serviceRequestSchema } } } } },
        400: { description: 'Body inválido.', content: { 'application/json': { schema: errorSchema } } },
        500: { description: 'Falha ao gravar.', content: { 'application/json': { schema: errorSchema } } },
      },
    },
  },

  '/api/consultar': {
    get: {
      tags: ['Solicitações de reparo'],
      summary: 'Consultar solicitações pelo telefone (público)',
      description: [
        'Usado na página pública `/consultar`, sem login: o telefone funciona como',
        'a credencial. A busca normaliza a formatação do número dos dois lados.',
      ].join('\n'),
      parameters: [
        { name: 'phone', in: 'query', required: true, schema: { type: 'string' }, description: 'Mínimo 8 dígitos; formatação é ignorada.' },
      ],
      responses: {
        200: { description: 'Solicitações do telefone.', content: { 'application/json': { schema: { type: 'object', properties: { requests: { type: 'array', items: serviceRequestSchema } } } } } },
        400: { description: 'Telefone ausente ou com menos de 8 dígitos.', content: { 'application/json': { schema: errorSchema } } },
        500: { description: 'Falha na consulta.', content: { 'application/json': { schema: errorSchema } } },
      },
    },
    post: {
      tags: ['Solicitações de reparo'],
      summary: 'Ação do cliente sobre a própria solicitação',
      description: 'O telefone precisa conferir com o da solicitação — é o que impede um cliente de agir sobre a solicitação de outro.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['id', 'phone'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                phone: { type: 'string', description: 'Precisa bater com o telefone da solicitação.' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Ação aplicada.' },
        400: { description: '`id` ou `phone` ausentes.', content: { 'application/json': { schema: errorSchema } } },
        403: { description: 'Telefone não confere com o da solicitação.', content: { 'application/json': { schema: errorSchema } } },
        404: { description: 'Solicitação não encontrada.', content: { 'application/json': { schema: errorSchema } } },
      },
    },
  },

  '/api/whatsapp/webhook': {
    post: {
      tags: ['WhatsApp / Evolution'],
      summary: 'Webhook da Evolution API',
      description: [
        'Recebe os eventos da instância (`messages.upsert` etc). Mensagens de',
        'clientes são repassadas para `/api/assistant/message` sem bloquear a',
        'resposta ao Evolution.',
        '',
        'Protegido pelo header `x-webhook-secret` configurado na instância.',
      ].join('\n'),
      parameters: [{ name: 'x-webhook-secret', in: 'header', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              description: 'Payload da Evolution API.',
              properties: {
                event: { type: 'string', example: 'messages.upsert' },
                data: { type: 'object', description: 'Mensagem ou lista de mensagens.' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Evento recebido.' },
        401: { description: 'Segredo do webhook inválido.', content: { 'application/json': { schema: errorSchema } } },
      },
    },
  },

  '/api/whatsapp/connect': {
    post: {
      tags: ['WhatsApp / Evolution'],
      summary: 'Reconectar a instância e gerar QR code',
      description: [
        'Faz logout, apaga e recria a instância do zero, reaplica o webhook e',
        'devolve o QR code.',
        '',
        'A recriação completa é intencional: sessão com credenciais corrompidas',
        'entra em loop de reconexão (401 repetido) sem nunca gerar QR novo, e',
        'logout sozinho não resolve.',
      ].join('\n'),
      responses: {
        200: {
          description: 'Instância recriada; `data` traz o QR quando disponível.',
          content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, data: { type: 'object' } } } } },
        },
        500: { description: 'Falha ao recriar a instância.', content: { 'application/json': { schema: errorSchema } } },
      },
    },
  },

  '/api/whatsapp/notify': {
    post: {
      tags: ['WhatsApp / Evolution'],
      summary: 'Notificar sobre solicitação de reparo',
      description: 'Envia a mensagem correspondente ao evento — para o cliente ou para o lojista, conforme o caso.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['requestId', 'event'],
              properties: {
                requestId: { type: 'string', format: 'uuid' },
                event: { type: 'string', description: 'Evento/status que determina a mensagem enviada.' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Mensagem enviada.' },
        400: { description: '`requestId` ou `event` ausentes.', content: { 'application/json': { schema: errorSchema } } },
        404: { description: 'Solicitação não encontrada.', content: { 'application/json': { schema: errorSchema } } },
        500: { description: 'Falha no envio.', content: { 'application/json': { schema: errorSchema } } },
      },
    },
  },

  '/api/whatsapp/notify-store-order': {
    post: {
      tags: ['WhatsApp / Evolution'],
      summary: 'Notificar sobre pedido da loja',
      description: 'Avisa lojista e cliente sobre um pedido novo. Os dados vêm no corpo (o pedido vive no ecommerce-api, não neste banco).',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['orderId', 'customerName', 'customerWhatsapp'],
              properties: {
                orderId: { type: 'string' },
                customerName: { type: 'string' },
                customerWhatsapp: { type: 'string' },
                total: { type: 'number' },
                pickupAtStore: { type: 'boolean' },
                addressLabel: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Mensagens enviadas.' },
        400: { description: 'Campos obrigatórios ausentes.', content: { 'application/json': { schema: errorSchema } } },
        500: { description: 'Falha no envio.', content: { 'application/json': { schema: errorSchema } } },
      },
    },
  },

  '/api/templates': {
    get: {
      tags: ['Template Zap'],
      summary: 'Listar templates de mensagens automáticas',
      description: 'Todos os templates de WhatsApp da loja, agrupados por seção (Status do atendimento, Entrega e coleta, Agendamentos, Pagamentos, Pedidos da loja). São as mensagens automáticas disparadas por eventos do sistema — não têm relação com a Assistente IA, que gera respostas dinamicamente.',
      responses: { 200: { description: 'Lista de templates.' } },
    },
  },
  '/api/templates/{key}': {
    get: {
      tags: ['Template Zap'],
      summary: 'Ler um template',
      parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' }, description: 'Ex.: status_completed, appointment_created, payment_link.' }],
      responses: {
        200: { description: 'Template.' },
        404: { description: 'Template não encontrado.' },
      },
    },
    put: {
      tags: ['Template Zap'],
      summary: 'Salvar o texto de um template',
      description: 'Duas validações no servidor, independentes do frontend: recusa (403) template marcado como não editável (ex.: a mensagem que carrega o link de pagamento gerado pelo sistema), e recusa (422) se o texto não contiver todas as variáveis obrigatórias do template.',
      parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string', description: 'Texto com variáveis no formato /nome.' } } } } },
      },
      responses: {
        200: { description: 'Salvo.' },
        403: { description: 'Template protegido — não editável.' },
        404: { description: 'Template não encontrado.' },
        422: { description: 'Falta variável obrigatória no texto.' },
      },
    },
  },
  '/api/keepalive': {
    get: {
      tags: ['Sistema'],
      summary: 'Keepalive do banco',
      description: 'Faz uma consulta trivial para o projeto Supabase não hibernar por inatividade.',
      responses: { 200: { description: 'OK.' } },
    },
  },
} as const

export const otherSchemas = {
  ServiceRequest: serviceRequestSchema,
  AssistantConfig: assistantConfigSchema,
}

export const otherTags = [
  { name: 'Template Zap', description: 'Textos das mensagens automáticas de evento (pedido, status, entrega, agendamento, pagamento). Distinto da Assistente IA: aqui o texto é fixo com variáveis, não gerado por modelo.' },
  { name: 'Assistente IA', description: 'Configuração, pipeline de atendimento e base de conhecimento da secretária IA.' },
  { name: 'Solicitações de reparo', description: 'Abertura pela vitrine e consulta pública pelo cliente.' },
  { name: 'WhatsApp / Evolution', description: 'Canal de comunicação: webhook de entrada, conexão da instância e notificações de saída.' },
  { name: 'Sistema', description: 'Utilitários operacionais.' },
]
