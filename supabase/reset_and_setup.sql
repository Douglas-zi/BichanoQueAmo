-- BICHANO QUE AMO - RESET COMPLETO E SETUP UNICO
-- ATENCAO: este arquivo apaga usuarios e dados relacionais do app.
-- Execute o arquivo inteiro no SQL Editor de um projeto Supabase de desenvolvimento.
-- O Supabase nao permite apagar arquivos do Storage diretamente por SQL.
-- Fotos antigas devem ser removidas em Storage > pet-photos antes do reset,
-- caso seja necessario eliminar tambem os arquivos.

delete from auth.users;

drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;

create extension if not exists pgcrypto with schema extensions;

create type public.user_role as enum ('client', 'staff', 'admin');
create type public.appointment_status as enum ('requested', 'confirmed', 'in_progress', 'completed', 'cancelled');
create type public.payment_status as enum ('pending', 'paid', 'overdue', 'cancelled', 'refunded');
create type public.discount_type as enum ('fixed');
create type public.waitlist_status as enum ('waiting', 'approved', 'rejected', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  phone text,
  address text,
  profession text,
  emergency_contact_name text,
  emergency_contact_phone text,
  avatar_path text,
  role public.user_role not null default 'client',
  active boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  species text not null default 'cat' check (species = 'cat'),
  breed text,
  birth_date date,
  approximate_age text,
  sex text check (sex in ('female', 'male', 'unknown')),
  photo_path text,
  notes text,
  medical_notes text,
  has_health_condition boolean not null default false,
  health_condition_details text,
  uses_medication boolean not null default false,
  medication_details text,
  has_allergy boolean not null default false,
  allergy_details text,
  veterinarian_contact text,
  intake_observations text,
  intake_completed_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  duration_minutes integer not null check (duration_minutes > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_prices (
  service_id uuid primary key references public.services(id) on delete cascade,
  price_cents integer not null check (price_cents > 0),
  updated_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value_integer integer,
  updated_at timestamptz not null default now()
);

create table public.client_service_prices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, service_id)
);

create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  assigned_to uuid references public.profiles(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'requested',
  address text,
  client_notes text,
  visit_count integer not null default 1 check (visit_count > 0),
  extra_pet_count integer not null default 0 check (extra_pet_count >= 0),
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.waitlist_requests (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  requested_starts_at timestamptz not null,
  address text,
  client_notes text,
  status public.waitlist_status not null default 'waiting',
  resolved_appointment_id uuid references public.appointments(id) on delete set null,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointment_notes (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  note text not null,
  visible_to_client boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  due_date date not null,
  status public.payment_status not null default 'pending',
  paid_at timestamptz,
  reminder_sent_at timestamptz,
  payment_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  kind text not null default 'general',
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  appointments boolean not null default true,
  payments boolean not null default true,
  news boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_type public.discount_type not null default 'fixed',
  discount_value integer not null check (discount_value > 0),
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  times_used integer not null default 0,
  benefit_months integer check (benefit_months is null),
  active boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  assigned_client_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index discount_codes_code_unique_idx on public.discount_codes (upper(code));

create table public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_code_id uuid not null references public.discount_codes(id) on delete restrict,
  client_id uuid not null references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  valid_until timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (discount_code_id, client_id)
);

create index pets_owner_id_idx on public.pets(owner_id);
create index appointments_assigned_to_idx on public.appointments(assigned_to);
create index appointments_starts_at_idx on public.appointments(starts_at);
create index waitlist_requests_status_idx on public.waitlist_requests(status);
create index waitlist_requests_requested_starts_at_idx on public.waitlist_requests(requested_starts_at);
create index notifications_user_id_idx on public.notifications(user_id);

create function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger pets_updated before update on public.pets for each row execute function public.set_updated_at();
create trigger services_updated before update on public.services for each row execute function public.set_updated_at();
create trigger appointments_updated before update on public.appointments for each row execute function public.set_updated_at();
create trigger waitlist_requests_updated before update on public.waitlist_requests for each row execute function public.set_updated_at();
create trigger payments_updated before update on public.payments for each row execute function public.set_updated_at();
create trigger discounts_updated before update on public.discount_codes for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public set row_security = off as $$
begin
  insert into public.profiles (id, email, full_name, role, active)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'client', false)
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(public.profiles.full_name, ''), nullif(excluded.full_name, ''), public.profiles.full_name);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_user();

create function public.is_active_user()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create function public.is_admin()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

create function public.is_staff()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('staff', 'admin') and active);
$$;

create function public.is_client()
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'client' and active);
$$;

