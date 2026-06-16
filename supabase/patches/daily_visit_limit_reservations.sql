-- Incremental patch: daily scheduled visit limit and reservation status.
-- Apply in Supabase SQL Editor after the consolidated setup is already installed.

alter type public.appointment_status add value if not exists 'waitlisted';

insert into public.app_settings(key, value_integer, updated_at)
values ('max_daily_appointments', 15, now())
on conflict(key) do update set value_integer = 15, updated_at = now();

drop function if exists public.request_appointment(uuid, uuid, timestamptz, text, text, boolean, integer, integer);
create function public.request_appointment(
  requested_pet_id uuid, requested_service_id uuid, requested_starts_at timestamptz,
  requested_address text, requested_notes text default null, join_waitlist boolean default false,
  requested_visit_count integer default 1, requested_extra_pet_count integer default 0
)
returns table(appointment_id uuid, appointment_status public.appointment_status, daily_confirmed_visits integer, max_daily_visits integer)
language plpgsql security definer
set search_path = public set row_security = off as $$
declare
  duration integer;
  created_id uuid;
  daily_limit integer := 15;
  day_count integer;
  owner_name text;
  final_status public.appointment_status;
  day_start timestamptz;
  day_end timestamptz;
begin
  if not public.is_admin() and not public.user_owns_pet(requested_pet_id) then raise exception 'Bichano invalido'; end if;
  if requested_starts_at <= now() then raise exception 'Escolha uma data futura'; end if;
  if requested_visit_count < 1 then raise exception 'Quantidade de visitas invalida'; end if;
  if requested_extra_pet_count < 0 then raise exception 'Quantidade de gatos extras invalida'; end if;

  select duration_minutes into duration from public.services where id = requested_service_id and active;
  if duration is null then raise exception 'Servico indisponivel'; end if;

  day_start := date_trunc('day', requested_starts_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  day_end := day_start + interval '1 day';
  perform pg_advisory_xact_lock(hashtext('appointments_daily_limit:' || to_char(day_start, 'YYYY-MM-DD')));

  select coalesce(sum(greatest(visit_count, 1)), 0) into day_count
  from public.appointments
  where status = 'confirmed'
    and starts_at >= day_start
    and starts_at < day_end;

  final_status := case
    when day_count + requested_visit_count <= daily_limit then 'confirmed'::public.appointment_status
    else 'waitlisted'::public.appointment_status
  end;

  insert into public.appointments(pet_id, service_id, starts_at, ends_at, status, address, client_notes, visit_count, extra_pet_count)
  values(requested_pet_id, requested_service_id, requested_starts_at,
    requested_starts_at + make_interval(mins => duration), final_status, trim(requested_address),
    nullif(trim(requested_notes), ''), requested_visit_count, requested_extra_pet_count)
  returning id into created_id;

  if final_status = 'waitlisted' then
    select profiles.full_name into owner_name
    from public.pets
    join public.profiles on profiles.id = pets.owner_id
    where pets.id = requested_pet_id;

    insert into public.notifications(user_id, title, body, kind, related_id)
    select profiles.id, 'Pedido de encaixe/reserva', coalesce(nullif(owner_name, ''), 'Cliente') ||
      ' entrou em encaixe/reserva para ' || to_char(requested_starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
      'appointment', created_id
    from public.profiles
    where role = 'admin' and active;
  end if;

  return query select created_id, final_status,
    day_count + case when final_status = 'confirmed' then requested_visit_count else 0 end,
    daily_limit;
end;
$$;

create or replace function public.manage_appointment(
  target_appointment_id uuid, requested_status public.appointment_status,
  requested_assigned_to uuid default null, requested_starts_at timestamptz default null
)
returns void language plpgsql security definer
set search_path = public set row_security = off as $$
declare
  selected public.appointments%rowtype;
  duration integer;
  final_starts_at timestamptz;
  day_start timestamptz;
  day_end timestamptz;
  day_count integer;
  daily_limit integer := 15;
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem organizar a agenda'; end if;
  if requested_status = 'completed' then raise exception 'Conclua a visita pelo fechamento financeiro'; end if;

  select * into selected from public.appointments where id = target_appointment_id for update;
  if not found then raise exception 'Agendamento nao encontrado'; end if;

  select duration_minutes into duration from public.services where id = selected.service_id;
  if duration is null then raise exception 'Servico indisponivel'; end if;
  final_starts_at := coalesce(requested_starts_at, selected.starts_at);

  if requested_status = 'confirmed' then
    day_start := date_trunc('day', final_starts_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
    day_end := day_start + interval '1 day';
    perform pg_advisory_xact_lock(hashtext('appointments_daily_limit:' || to_char(day_start, 'YYYY-MM-DD')));

    select coalesce(sum(greatest(visit_count, 1)), 0) into day_count
    from public.appointments
    where status = 'confirmed'
      and id <> target_appointment_id
      and starts_at >= day_start
      and starts_at < day_end;

    if day_count + greatest(selected.visit_count, 1) > daily_limit then
      raise exception 'Limite de 15 visitas agendadas para esta data atingido';
    end if;
  end if;

  update public.appointments set status = requested_status, assigned_to = requested_assigned_to,
    starts_at = final_starts_at,
    ends_at = final_starts_at + make_interval(mins => duration)
  where id = target_appointment_id;
end;
$$;

create or replace function public.review_appointment_request(
  target_appointment_id uuid,
  review_action text,
  requested_assigned_to uuid default null
)
returns void language plpgsql security definer
set search_path = public set row_security = off as $$
declare
  selected public.appointments%rowtype;
  sitter public.profiles%rowtype;
  day_start timestamptz;
  day_end timestamptz;
  day_count integer;
  daily_limit integer := 15;
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem revisar solicitacoes'; end if;
  select * into selected from public.appointments where id = target_appointment_id for update;
  if not found then raise exception 'Agendamento nao encontrado'; end if;
  if selected.status not in ('requested', 'waitlisted') then raise exception 'Esta solicitacao ja foi revisada'; end if;

  if review_action = 'approve' then
    if requested_assigned_to is null then raise exception 'Escolha a baba responsavel'; end if;
    select * into sitter from public.profiles
    where id = requested_assigned_to and role in ('staff', 'admin') and active;
    if not found then raise exception 'Baba responsavel indisponivel'; end if;

    day_start := date_trunc('day', selected.starts_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
    day_end := day_start + interval '1 day';
    perform pg_advisory_xact_lock(hashtext('appointments_daily_limit:' || to_char(day_start, 'YYYY-MM-DD')));

    select coalesce(sum(greatest(visit_count, 1)), 0) into day_count
    from public.appointments
    where status = 'confirmed'
      and id <> target_appointment_id
      and starts_at >= day_start
      and starts_at < day_end;

    if day_count + greatest(selected.visit_count, 1) > daily_limit then
      raise exception 'Limite de 15 visitas agendadas para esta data atingido';
    end if;

    update public.appointments set status = 'confirmed', assigned_to = requested_assigned_to
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

create or replace function public.cancel_my_appointment(target_appointment_id uuid)
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
  if selected.status not in ('requested', 'confirmed', 'waitlisted') then
    raise exception 'Esta visita nao pode mais ser cancelada pelo app';
  end if;

  update public.appointments
  set status = 'cancelled', internal_notes = concat_ws(E'\n', nullif(internal_notes, ''), 'Cancelado pelo tutor no app')
  where id = target_appointment_id;
end;
$$;

create or replace function public.notify_appointment_change()
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
        when 'waitlisted' then 'Pedido em encaixe/reserva'
        when 'in_progress' then 'Visita em andamento'
        when 'completed' then 'Visita concluida'
        when 'cancelled' then case when tg_op = 'UPDATE' and old.status in ('requested', 'waitlisted') then 'Solicitacao recusada' else 'Agendamento cancelado' end
        else 'Solicitacao recebida'
      end,
      case
        when new.status = 'cancelled' and tg_op = 'UPDATE' and old.status in ('requested', 'waitlisted')
          then 'Nao conseguimos atender esta solicitacao. Fale conosco se quiser tentar outra data.'
        when new.status = 'waitlisted'
          then 'O limite de 15 visitas para esta data foi atingido. Seu pedido ficou como encaixe/reserva e aguarda confirmacao.'
        else 'Atendimento em ' || to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') || '. A rota sera organizada pela administradora.'
      end,
      'appointment',
      new.id
    );
  end if;
  return new;
end;
$$;

grant execute on function public.request_appointment(uuid, uuid, timestamptz, text, text, boolean, integer, integer) to authenticated;
grant execute on function public.manage_appointment(uuid, public.appointment_status, uuid, timestamptz) to authenticated;
grant execute on function public.review_appointment_request(uuid, text, uuid) to authenticated;
grant execute on function public.cancel_my_appointment(uuid) to authenticated;

notify pgrst, 'reload schema';
