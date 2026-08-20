# Resolutoo em produção — arquitetura geral e o ramo "eletrônica" (vrtech)

Este documento descreve como o Resolutoo funciona hoje em produção, com
foco em como o ramo "eletrônica" (tenant vrtech) foi acrescentado à
plataforma e como a fila Redis de WhatsApp funciona. Atualizado em
2026-08-20, refletindo o estado real pós-correções desta sessão — não
confiar cegamente em versões anteriores deste arquivo.

## 1. Visão geral da plataforma

O Resolutoo (resolutoo.com) é um SaaS multi-tenant de "fábrica de lojas".
Cada assinante escolhe um **ramo de atuação** no onboarding, e cada ramo é
servido por uma stack **completamente diferente**:

| Ramo | Stack | Repo | Onde roda |
|---|---|---|---|
| **ecommerce** (padrão) | Rust (Axum) + React/Vite | `ufersin/ecommerce` (monorepo `ufersin`) | Embutido no build do hub, Railway (backend) |
| **eletrônica** (vrtech) | Next.js (App Router) | `caralho` / GitHub `pablo9hierro/safari` | App Vercel separado, proxiado |

O **hub da plataforma** (`resolutoo.com`, projeto `ufersin/frontend`, SPA
Vite) cuida de: cadastro/login do lojista, escolha de plano, cobrança
(Mercado Pago via `ufersin-api`, Rust/Railway), onboarding, e o
`/meu-plano` (hub pós-login com "Vitrine"/"Painel da loja"). Ele **nunca**
contém a lógica de negócio de nenhum ramo — só orquestra e faz proxy.

**Não confundir os dois ramos.** Eles não compartilham código, banco, nem
processo de deploy. Uma mudança no ecommerce nunca afeta o vrtech e
vice-versa.

## 2. Como o ramo eletrônica foi encaixado (proxy reverso)

O app vrtech é um Next.js **standalone**, com seu próprio deploy Vercel
(`vrtech-jp.vercel.app`) e seu próprio Supabase. Ele nunca foi portado pra
dentro do monorepo `ufersin` — a integração inteira é feita por **rewrite
reverso** no `vercel.json` do hub:

Arquivo fonte de verdade: `ufersin/frontend/vercel.json`

```
/loja/eletronica-loja                    -> vrtech "/"                (home)
/loja/eletronica-loja/catalogo           -> vrtech "/loja"            (catálogo)
/loja/eletronica-loja/catalogo/:path*    -> vrtech "/loja/:path*"
/loja/eletronica-loja/servicos           -> vrtech "/catalogo-servico"
/loja/eletronica-loja/consultar          -> vrtech "/consultar"
/loja/eletronica-loja/api/:path*         -> vrtech "/api/:path*"
/loja/eletronica-admin                   -> vrtech "/dashboard"
/loja/eletronica-admin/:path*            -> vrtech "/dashboard/:path*"
/loja/eletronica-admin/api/:path*        -> vrtech "/api/:path*"
/loja/eletronica-admin-login             -> vrtech "/login"
```

O navegador **nunca** vê `vrtech-jp.vercel.app` — sempre `resolutoo.com`.
Isso tem duas consequências estruturais que causaram a maioria dos bugs
reais encontrados e corrigidos nesta sessão:

1. **O Next.js router do vrtech nunca sabe que está atrás de um prefixo.**
   `usePathname()` sempre devolve o path interno (`/dashboard/agenda`),
   nunca o externo (`/loja/eletronica-admin/dashboard/agenda`). Qualquer
   `<Link>`/`redirect()`/`router.push()` com path absoluto "escapa" do
   proxy e cai em `resolutoo.com/dashboard` bare — rota que só existe no
   hub, não no vrtech. Isso produzia telas pretas, redirecionamentos pro
   app errado, e sessão "caindo".

2. **`fetch('/api/...')` relativo também escapa**, pelo mesmo motivo — o
   browser resolve contra `resolutoo.com`, não contra o vrtech. Sem os
   rewrites `/loja/eletronica-{loja,admin}/api/:path*` (adicionados nesta
   sessão), toda chamada de API client-side caía no catch-all de SPA do
   hub e devolvia HTML 200 em vez de JSON.

### Solução: `src/lib/storeProxyLink.tsx` (client) + `src/lib/serverProxy.ts` (server)

- **`StoreLink` / `AdminLink`**: substituem `<Link>`/`<a>` para navegação
  interna. Resolvem o prefixo real (`window.location.pathname`) **no
  momento do clique** (não no render — calcular cedo via `useEffect` cria
  janela de corrida com cliques rápidos) e navegam via
  `window.location.href` — nunca `router.push()`, que falha porque o path
  externo não existe na tabela de rotas do próprio Next.