create function public.user_owns_pet(target_pet_id uuid)
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select public.is_client() and exists (
    select 1 from public.pets where id = target_pet_id and owner_id = auth.uid()
  );
$$;

create function public.staff_is_assigned_to_appointment(target_appointment_id uuid)
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select public.is_staff() and exists (
    select 1 from public.appointments where id = target_appointment_id and assigned_to = auth.uid()
  );
$$;

create function public.staff_is_assigned_to_pet(target_pet_id uuid)
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select public.is_staff() and exists (
    select 1 from public.appointments
    where pet_id = target_pet_id and assigned_to = auth.uid() and status <> 'cancelled'
  );
$$;

create function public.staff_can_view_owner(target_owner_id uuid)
returns boolean language sql stable security definer
set search_path = public set row_security = off as $$
  select public.is_staff() and exists (
    select 1 from public.appointments
    join public.pets on pets.id = appointments.pet_id
    where pets.owner_id = target_owner_id and appointments.assigned_to = auth.uid()
  );
$$;

create function public.set_staff_access(target_user_id uuid, access_enabled boolean)
returns void language plpgsql security definer
set search_path = public set row_security = off as $$
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem alterar acessos'; end if;
  if target_user_id = auth.uid() then raise exception 'Nao altere o proprio acesso'; end if;
  update public.profiles set role = 'staff', active = access_enabled
  where id = target_user_id and role <> 'admin';
  if not found then raise exception 'Perfil nao encontrado ou protegido'; end if;
end;
$$;

create function public.admin_pending_clients_v2()
returns table (
  id uuid, full_name text, email text, phone text, active boolean,
  onboarding_completed_at timestamptz, email_confirmed boolean, welcome_code text
)
language plpgsql security definer
set search_path = public, auth set row_security = off as $$
begin
  if not public.is_admin() then raise exception 'Apenas a administradora pode listar clientes'; end if;

  insert into public.profiles (id, email, full_name, role, active)
  select users.id, users.email, coalesce(users.raw_user_meta_data ->> 'full_name', ''), 'client', false
  from auth.users users
  left join public.profiles profiles on profiles.id = users.id
  where profiles.id is null
  on conflict (id) do nothing;

  return query
  select profiles.id, nullif(profiles.full_name, ''), coalesce(profiles.email, users.email),
    profiles.phone, profiles.active, profiles.onboarding_completed_at,
    users.email_confirmed_at is not null,
    (select codes.code from public.discount_codes codes
     where codes.assigned_client_id = profiles.id order by codes.created_at desc limit 1)
  from public.profiles profiles
  join auth.users users on users.id = profiles.id
  where profiles.role = 'client'
  order by profiles.active asc, users.created_at desc;
end;
$$;

create function public.admin_review_client_v2(target_user_id uuid, review_action text)
returns text language plpgsql security definer
set search_path = public, auth set row_security = off as $$
declare granted_code text;
begin
  if not public.is_admin() then raise exception 'Apenas a administradora pode revisar clientes'; end if;
  if review_action = 'approve' then
    update public.profiles set role = 'client', active = true where id = target_user_id;
    if not found then raise exception 'Cliente nao encontrado'; end if;
    select code into granted_code from public.discount_codes where assigned_client_id = target_user_id limit 1;
    if granted_code is null then
      granted_code := 'BQA-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
      insert into public.discount_codes (
        code, discount_value, max_uses, benefit_months, created_by, assigned_client_id
      ) values (granted_code, 1000, 1, 6, auth.uid(), target_user_id);
    end if;
    return granted_code;
  elsif review_action = 'delete' then
    if exists (
      select 1 from public.appointments join public.pets on pets.id = appointments.pet_id
      where pets.owner_id = target_user_id
    ) then raise exception 'Cliente possui historico e nao pode ser excluido'; end if;
    delete from auth.users where id = target_user_id;
    return null;
  end if;
  raise exception 'Acao invalida';
end;
$$;

create function public.admin_approve_client_v3(target_user_id uuid)
returns boolean language plpgsql security definer
set search_path = public set row_security = off as $$
begin
  if not public.is_admin() then raise exception 'Apenas a administradora pode aprovar clientes'; end if;
  update public.profiles
  set role = 'client', active = true, updated_at = now()
  where id = target_user_id and role = 'client';
  if not found then raise exception 'Cliente nao encontrado'; end if;
  return true;
end;
$$;

