# Bichano que Amo

Web app mobile-first para gestão de cuidados felinos.

## Tecnologias

- Next.js 16 com App Router
- React 19
- TypeScript
- CSS Modules
- Supabase Auth, Postgres, Storage e Edge Functions

## Executar

```powershell
npm.cmd install
npm.cmd run dev
```

Acesse `http://localhost:3000`.

Sem variáveis do Supabase, o app funciona em modo demonstrativo e permite
alternar entre Cliente, Admin e Babá na tela de login.

## Configurar o Supabase

Crie `.env.local` a partir de `.env.local.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica
NEXT_PUBLIC_REQUIRE_STAFF_MFA=false
```

Execute uma única vez no SQL Editor todo o conteúdo de:

```text
supabase/reset_and_setup.sql
```

Esse arquivo é destrutivo: remove usuários e todos os dados anteriores do app,
apaga o schema `public` e recria o backend completo. Arquivos antigos do bucket
`pet-photos` não são removidos pelo SQL; apague-os antes pela tela do Storage
caso também queira eliminar as fotos. Não execute em produção com dados que
precisem ser preservados.

Publique a função de convite:

```powershell
npx supabase functions deploy invite-staff
```

Enquanto a verificação em duas etapas estiver pausada, mantenha o secret
`REQUIRE_STAFF_MFA=false` na Edge Function.

A função `invite-staff` valida a sessão dentro do próprio código. Por isso,
`supabase/config.toml` mantém `verify_jwt = false`, permitindo que o preflight
`OPTIONS` do navegador passe pelo CORS antes do `POST` autenticado.

Se o Supabase CLI mostrar `Access token not provided`, autentique primeiro:

```powershell
npx supabase login --token SEU_ACCESS_TOKEN
```

Crie o token em `Account > Access Tokens` no painel do Supabase. Depois publique
e configure os secrets:

```powershell
npx supabase functions deploy invite-staff --project-ref esbwbjuksedcdtkexoiv
npx supabase secrets set --project-ref esbwbjuksedcdtkexoiv REQUIRE_STAFF_MFA=false
```

Nunca coloque a chave `service_role` no navegador.

### E-mail de confirmação

No Supabase, ative a confirmação de e-mail em `Authentication > Providers > Email`.
Depois acesse `Authentication > Email Templates > Confirm signup` e use:

- Assunto: `Confirme seu cadastro | Bichano que Amo`
- Corpo: `supabase/email-templates/confirm-signup.html`

O template usa a variável oficial `{{ .ConfirmationURL }}` do Supabase.

## Papéis

- `admin`: gestão completa, equipe e controle manual dos pagamentos.
- `staff`: somente atendimentos atribuídos e dados necessários do tutor e pet.
- `client`: próprios bichanos, agendamentos e lembretes de pagamento.

Valores personalizados ficam em `client_service_prices`. O app não recebe nem
processa pagamentos: a administradora registra a quitação manualmente. Babás
não possuem acesso aos valores nem à tabela `payments`.

## Administrador inicial

Não existe cadastro público como administrador. Todo cadastro feito pela tela
do aplicativo nasce com `role = 'client'` e fica aguardando aprovação.

Para definir o administrador geral:

1. Depois do reset, crie o usuário em `Authentication > Users`.
2. Confirme o e-mail desse usuário.
3. Execute o SQL abaixo, substituindo o endereço pelo e-mail correto:

```sql
update public.profiles
set role = 'admin',
    active = true
where id = (
  select id from auth.users where email = 'contato@bichano.com'
);
```

O sistema identifica o tipo da conta pelo campo `public.profiles.role`.
Depois do login, o app carrega esse perfil e abre automaticamente o painel
correspondente: `admin`, `staff` ou `client`. Nunca use um seletor de papel no
cadastro público.

## Verificação

```powershell
npm.cmd run lint
npm.cmd run test
npm.cmd run build
```

Os arquivos JavaScript do protótipo anterior estão em `legacy/` apenas como
referência. A aplicação ativa está em `app/` e `components/`.