- **`AdminToStoreLink`**: link de dentro do admin apontando pra vitrine
  pública (cruza os dois namespaces de proxy).
- **`apiPath(path)`**: idem para `fetch()` — prefixa `/api/...` com o
  namespace certo (`/loja/eletronica-admin` ou `/loja/eletronica-loja`)
  quando detecta que está sob proxy.
- **`adminAwareHref(href)`**: versão "pura" pra navegação programática
  (ex.: `window.location.href = adminAwareHref('/login')` após logout).
- **`src/lib/serverProxy.ts` → `adminRedirectTarget()`**: equivalente
  server-side, usado em Server Components (`redirect()`). Detecta o proxy
  via o header `x-forwarded-host` (Vercel injeta isso nas rewrites
  externas — confirmado ao vivo: direto, `x-forwarded-host === host`; via
  proxy, `x-forwarded-host = "resolutoo.com"`, `host` = domínio real do
  vrtech).
- **`src/middleware.ts`**: precisa morar em `src/middleware.ts`, **não**
  na raiz do repo, porque o projeto usa layout `src/app/` — Next.js exige
  isso nesse caso. Bug real: o middleware nunca foi compilado durante boa
  parte do desenvolvimento (confirmado via `middleware-manifest.json`
  vazio) até essa correção.

## 3. Autenticação — três sistemas separados

O ponto mais complexo do ramo eletrônica: três identidades/tokens
diferentes, para partes diferentes do app.

### 3.1 Sessão da PLATAFORMA (Supabase do projeto Resolutoo)

Protege `/dashboard` como um todo (`DashboardLayout`) e a maioria das
páginas que leem/escrevem direto no banco vrtech via `.from()` do Supabase.
Obtida normalmente via `src/app/login/page.tsx`
(`supabase.auth.signInWithPassword` contra
`NEXT_PUBLIC_RESOLUTOO_SUPABASE_URL`, o projeto da PLATAFORMA). Persistida
em cookie, renovada por `src/middleware.ts`.

**Ponte de sessão (bridge) vinda do hub** — o caminho real que praticamente
todo usuário usa hoje: o hub (`resolutoo.com/meu-plano`) é uma SPA que só
guarda a sessão do lojista em `localStorage`, nunca em cookie. Ao clicar
"Painel da loja", o hub manda `access_token`+`refresh_token` do Supabase da
plataforma via querystring `?b=` (base64url) numa única visita;
`src/middleware.ts` detecta isso, chama `supabase.auth.setSession(...)`, e
a MESMA request segue com o cookie já gravado na resposta. Sem redirect de
limpeza por design (um redirect construído a partir de `request.nextUrl`
usaria o host interno do vrtech e escaparia do proxy) — o `?b=` fica
visível na URL só nesse primeiro load.

### 3.2 Sessão do PRÓPRIO projeto Supabase do vrtech (dados de catálogo)

Tabelas como `products`, `stock_items`, `product_categories` etc. vivem no
projeto Supabase PRÓPRIO do vrtech (`NEXT_PUBLIC_SUPABASE_URL`, distinto do
`NEXT_PUBLIC_RESOLUTOO_SUPABASE_URL` da plataforma). O dashboard nunca
autentica contra esse projeto — toda escrita client-side roda como role
`anon`, com policies RLS liberando isso explicitamente.

### 3.3 JWT de AdminUser do `ecommerce-api` (Rust) — token "sombra"

Usado por `/dashboard` aba **Pedidos** e por **Financeiro**, que leem dados
reais do motor de e-commerce Rust (`ecommerce-api`), banco separado do
Supabase do vrtech.

**Corrigido nesta sessão** (antes era um gap crítico — Pedidos/Financeiro
sempre caíam em "sessão expirada" pra quem entrava via bridge, já que esse
token só era emitido dentro do formulário de login com senha, nunca no
fluxo de bridge):

- Novo endpoint interno no `ecommerce-api`: `POST /internal/mint-admin-token`
  (`ecommerce/backend/src/routes/internal.rs`), protegido pela mesma
  `INTERNAL_API_KEY` compartilhada dos outros endpoints backend-a-backend
  do arquivo. Recebe `{tenant_slug, admin_email}`, confia que quem chama já
  validou a identidade (o middleware do vrtech, que só chama isso depois
  de validar a sessão Supabase), e emite o MESMO JWT que o login normal
  emitiria — sem precisar da senha.