create function public.admin_recover_client_v3(requested_email text)
returns uuid language plpgsql security definer
set search_path = public, auth set row_security = off as $$
declare target_user auth.users%rowtype;
begin
  if not public.is_admin() then raise exception 'Apenas a administradora pode recuperar cadastros'; end if;
  select * into target_user from auth.users where lower(email) = lower(trim(requested_email)) limit 1;
  if not found then raise exception 'Este e-mail nao existe em Authentication Users'; end if;
  if exists (select 1 from public.profiles where id = target_user.id and role in ('admin', 'staff')) then
    raise exception 'Esta conta pertence a equipe';
  end if;
  insert into public.profiles (id, email, full_name, role, active)
  values (target_user.id, target_user.email, coalesce(target_user.raw_user_meta_data ->> 'full_name', ''), 'client', false)
  on conflict (id) do update set email = excluded.email, role = 'client', active = false;
  return target_user.id;
end;
$$;

create function public.admin_register_staff(requested_email text, requested_full_name text)
returns uuid language plpgsql security definer
set search_path = public, auth set row_security = off as $$
declare
  target_user auth.users%rowtype;
  normalized_email text := lower(trim(requested_email));
  normalized_name text := trim(requested_full_name);
begin
  if not public.is_admin() then raise exception 'Apenas a administradora pode cadastrar babas'; end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(normalized_name) < 2 then
    raise exception 'Nome ou e-mail invalido';
  end if;

  select * into target_user from auth.users where lower(email) = normalized_email limit 1;
  if not found then
    raise exception 'Peça para a babá criar uma conta pelo botão Cadastrar antes de adicioná-la à equipe';
  end if;

  if exists (select 1 from public.profiles where id = target_user.id and role = 'admin') then
    raise exception 'Esta conta ja e administradora';
  end if;

  insert into public.profiles (id, email, full_name, role, active)
  values (target_user.id, target_user.email, normalized_name, 'staff', true)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = 'staff',
    active = true,
    updated_at = now();

  return target_user.id;
end;
$$;

create function public.complete_client_intake(
  tutor_full_name text, tutor_phone text, tutor_address text, tutor_profession text,
  emergency_name text, emergency_phone text, pet_name text, pet_sex text,
  pet_breed text, pet_age text, health_condition boolean, health_details text,
  medication_use boolean, medication_details text, allergy boolean,
  allergy_details text, veterinarian text, observations text
)
returns uuid language plpgsql security definer
set search_path = public set row_security = off as $$
declare new_pet_id uuid;
begin
  if not public.is_client() then raise exception 'Ficha disponivel apenas para clientes aprovados'; end if;
  if trim(coalesce(tutor_full_name, '')) = '' or trim(coalesce(tutor_phone, '')) = ''
    or trim(coalesce(tutor_address, '')) = '' or trim(coalesce(pet_name, '')) = ''
  then raise exception 'Preencha os campos obrigatorios'; end if;
  update public.profiles set full_name = trim(tutor_full_name), phone = trim(tutor_phone),
    address = trim(tutor_address), profession = nullif(trim(tutor_profession), ''),
    emergency_contact_name = nullif(trim(emergency_name), ''),
    emergency_contact_phone = nullif(trim(emergency_phone), ''),
    onboarding_completed_at = now()
  where id = auth.uid();
  insert into public.pets (
    owner_id, name, sex, breed, approximate_age, has_health_condition,
    health_condition_details, uses_medication, medication_details, has_allergy,
    allergy_details, veterinarian_contact, intake_observations, intake_completed_at
  ) values (
    auth.uid(), trim(pet_name), nullif(pet_sex, ''), nullif(trim(pet_breed), ''),
    nullif(trim(pet_age), ''), health_condition,
    case when health_condition then nullif(trim(health_details), '') end,
    medication_use, case when medication_use then nullif(trim(medication_details), '') end,
    allergy, case when allergy then nullif(trim(allergy_details), '') end,
    nullif(trim(veterinarian), ''), nullif(trim(observations), ''), now()
  ) returning id into new_pet_id;
  return new_pet_id;
end;
$$;

create function public.get_standard_visit_price()
returns table(service_id uuid, price_cents integer)
language plpgsql security definer
set search_path = public set row_security = off as $$
begin
  if not (public.is_client() or public.is_staff() or public.is_admin()) then raise exception 'Sessao invalida'; end if;
  return query
  select services.id, coalesce(prices.price_cents, settings.value_integer)
  from public.services services
  left join public.service_prices prices on prices.service_id = services.id
  left join public.app_settings settings on settings.key = 'standard_visit_price_cents'
  where services.name = 'Cat sitting' limit 1;
end;
$$;

