# TechFix — Guia de Setup

## 1. Supabase

### Criar projeto
1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto
2. Guarde a **URL** e a **anon key** do projeto (Settings > API)

### Banco de dados
1. Vá em **SQL Editor** e execute o conteúdo de `supabase/schema.sql`

### Storage
1. Vá em **Storage > New bucket**
2. Nome: `service-images`
3. Marque como **Public**
4. Em **Policies**, adicione:
   - `INSERT` para `anon`: permite upload de imagens pelos clientes
   - `SELECT` para todos: permite leitura pública das imagens

### Autenticação do dono
1. Vá em **Authentication > Users > Add user**
2. Crie um usuário com email/senha para o dono acessar o dashboard

## 2. Variáveis de ambiente

Edite o arquivo `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...
```

## 3. Rodar localmente

```bash
npm run dev
```

- Formulário do cliente: http://localhost:3000
- Dashboard do dono: http://localhost:3000/dashboard
- Login: http://localhost:3000/login

## 4. Deploy na Vercel

1. Faça push do projeto para GitHub
2. Acesse [vercel.com](https://vercel.com) e importe o repositório
3. Em **Environment Variables**, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy!

## Estrutura das rotas

| Rota | Descrição |
|------|-----------|
| `/` | Formulário do cliente |
| `/login` | Login do dono |
| `/dashboard` | Dashboard do dono (protegido) |