- `src/middleware.ts`, depois de validar a sessão via bridge, chama esse
  endpoint e grava o resultado num cookie legível por JS
  (`vrtech_admin_bridge`, não HttpOnly).
- `src/lib/resolutoo/adminApi.ts` → `resolveAdminToken()`: promove esse
  cookie pra `localStorage` (mesma chave `vrtech_admin_token` de sempre) na
  primeira chamada — o resto do código não mudou.
- **Achado adicional durante essa correção**: o tenant `vrtech` tinha sido
  apagado da tabela `tenants` do `ecommerce-api` numa limpeza anterior
  desta sessão e nunca foi re-seedado — sem ele, nem o endpoint novo
  funcionava. Reprovisionado via `/internal/provision-tenant` (endpoint já
  existente, reaproveitado, não recriado).

## 4. Fila confiável de WhatsApp (Redis)

**Problema**: `sendWhatsAppText()` (Evolution API) era um `fetch()` único
sem retry — timeout ou instabilidade momentânea perdia a mensagem
silenciosamente. Inaceitável para mensagens transacionais (reagendamento,
cancelamento, status de pagamento).

**Solução**: `src/lib/queue/` — fila backed por Redis (mesma instância
Railway já usada pelo resto da plataforma, `REDIS_PUBLIC_URL` do serviço
`Redis` no projeto `resolutoo`).

- **`deliverReliable(phone, content, opts)`** (`whatsappQueue.ts`): tenta o
  envio direto primeiro (path feliz, latência mínima — a UI não espera
  fila). Se falhar, enfileira num sorted set Redis (`wa:queue`), score
  combinando prioridade + timestamp (prioridade alta sempre sai primeiro
  do `ZPOPMIN`, FIFO dentro da mesma prioridade).
- **Prioridades**: `'high'` para reagendamento, cancelamento, status
  `em_pagamento`/`completed`, e pedido novo da loja — tudo onde atraso
  gera expectativa errada no cliente. `'normal'` para confirmações comuns.
- **Drenagem**: `GET /api/cron/whatsapp-drain` (protegido por
  `CRON_SECRET`), tenta reenviar até 20 jobs prontos por chamada, com
  backoff exponencial (1min → 2min → ... → até 30min) até 8 tentativas;
  depois disso vai pro dead-letter `wa:dead` (lista, últimos 200) pra
  inspeção manual.
- **Trigger da drenagem**: **não** é o Vercel Cron nativo — o plano é
  Hobby, que só permite schedule diário (`*/1 * * * *` foi rejeitado no
  deploy). É `.github/workflows/whatsapp-drain.yml`, GitHub Actions rodando
  a cada 5 minutos, chamando o endpoint via `curl` com o secret
  `WHATSAPP_DRAIN_SECRET`.
- **Pontos de disparo já cobertos**: `notifyReschedule`/`notifyCancellation`
  (`src/lib/agenda/notifications.ts`, com suporte a mensagem personalizada
  opcional — ver seção 5), `/api/whatsapp/notify` (status de solicitação,
  incluindo o aviso pro dono da loja), `/api/whatsapp/notify-store-order`
  (pedido novo da vitrine).
- **Fora de escopo, por não existir**: não há nenhum "polling de gateway de
  pagamento" no vrtech pra redirecionar — o Mercado Pago real é tratado
  inteiramente pelo `ecommerce-api` (Rust, via webhook, não polling), fora
  deste app. O que existe e foi coberto é o disparo de WhatsApp
  desencadeado por mudança de status de pagamento (`em_pagamento`), que
  agora tem prioridade alta na mesma fila.

## 5. Reagendamento/cancelamento — dialog em duas etapas

`/dashboard/agenda` (`AgendaClient.tsx`): o botão único **"Ação"** em cada
atendimento ativo abre um dialog seletor (Remarcar / Cancelar), mesmo
padrão visual do chooser "O que você quer fazer?" já usado para
criar/bloquear. Cada sub-fluxo tem:

- Campo de justificativa interna (auditoria, sempre obrigatório, ≥20
  caracteres — como sempre foi).
- Checkbox **"Enviar mensagem padrão"** (marcado por default). Desmarcado,
  exige uma textarea com mensagem personalizada (mínimo 10 caracteres),
  validado tanto no client quanto no servidor
  (`PATCH /api/appointments/{id}/reschedule`,
  `POST /api/appointments/{id}/cancel` aceitam `use_default_message` /
  `custom_message`).
- A mensagem (padrão via template do Template Zap, ou personalizada) vai
  literal ao cliente — nunca passa por um modelo de IA.