create function public.set_standard_visit_price(requested_price_cents integer)
returns integer language plpgsql security definer
set search_path = public set row_security = off as $$
declare target_service_id uuid;
begin
  if not public.is_admin() then raise exception 'Sessao administrativa invalida'; end if;
  if requested_price_cents is null or requested_price_cents <= 0 then raise exception 'Valor invalido'; end if;
  select id into target_service_id from public.services where name = 'Cat sitting';
  insert into public.app_settings(key, value_integer, updated_at)
  values ('standard_visit_price_cents', requested_price_cents, now())
  on conflict(key) do update set value_integer = excluded.value_integer, updated_at = now();
  insert into public.service_prices(service_id, price_cents)
  values(target_service_id, requested_price_cents)
  on conflict(service_id) do update set price_cents = excluded.price_cents;
  return requested_price_cents;
end;
$$;

create function public.set_service_price(target_service_id uuid, requested_price_cents integer)
returns integer language plpgsql security definer
set search_path = public set row_security = off as $$
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem alterar valores'; end if;
  insert into public.service_prices(service_id, price_cents)
  values(target_service_id, requested_price_cents)
  on conflict(service_id) do update set price_cents = excluded.price_cents;
  return requested_price_cents;
end;
$$;

create function public.request_appointment(
  requested_pet_id uuid, requested_service_id uuid, requested_starts_at timestamptz,
  requested_address text, requested_notes text default null, join_waitlist boolean default false,
  requested_visit_count integer default 1, requested_extra_pet_count integer default 0
)
returns uuid language plpgsql security definer
set search_path = public set row_security = off as $$
declare duration integer; created_id uuid; daily_limit integer; day_count integer; owner_name text;
begin
  if not public.user_owns_pet(requested_pet_id) then raise exception 'Bichano invalido'; end if;
  if requested_starts_at <= now() then raise exception 'Escolha um horario futuro'; end if;
  if requested_visit_count < 1 then raise exception 'Quantidade de visitas invalida'; end if;
  if requested_extra_pet_count < 0 then raise exception 'Quantidade de gatos extras invalida'; end if;
  select duration_minutes into duration from public.services where id = requested_service_id and active;
  if duration is null then raise exception 'Servico indisponivel'; end if;
  select coalesce(value_integer, 4) into daily_limit from public.app_settings where key = 'max_daily_appointments';
  select count(distinct starts_at) into day_count from public.appointments
  where status <> 'cancelled'
    and starts_at >= date_trunc('day', requested_starts_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    and starts_at < (date_trunc('day', requested_starts_at at time zone 'America/Sao_Paulo') + interval '1 day') at time zone 'America/Sao_Paulo';
  if day_count >= daily_limit then
    if join_waitlist then
      insert into public.waitlist_requests(pet_id, service_id, requested_starts_at, address, client_notes)
      values(requested_pet_id, requested_service_id, requested_starts_at, trim(requested_address), nullif(trim(requested_notes), ''))
      returning id into created_id;
      select profiles.full_name into owner_name from public.pets join public.profiles on profiles.id = pets.owner_id where pets.id = requested_pet_id;
      insert into public.notifications(user_id, title, body, kind, related_id)
      select profiles.id, 'Pedido de encaixe', coalesce(nullif(owner_name, ''), 'Cliente') || ' entrou na lista de espera para ' ||
        to_char(requested_starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
        'waitlist_request', created_id
      from public.profiles
      where role = 'admin' and active;
      return created_id;
    end if;
    raise exception 'Este dia esta lotado. Voce pode entrar na lista de espera para pedir um encaixe.';
  end if;
  insert into public.appointments(pet_id, service_id, starts_at, ends_at, address, client_notes, visit_count, extra_pet_count)
  values(requested_pet_id, requested_service_id, requested_starts_at,
    requested_starts_at + make_interval(mins => duration), trim(requested_address),
    nullif(trim(requested_notes), ''), requested_visit_count, requested_extra_pet_count) returning id into created_id;
  return created_id;
end;
$$;

create function public.manage_waitlist_request(
  target_waitlist_id uuid, review_action text, requested_assigned_to uuid default null,
  requested_starts_at timestamptz default null
)
returns uuid language plpgsql security definer
set search_path = public set row_security = off as $$
declare selected public.waitlist_requests%rowtype; duration integer; created_id uuid; owner uuid; final_starts_at timestamptz;
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem organizar encaixes'; end if;
  select * into selected from public.waitlist_requests where id = target_waitlist_id for update;
  if not found then raise exception 'Pedido de encaixe nao encontrado'; end if;
  if selected.status <> 'waiting' then raise exception 'Este pedido ja foi revisado'; end if;
  if review_action = 'reject' then
    update public.waitlist_requests set status = 'rejected', resolved_by = auth.uid(), resolved_at = now()
    where id = target_waitlist_id;
    select owner_id into owner from public.pets where id = selected.pet_id;
    insert into public.notifications(user_id, title, body, kind, related_id)
    values(owner, 'Pedido de encaixe revisado',
      'Nao conseguimos encaixar este horario no momento. Fale conosco se quiser tentar outra data.',
      'waitlist_request', target_waitlist_id);
    return null;
  elsif review_action = 'approve' then
    select duration_minutes into duration from public.services where id = selected.service_id;
    if duration is null then raise exception 'Servico indisponivel'; end if;
    final_starts_at := coalesce(requested_starts_at, selected.requested_starts_at);
    insert into public.appointments(pet_id, service_id, assigned_to, starts_at, ends_at, status, address, client_notes, internal_notes)
    values(selected.pet_id, selected.service_id, requested_assigned_to, final_starts_at,
      final_starts_at + make_interval(mins => duration), 'confirmed', selected.address,
      selected.client_notes, 'Criado a partir da lista de espera')
    returning id into created_id;
    update public.waitlist_requests set status = 'approved', resolved_appointment_id = created_id,
      resolved_by = auth.uid(), resolved_at = now()
    where id = target_waitlist_id;
    return created_id;
  end if;
  raise exception 'Acao invalida';
end;
$$;

create function public.manage_appointment(
  target_appointment_id uuid, requested_status public.appointment_status,
  requested_assigned_to uuid default null, requested_starts_at timestamptz default null
)
returns void language plpgsql security definer
set search_path = public set row_security = off as $$
declare duration integer;
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem organizar a agenda'; end if;
  select services.duration_minutes into duration from public.appointments
  join public.services on services.id = appointments.service_id
  where appointments.id = target_appointment_id;
  if duration is null then raise exception 'Agendamento nao encontrado'; end if;
  update public.appointments set status = requested_status, assigned_to = requested_assigned_to,
    starts_at = coalesce(requested_starts_at, starts_at),
    ends_at = case when requested_starts_at is null then ends_at
      else requested_starts_at + make_interval(mins => duration) end
  where id = target_appointment_id;
end;
$$;

create function public.review_appointment_request(
  target_appointment_id uuid,
  review_action text,
  requested_assigned_to uuid default null
)
returns void language plpgsql security definer
set search_path = public set row_security = off as $$
declare selected public.appointments%rowtype; sitter public.profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem revisar solicitacoes'; end if;
  select * into selected from public.appointments
  where id = target_appointment_id
  for update;
  if not found then raise exception 'Agendamento nao encontrado'; end if;
  if selected.status <> 'requested' then raise exception 'Esta solicitacao ja foi revisada'; end if;

  if review_action = 'approve' then
    if requested_assigned_to is null then raise exception 'Escolha a baba responsavel'; end if;
    select * into sitter from public.profiles
    where id = requested_assigned_to and role in ('staff', 'admin') and active;
    if not found then raise exception 'Baba responsavel indisponivel'; end if;
    update public.appointments
    set status = 'confirmed',
        assigned_to = requested_assigned_to
    where id = target_appointment_id;
    return;
  elsif review_action = 'reject' then
    update public.appointments
    set status = 'cancelled',
        assigned_to = null,
        internal_notes = concat_ws(E'\n', nullif(internal_notes, ''), 'Solicitacao recusada pela administradora')
    where id = target_appointment_id;
    return;
  end if;

  raise exception 'Acao invalida';
end;
$$;

create function public.cancel_my_appointment(target_appointment_id uuid)
returns void language plpgsql security definer
set search_path = public set row_security = off as $$
declare selected public.appointments%rowtype;
begin
  select appointments.* into selected
  from public.appointments
  join public.pets on pets.id = appointments.pet_id
  where appointments.id = target_appointment_id
    and pets.owner_id = auth.uid()
  for update of appointments;

  if not found then raise exception 'Agendamento nao encontrado'; end if;
  if selected.status = 'cancelled' then return; end if;
  if selected.status not in ('requested', 'confirmed') then
    raise exception 'Esta visita nao pode mais ser cancelada pelo app';
  end if;

  update public.appointments
  set status = 'cancelled', internal_notes = concat_ws(E'\n', nullif(internal_notes, ''), 'Cancelado pelo tutor no app')
  where id = target_appointment_id;
end;
$$;

create function public.record_visit(target_appointment_id uuid, visit_note text, complete_visit boolean default false)
returns void language plpgsql security definer
set search_path = public set row_security = off as $$
begin
  if not public.is_admin() and not public.staff_is_assigned_to_appointment(target_appointment_id)
    then raise exception 'Atendimento nao atribuido'; end if;
  insert into public.appointment_notes(appointment_id, created_by, note)
  values(target_appointment_id, auth.uid(), trim(visit_note));
  update public.appointments set status = case when complete_visit then 'completed' else 'in_progress' end
  where id = target_appointment_id;
end;
$$;

create function public.staff_update_assigned_visit(
  target_appointment_id uuid,
  requested_status public.appointment_status,
  visit_note text default null
)
returns void language plpgsql security definer
set search_path = public set row_security = off as $$
begin
  if not public.staff_is_assigned_to_appointment(target_appointment_id) then
    raise exception 'Atendimento nao atribuido';
  end if;

  if requested_status not in ('confirmed', 'in_progress', 'completed') then
    raise exception 'Status indisponivel para baba';
  end if;

  if nullif(trim(coalesce(visit_note, '')), '') is not null then
    insert into public.appointment_notes(appointment_id, created_by, note)
    values(target_appointment_id, auth.uid(), trim(visit_note));
  end if;

  update public.appointments
  set status = requested_status
  where id = target_appointment_id and assigned_to = auth.uid();
end;
$$;

create function public.activate_discount_code(requested_code text)
returns table(activated boolean, valid_until timestamptz, discount_value integer, message text)
language plpgsql security definer
set search_path = public set row_security = off as $$
declare selected public.discount_codes%rowtype; expiry timestamptz; already_active boolean;
begin
  if not public.is_client() then return query select false, null::timestamptz, null::integer, 'Somente clientes ativos'; return; end if;
  select * into selected from public.discount_codes
  where upper(code) = upper(trim(requested_code)) and active
    and (expires_at is null or expires_at >= now())
    and (max_uses is null or times_used < max_uses) for update;
  if not found then return query select false, null::timestamptz, null::integer, 'Codigo invalido'; return; end if;
  if selected.assigned_client_id is not null and selected.assigned_client_id <> auth.uid() then
    return query select false, null::timestamptz, null::integer, 'Codigo intransferivel'; return;
  end if;
  if exists (
    select 1 from public.discount_redemptions
    where discount_code_id = selected.id and client_id <> auth.uid() and cancelled_at is null
  ) then
    return query select false, null::timestamptz, null::integer, 'Codigo intransferivel'; return;
  end if;
  select true, discount_redemptions.valid_until into already_active, expiry
  from public.discount_redemptions
  where discount_code_id = selected.id and client_id = auth.uid() and cancelled_at is null;
  if coalesce(already_active, false) then return query select true, expiry, selected.discount_value, 'Codigo ja ativado'; return; end if;
  expiry := null;
  insert into public.discount_redemptions(discount_code_id, client_id, valid_until)
  values(selected.id, auth.uid(), expiry);
  update public.discount_codes set times_used = times_used + 1 where id = selected.id;
  return query select true, expiry, selected.discount_value, 'Codigo ativado';
end;
$$;

create function public.my_active_discount()
returns table(discount_code text, discount_value integer, valid_until timestamptz)
language sql stable security definer
set search_path = public set row_security = off as $$
  select codes.code, codes.discount_value, redemption.valid_until
  from public.discount_redemptions redemption
  join public.discount_codes codes on codes.id = redemption.discount_code_id
  where redemption.client_id = auth.uid()
    and redemption.cancelled_at is null
    and codes.active
    and (redemption.valid_until is null or redemption.valid_until >= now())
  order by codes.discount_value desc, redemption.redeemed_at desc
  limit 1;
$$;

create function public.my_welcome_code()
returns text language sql stable security definer
set search_path = public set row_security = off as $$
  select code from public.discount_codes
  where assigned_client_id = auth.uid() and active order by created_at desc limit 1;
$$;

create function public.generate_overdue_payment_reminders()
returns integer language plpgsql security definer
set search_path = public set row_security = off as $$
declare created_count integer;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Apenas administradores'; end if;
  update public.payments set status = 'overdue'::public.payment_status where status = 'pending' and due_date < current_date;
  with inserted as (
    insert into public.notifications(user_id, title, body, kind, related_id)
    select pets.owner_id, 'Lembrete de pagamento',
      'Existe um pagamento pendente com vencimento em ' || to_char(payments.due_date, 'DD/MM/YYYY'),
      'payment_overdue', payments.id
    from public.payments
    join public.appointments on appointments.id = payments.appointment_id
    join public.pets on pets.id = appointments.pet_id
    where payments.status = 'overdue' and payments.reminder_sent_at is null
    returning related_id
  )
  update public.payments set reminder_sent_at = now() where id in (select related_id from inserted);
  get diagnostics created_count = row_count;
  return created_count;
end;
$$;

create function public.sync_appointment_payment()
returns trigger language plpgsql security definer
set search_path = public set row_security = off as $$
declare owner uuid; amount integer; discount integer; extra_cat_fee integer := 1000;
begin
  select owner_id into owner from public.pets where id = new.pet_id;

  if new.status = 'cancelled' then
    update public.payments set status = 'cancelled'::public.payment_status
    where appointment_id = new.id and status in ('pending', 'overdue');
  end if;

  if new.status not in ('confirmed', 'cancelled') then return new; end if;

  select coalesce(custom.amount_cents, base.price_cents) into amount
  from public.service_prices base
  left join public.client_service_prices custom on custom.service_id = base.service_id
    and custom.client_id = owner and custom.active
  where base.service_id = new.service_id;
  select max(codes.discount_value) into discount
  from public.discount_redemptions redemption
  join public.discount_codes codes on codes.id = redemption.discount_code_id
  where redemption.client_id = owner and redemption.cancelled_at is null
    and (redemption.valid_until is null or redemption.valid_until >= new.starts_at) and codes.active;
  if amount is null then return new; end if;

  insert into public.payments(appointment_id, amount_cents, due_date)
  select ranked.id,
    case when ranked.position = 1
      then greatest(amount - coalesce(discount, 0), 1) * greatest(ranked.visit_count, 1)
        + greatest(ranked.extra_pet_count, 0) * extra_cat_fee * greatest(ranked.visit_count, 1)
      else extra_cat_fee
    end,
    ranked.starts_at::date
  from (
    select appointments.id, appointments.starts_at, appointments.visit_count, appointments.extra_pet_count,
      row_number() over (order by appointments.created_at, appointments.id) as position
    from public.appointments
    join public.pets on pets.id = appointments.pet_id
    where appointments.status = 'confirmed'
      and pets.owner_id = owner
      and appointments.starts_at = new.starts_at
      and appointments.address is not distinct from new.address
  ) ranked
  on conflict(appointment_id) do update set amount_cents = excluded.amount_cents,
    due_date = excluded.due_date,
    status = case
      when public.payments.status = 'paid' then 'paid'::public.payment_status
      else 'pending'::public.payment_status
    end;
  return new;
end;
$$;

create trigger appointments_sync_payment
after insert or update of status, service_id, starts_at on public.appointments
for each row execute function public.sync_appointment_payment();

create function public.notify_appointment_change()
returns trigger language plpgsql security definer
set search_path = public set row_security = off as $$
declare owner uuid; enabled boolean;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
    and new.assigned_to is not distinct from old.assigned_to
    and new.starts_at is not distinct from old.starts_at then
    return new;
  end if;
  select owner_id into owner from public.pets where id = new.pet_id;
  select appointments into enabled from public.notification_preferences where user_id = owner;
  if coalesce(enabled, true) then
    insert into public.notifications(user_id, title, body, kind, related_id)
    values (
      owner,
      case new.status
        when 'confirmed' then 'Agendamento confirmado'
        when 'in_progress' then 'Visita em andamento'
        when 'completed' then 'Visita concluida'
        when 'cancelled' then case when tg_op = 'UPDATE' and old.status = 'requested' then 'Solicitacao recusada' else 'Agendamento cancelado' end
        else 'Solicitacao recebida'
      end,
      case
        when new.status = 'cancelled' and tg_op = 'UPDATE' and old.status = 'requested'
          then 'Nao conseguimos atender esta solicitacao. Fale conosco se quiser tentar outro horario.'
        else 'Atendimento em ' || to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
      end,
      'appointment',
      new.id
    );
  end if;
  return new;
end;
$$;

create trigger appointments_notify_change
after insert or update of status, assigned_to, starts_at on public.appointments
for each row execute function public.notify_appointment_change();

alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.services enable row level security;
alter table public.service_prices enable row level security;
alter table public.app_settings enable row level security;
alter table public.client_service_prices enable row level security;
alter table public.staff_invites enable row level security;
alter table public.appointments enable row level security;
alter table public.waitlist_requests enable row level security;
alter table public.appointment_notes enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.discount_codes enable row level security;
alter table public.discount_redemptions enable row level security;

create policy profiles_select on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin() or public.staff_can_view_owner(id));
create policy profiles_update on public.profiles for update to authenticated
using (id = auth.uid() and public.is_active_user()) with check (id = auth.uid());

create policy pets_select on public.pets for select to authenticated
using (owner_id = auth.uid() or public.is_admin() or public.staff_is_assigned_to_pet(id));
create policy pets_insert on public.pets for insert to authenticated
with check ((owner_id = auth.uid() and public.is_client()) or public.is_admin());
create policy pets_update on public.pets for update to authenticated
using ((owner_id = auth.uid() and public.is_client()) or public.is_admin())
with check ((owner_id = auth.uid() and public.is_client()) or public.is_admin());

create policy services_select on public.services for select to authenticated using (active or public.is_admin());
create policy services_admin on public.services for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy prices_select on public.service_prices for select to authenticated
using (public.is_client() or public.is_admin());
create policy prices_admin on public.service_prices for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy client_prices_select on public.client_service_prices for select to authenticated
using (client_id = auth.uid() or public.is_admin());
create policy client_prices_admin on public.client_service_prices for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy invites_admin on public.staff_invites for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy appointments_select on public.appointments for select to authenticated
using (public.is_admin() or assigned_to = auth.uid() or public.user_owns_pet(pet_id));
create policy appointments_insert on public.appointments for insert to authenticated
with check (public.is_admin() or (status = 'requested' and assigned_to is null and public.user_owns_pet(pet_id)));
create policy appointments_admin_update on public.appointments for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy waitlist_select on public.waitlist_requests for select to authenticated
using (public.is_admin() or public.user_owns_pet(pet_id));
create policy waitlist_insert on public.waitlist_requests for insert to authenticated
with check (public.user_owns_pet(pet_id));
create policy waitlist_admin_update on public.waitlist_requests for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy notes_select on public.appointment_notes for select to authenticated
using (public.is_admin() or public.staff_is_assigned_to_appointment(appointment_id)
  or exists (select 1 from public.appointments where id = appointment_id and public.user_owns_pet(pet_id)));
create policy notes_staff on public.appointment_notes for insert to authenticated
with check (created_by = auth.uid() and (public.is_admin() or public.staff_is_assigned_to_appointment(appointment_id)));

create policy payments_select on public.payments for select to authenticated
using (public.is_admin() or exists (
  select 1 from public.appointments where id = appointment_id and public.user_owns_pet(pet_id)
));
create policy payments_admin on public.payments for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy notifications_own_select on public.notifications for select to authenticated
using (user_id = auth.uid() and public.is_active_user());
create policy notifications_own_update on public.notifications for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_admin on public.notifications for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy preferences_own on public.notification_preferences for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy discounts_admin on public.discount_codes for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy redemptions_select on public.discount_redemptions for select to authenticated
using (client_id = auth.uid() or public.is_admin());
create policy redemptions_admin on public.discount_redemptions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name, phone, address, avatar_path) on public.profiles to authenticated;
revoke all on public.app_settings from authenticated;

