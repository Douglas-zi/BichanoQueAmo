# Bichano que Amo

Web app mobile-first para gestão de cuidados felinos.

## Tecnologias

- Next.js 16 com App Router
- React 19
- TypeScript
- CSS Modules
- Supabase Auth, Postgres e Storage

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

Se o Supabase CLI mostrar `Access token not provided`, autentique primeiro:

```powershell
npx supabase login --token SEU_ACCESS_TOKEN
```

Crie o token em `Account > Access Tokens` no painel do Supabase.

Nunca coloque a chave `service_role` no navegador.

### Organização do SQL

O arquivo `supabase/reset_and_setup.sql` é a fonte canônica do backend atual.
Ele já inclui tabelas, tipos, funções RPC, políticas RLS, triggers, Storage e
dados iniciais.

Os arquivos em `supabase/patches/` são histórico de correções já incorporadas
ao setup consolidado. Use-os apenas como referência ao investigar mudanças
antigas; para configurar um ambiente novo, rode somente `reset_and_setup.sql`.

A pasta `supabase/functions/invite-staff/` também é legado. O cadastro de babás
ativo no app usa a RPC `admin_register_staff`, chamada diretamente pelo painel
administrativo.

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