O campo **Serviço** do formulário "Novo agendamento" deixou de ser texto
livre: `ServicePicker` busca em `service_catalog_items` (mesmo cadastro
gerido em Produtos/Serviços), com busca por nome/tipo de reparo, e grava
`service_id` real no agendamento (antes só `service_label` texto era
enviado, sem vínculo com o cadastro).

## 6. Rotas do app (mapa completo)

Vitrine pública (proxiada sob `/loja/eletronica-loja`):

- `/` — home da loja
- `/loja`, `/loja/[id]` — catálogo e detalhe de produto
- `/catalogo-servico` — catálogo de serviços (conserto/manutenção)
- `/consultar` — consulta pública de status de pedido/serviço

Admin (proxiado sob `/loja/eletronica-admin`, protegido por sessão):

- `/login` (alias público: `/loja/eletronica-admin-login`)
- `/dashboard` — Solicitações **+ aba Pedidos** (absorvida aqui, não é mais
  rota separada)
- `/dashboard/agenda`, `/dashboard/produtos` (produtos+serviços+estoque, em
  abas), `/dashboard/servicodeslocamento`, `/dashboard/financeiro`,
  `/dashboard/assistente-ia`, `/dashboard/template-zap`, `/dashboard/conta`

`/dashboard/pedidos`, `/dashboard/catalogo` e `/dashboard/estoque` como
rotas próprias foram removidas/absorvidas — `catalogo`/`estoque` hoje só
redirecionam pra `/dashboard/produtos` (mesmo redirect, corrigido pra usar
`adminRedirectTarget` e não escapar do proxy).

## 7. Integrações externas

- **`ecommerce-api`** (Rust, Railway) — pedidos reais de compra e
  financeiro (seção 3.3). `NEXT_PUBLIC_ECOMMERCE_API_URL`.
- **`ufersin-api`** (Railway) — OAuth Mercado Pago do lojista
  (`MercadoPagoSection.tsx`), mesma sessão da plataforma (seção 3.1), sem
  token próprio. `NEXT_PUBLIC_RESOLUTOO_API_URL`.
- **Evolution API / WhatsApp** — instância própria do tenant vrtech
  (`loja-vrtech`), acessada via `src/lib/whatsapp/evolutionClient.ts`,
  sempre através da fila confiável (seção 4).
- **Redis** (Railway, serviço `Redis` do projeto `resolutoo`) — fila de
  WhatsApp. `REDIS_URL` no ambiente do vrtech aponta pro `REDIS_PUBLIC_URL`
  (o vrtech roda na Vercel, fora da rede privada do Railway).

## 8. Swagger / OpenAPI

As rotas do ramo eletrônica foram adicionadas ao **mesmo** documento
OpenAPI que já documenta a plataforma (`ufersin/backend/src/openapi.rs`,
servido pelo `ufersin-api`) — não é um Swagger separado. Um server
adicional `https://resolutoo.com` foi incluído no dropdown, e as rotas do
vrtech usam o path completo com o prefixo do proxy (ex.:
`/loja/eletronica-admin/api/appointments/{id}/reschedule`), sob tags
`Eletrônicos — Agenda`, `Eletrônicos — Assistente IA`,
`Eletrônicos — Template Zap`, `Eletrônicos — Solicitações`,
`Eletrônicos — WhatsApp`. Autenticação dessas rotas é por cookie de sessão
(a mesma da seção 3.1), não Bearer JWT — "Try it out" só funciona logado no
navegador em `resolutoo.com`, não direto pela UI do Swagger.

O vrtech também tem seu próprio `openapi.json` local
(`/api/docs/openapi.json`, `src/lib/agenda/openapi.ts`) — mais restrito,
cobre só agenda + tools da Assistente IA, usado internamente por ela. Não
foi removido; os dois coexistem.

## 9. Limitações conhecidas / débito técnico

Ver `docs/bugs/registry.yaml` para a lista completa. Status conhecido
nesta atualização:

- **VRTECH-BUG-004** (Pedidos/Financeiro 401 via bridge) — **corrigido**
  (seção 3.3).
- **VRTECH-BUG-005** (`fetch('/api/...')` relativo quebrando sob proxy) —
  **corrigido** (`apiPath()` + rewrites dedicados, seção 2).
- **VRTECH-BUG-006** (parâmetro `?b=` visível na URL após bridge) — ainda
  **aberto**, baixo risco (token de curta duração, aberto pelo próprio
  dono da loja numa aba nova).
- Sem worker dedicado para a fila Redis — a drenagem depende do GitHub
  Actions rodar (schedule "best effort", pode atrasar minutos em picos da
  plataforma GitHub). Suficiente para retry de mensagens, não para
  filas de latência sub-minuto.