revoke all on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

insert into public.services(name, description, duration_minutes) values
  ('Cat sitting', 'Visita com alimentacao, higiene, brincadeiras e relatorio.', 60),
  ('Administracao de medicamento', 'Aplicacao conforme receita e orientacoes do tutor.', 60),
  ('Hospedagem domiciliar', 'Diaria de cuidado em ambiente preparado para gatos.', 1440);

insert into public.service_prices(service_id, price_cents)
select id, case name when 'Cat sitting' then 5500 when 'Administracao de medicamento' then 6500 else 9000 end
from public.services;

insert into public.app_settings(key, value_integer)
values ('standard_visit_price_cents', 5500);

insert into public.app_settings(key, value_integer)
values ('max_daily_appointments', 4);

insert into storage.buckets(id, name, public)
values ('pet-photos', 'pet-photos', false)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

create policy pet_photos_select on storage.objects for select to authenticated
using (
  bucket_id = 'pet-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
    or public.staff_can_view_owner(((storage.foldername(name))[1])::uuid)
  )
);
create policy pet_photos_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'pet-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.is_admin()
  )
);
create policy pet_photos_update on storage.objects for update to authenticated
using (bucket_id = 'pet-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))
with check (bucket_id = 'pet-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy pet_photos_delete on storage.objects for delete to authenticated
using (bucket_id = 'pet-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

notify pgrst, 'reload schema';

-- Depois deste setup:
-- 1. Crie o usuario administrador em Authentication > Users.
-- 2. Execute:
-- update public.profiles set role = 'admin', active = true
-- where email = 'SEU-EMAIL';

select
  'BICHANO_SETUP_OK' as status,
  (select count(*) from public.services) as services_created,
  (select value_integer from public.app_settings where key = 'standard_visit_price_cents') as standard_price_cents;
