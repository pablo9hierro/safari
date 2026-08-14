#!/usr/bin/env node
/**
 * Aplica as migrations de supabase/migrations/ no banco, em ordem, dentro de
 * uma transação por arquivo, e registra o que já rodou em `vrtech._migrations`
 * pra ser idempotente (rodar duas vezes não reaplica nada).
 *
 * Serve tanto pra rodar na mão quanto num passo de CI.
 *
 * IMPORTANTE — credencial: isto precisa de uma conexão Postgres de verdade
 * (`SUPABASE_DB_URL`). A `SUPABASE_SERVICE_ROLE_KEY` NÃO serve aqui: ela
 * autentica no PostgREST, que só expõe as tabelas via REST e não executa DDL
 * (CREATE TABLE/CONSTRAINT). Pegue a connection string em:
 *   Supabase Dashboard → Project Settings → Database → Connection string → URI
 *
 * Uso:
 *   SUPABASE_DB_URL="postgresql://..." node scripts/migrate.mjs
 *   node scripts/migrate.mjs --dry-run    (só lista o que seria aplicado)
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations')
const dryRun = process.argv.includes('--dry-run')

const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL
if (!dbUrl && !dryRun) {
  console.error(`
Falta a connection string do Postgres.

  SUPABASE_DB_URL não está definida.

A SUPABASE_SERVICE_ROLE_KEY não funciona para migrations — ela dá acesso ao
PostgREST (dados via REST), não ao Postgres (DDL). Pegue a URI em:

  Supabase Dashboard → Project Settings → Database → Connection string → URI

e rode:

  SUPABASE_DB_URL="postgresql://postgres.<ref>:<senha>@<host>:5432/postgres" \\
    node scripts/migrate.mjs
`)
  process.exit(1)
}

const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()

if (dryRun) {
  console.log(`${files.length} migration(s) em supabase/migrations/:`)
  for (const f of files) console.log('  -', f)
  process.exit(0)
}

const sql = postgres(dbUrl, { max: 1, onnotice: () => {} })

try {
  await sql`CREATE SCHEMA IF NOT EXISTS vrtech`
  await sql`
    CREATE TABLE IF NOT EXISTS vrtech._migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  const applied = new Set((await sql`SELECT name FROM vrtech._migrations`).map((r) => r.name))
  const pending = files.filter((f) => !applied.has(f))

  if (pending.length === 0) {
    console.log(`Nada a aplicar — ${applied.size} migration(s) já registrada(s).`)
    process.exit(0)
  }

  console.log(`${pending.length} migration(s) pendente(s):`)
  for (const name of pending) {
    const content = await readFile(join(MIGRATIONS_DIR, name), 'utf8')
    process.stdout.write(`  → ${name} ... `)
    try {
      // Uma transação por arquivo: se a migration falhar no meio, nada dela
      // fica aplicado e o registro não é gravado.
      await sql.begin(async (tx) => {
        await tx.unsafe(content)
        await tx`INSERT INTO vrtech._migrations (name) VALUES (${name})`
      })
      console.log('ok')
    } catch (e) {
      console.log('FALHOU')
      console.error(`\n${e.message}\n`)
      process.exit(1)
    }
  }
  console.log('\nTodas as migrations pendentes foram aplicadas.')
} finally {
  await sql.end({ timeout: 5 })
}
