# Acessos CLI / CI-CD — onde cada credencial vive

Cada vez que uma sessão precisa aplicar migration, redeployar ou mexer em infra,
essas são as credenciais que entram em jogo. **Nenhum valor de segredo fica
salvo neste arquivo nem em nenhum arquivo do repositório** — só onde encontrar
e como usar. Isso é proposital: um token colado num comando de shell não
persiste entre sessões do Claude Code (nem deveria, é exatamente o
comportamento de segurança correto) — por isso ele é pedido de novo às vezes.
Este documento existe pra que pedir de novo custe 10 segundos, não uma
investigação do zero.

---

## 1. Supabase (banco `vrtech`, projeto `zncpcsdpdkvjfknmmhpu`)

**Migrations** (`npm run migrate`) precisam de UMA destas duas (nunca as
duas): 

- `SUPABASE_DB_URL` — connection string Postgres direta. Pegar em
  supabase.com/dashboard/project/zncpcsdpdkvjfknmmhpu → botão **Connect**
  no topo → aba "Connection string" (URI). **Isto expira/muda se a senha do
  banco for resetada** — se um dia parar de funcionar, é isso.
- `SUPABASE_ACCESS_TOKEN` (`sbp_...`) + `SUPABASE_PROJECT_REF=zncpcsdpdkvjfknmmhpu`
  — token pessoal em supabase.com/dashboard/account/tokens. Mais estável
  (não expira por reset de senha do banco), mas é uma credencial de CONTA
  inteira (acesso a todos os projetos do usuário), não só este.

**Uso:**
```bash
SUPABASE_DB_URL="postgresql://...URL COLADA AQUI..." npm run migrate
# ou
SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=zncpcsdpdkvjfknmmhpu npm run migrate
```

`NEXT_PUBLIC_SUPABASE_URL` (a URL pública, sem ser a connection string) já
está em `.env.local` — não é a mesma coisa, não serve pra migrations.

`SUPABASE_SERVICE_ROLE_KEY` (se existir em `.env.local`) **também não
serve** pra migrations — dá acesso ao PostgREST (dados via REST), não ao
Postgres direto (DDL/schema).

---

## 2. Vercel (deploy do `vrtech`)

CLI já autenticado nesta máquina (`npx vercel whoami` confirma). Não pede
token — só:
```bash
npx vercel --prod --yes --force   # redeploy (usar --force + sem .vercel/output em disco pra garantir build fresco)
npx vercel env ls production      # listar env vars
npx vercel env add NOME production  # setar (lê do stdin)
```
Ver `DEPLOY_TROUBLESHOOTING.md` (na raiz do `ufersin`) pros bugs recorrentes
de deploy já caçados (CRLF, rootDirectory duplicado, cache de build, etc).

---

## 3. Railway (`ufersin-api`, `ecommerce-api`, etc — projeto plataforma)

Token já fica em `~/.railway/config.json` (`user.accessToken` OU
`user.token` — **o CLI alterna o nome do campo entre versões**, sempre
aceitar os dois, ver `redeploy_ufersin_api.mjs` como referência). CLI já
autenticado, não pede nada extra:
```bash
railway status --json
railway deployment list --service "<nome>"
```
Deploy de verdade do `ufersin-api` é via Docker Hub + GraphQL redeploy
(~build local + push), **não** `railway up` sozinho — ver
`project_ufersin_api_deploy_pipeline.md` na memória.

---

## 4. Plataforma Resolutoo (banco `ufersin`, schema `resolutoo`)

Credenciais já em arquivo local: `ufersin/.migration-tmp/ufer_vars.json`
(`DATABASE_URL`). **Cuidado com BOM** no início do JSON (`strip = (s) =>
s.replace(/^﻿/, '')` antes de `JSON.parse`, ver
`apply_0021_eletronica_shipping_prefs.mjs` como referência).

---

## 5. Regra geral pra qualquer sessão futura

Antes de perguntar "cadê o token", checar nesta ordem:
1. Este arquivo (`ACESSOS_CLI.md`).
2. `.env.local` do projeto (variáveis `NEXT_PUBLIC_*`/chaves já configuradas).
3. `ufersin/.migration-tmp/*.json` (credenciais da plataforma).
4. CLIs já logados (`vercel whoami`, `railway status`) — não pedem nada.

Se depois disso ainda faltar algo, é porque é uma credencial de verdade
sensível (DB URL, access token pessoal) que — por segurança — nunca fica
persistida em disco por uma sessão anterior. Nesse caso, pedir UMA vez,
de forma direta, sem re-explicar o óbvio.
