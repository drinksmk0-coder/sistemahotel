# Deploy no Vercel

Este projeto foi ajustado para evitar o 404 apos login em rotas como `/painel`, `/mapa`, `/reservas` e outras rotas internas.

## O que foi corrigido

- `vercel.json` agora inclui fallback para rotas internas do app.
- O login aguarda a sessao Supabase estar disponivel antes de navegar para `/painel`.
- As guards de `/` e das rotas autenticadas usam `getSession()` antes de validar o usuario.
- A tela 404/erro foi padronizada em portugues.

## Variaveis obrigatorias no Vercel

Configure em **Project Settings > Environment Variables**:

```txt
VITE_SUPABASE_URL=<url do seu Supabase>
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable/anon key do Supabase>
SUPABASE_URL=<mesma url do Supabase>
SUPABASE_PUBLISHABLE_KEY=<mesma publishable/anon key do Supabase>
```

O app usa `VITE_*` no navegador e as variaveis sem `VITE_` no SSR.

## Supabase Auth

No Supabase, configure:

- Site URL: `https://SEU-DOMINIO.vercel.app`
- Redirect URLs:
  - `https://SEU-DOMINIO.vercel.app`
  - `https://SEU-DOMINIO.vercel.app/auth`
  - `https://SEU-DOMINIO.vercel.app/painel`

## Comandos

```bash
npm install
npm run build
```

No Vercel, deixe:

- Install Command: `npm install`
- Build Command: `npm run build`

## Observacao sobre a validacao local

O client e o SSR compilaram localmente. O empacotamento final Nitro/Vercel falhou apenas no sandbox local do Codex por `EPERM: readlink 'C:\Users\data1'`, uma restricao de permissao do ambiente Windows usado aqui. Esse erro nao vem do codigo do app e nao deve ocorrer no ambiente Linux do Vercel.
