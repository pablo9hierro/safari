#!/usr/bin/env node
/**
 * Aplica as migrations de supabase/migrations/ no banco, em ordem, dentro de
 * uma transação por arquivo, e registra o que já rodou em `vrtech._migrations`
 * pra ser idempotente (rodar duas vezes não reaplica nada).
 *
 * Serve tanto pra rodar na mão quanto num passo de CI.
 *
 * Duas formas de autenticar (nesta ordem de preferência):
 *
 *   1. SUPABASE_ACCESS_TOKEN (`sbp_...`) + SUPABASE_PROJECT_REF
 *      Management API. É o caminho de CI: token revogável, sem senha de banco
 *      em lugar nenhum, e não depende de conectividade Postgres direta.
 *
 *   2. SUPABASE_DB_URL (`postgresql://...`)
 *      Conexão Postgres direta.
 *
 * A SUPABASE_SERVICE_ROLE_KEY NÃO serve para migration: ela autentica no
 * PostgREST, que expõe as tabelas via REST e não executa DDL.
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=xxxx npm run migrate
 *   SUPABASE_DB_URL="postgresql://..." npm run migrate
 *   npm run migrate:dry     (só lista o que seria aplicado)
 *
 *   node scripts/migrate.mjs --baseline-until=<arquivo.sql>
 *       Marca como aplicadas, SEM executar, todas as migrations até o arquivo
 *       informado (inclusive). Necessário uma única vez neste projeto: as
 *       migrations antigas foram rodadas à mão no SQL Editor antes deste
 *       runner existir, então reexecutá-las (seeds, CREATE POLICY) daria erro
 *       ou duplicaria dados.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')
const dryRun = process.argv.includes('--dry-run')
const baselineUntil = process.argv.find((a) => a.startsWith('--baseline-until='))?.split('=')[1]

const accessToken = process.env.SUPABASE_ACCESS_TOKEN
const projectRef = process.env.SUPABASE_PROJECT_REF
const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL

const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()

if (dryRun) {
  console.log(`${files.length} migration(s) em supabase/migrations/:`)
  for (const f of files) console.log('  -', f)
  process.exit(0)
}

/** Executa SQL e devolve as linhas. Implementado por cada backend. */
let runSql
let closeConnection = async () => {}

if (accessToken && projectRef) {
  const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`
  runSql = async (query) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`Management API ${res.status}: ${text}`)
    try {
      return JSON.parse(text)
    } catch {
      return []
    }
  }
  console.log(`Aplicando via Management API no projeto ${projectRef}.\n`)
} else if (dbUrl) {
  const { default: postgres } = await import('postgres')
  const sql = postgres(dbUrl, { max: 1, onnotice: () => {} })
  runSql = (query) => sql.unsafe(query)
  closeConnection = () => sql.end({ timeout: 5 })
  console.log('Aplicando via conexão Postgres direta.\n')
} else {
  console.error(`
Falta credencial para aplicar as migrations.

Use uma destas:

  SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=<ref> npm run migrate
      Token em supabase.com/dashboard/account/tokens

  SUPABASE_DB_URL="postgresql://..." npm run migrate
      Connection string no botão "Connect" do topo do dashboard

A SUPABASE_SERVICE_ROLE_KEY não funciona aqui — ela dá acesso ao PostgREST
(dados via REST), não ao Postgres (DDL).
`)
  process.exit(1)
}

/** Escapa string pra literal SQL (só usado com nomes de migration). */
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

try {
  await runSql('CREATE SCHEMA IF NOT EXISTS vrtech')
  await runSql(`
    CREATE TABLE IF NOT EXISTS vrtech._migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const rows = await runSql('SELECT name FROM vrtech._migrations')
  const applied = new Set((rows ?? []).map((r) => r.name))

  if (baselineUntil) {
    const cut = files.indexOf(baselineUntil)
    if (cut === -1) {
      console.error(`Arquivo não encontrado em supabase/migrations/: ${baselineUntil}`)
      await closeConnection()
      process.exit(1)
    }
    const toMark = files.slice(0, cut + 1).filter((f) => !applied.has(f))
    if (toMark.length === 0) {
      console.log('Baseline já registrado, nada a marcar.')
    } else {
      const values = toMark.map((n) => `(${lit(n)})`).join(', ')
      await runSql(`INSERT INTO vrtech._migrations (name) VALUES ${values} ON CONFLICT (name) DO NOTHING`)
      console.log(`Marcadas como aplicadas (sem executar) ${toMark.length} migration(s):`)
      for (const n of toMark) console.log('  -', n)
    }
    console.log('\nBaseline concluído. Rode `npm run migrate` para aplicar o que vier depois.')
    await closeConnection()
    process.exit(0)
  }

  const pending = files.filter((f) => !applied.has(f))

  if (pending.length === 0) {
    console.log(`Nada a aplicar — ${applied.size} migration(s) já registrada(s).`)
    await closeConnection()
    process.exit(0)
  }

  console.log(`${pending.length} migration(s) pendente(s):`)
  let failed = false
  for (const name of pending) {
    const content = await readFile(join(MIGRATIONS_DIR, name), 'utf8')
    process.stdout.write(`  → ${name} ... `)
    try {
      // Uma transação por arquivo: se falhar no meio, nada dela fica aplicado
      // e o registro em _migrations não é gravado.
      await runSql(`BEGIN;\n${content}\nINSERT INTO vrtech._migrations (name) VALUES (${lit(name)});\nCOMMIT;`)
      console.log('ok')
    } catch (e) {
      console.log('FALHOU')
      console.error(`\n${e.message}\n`)
      failed = true
      break
    }
  }
  if (failed) {
    await closeConnection()
    process.exit(1)
  }
  console.log('\nTodas as migrations pendentes foram aplicadas.')
} finally {
  await closeConnection()
}
