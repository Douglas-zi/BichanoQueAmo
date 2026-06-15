create or replace function public.request_appointment(
  requested_pet_id uuid,
  requested_service_id uuid,
  requested_starts_at timestamptz,
  requested_address text,
  requested_notes text default null,
  join_waitlist boolean default false
)
returns uuid
language plpgsql security definer
set search_path = public set row_security = off as $$
declare
  duration integer;
  created_id uuid;
  daily_limit integer;
  day_count integer;
  owner_name text;
begin
  if not public.user_owns_pet(requested_pet_id) then
    raise exception 'Bichano invalido';
  end if;

  if requested_starts_at <= now() then
    raise exception 'Escolha um horario futuro';
  end if;

  select duration_minutes into duration
  from public.services
  where id = requested_service_id and active;

  if duration is null then
    raise exception 'Servico indisponivel';
  end if;

  select coalesce(value_integer, 4) into daily_limit
  from public.app_settings
  where key = 'max_daily_appointments';

  select count(distinct starts_at) into day_count
  from public.appointments
  where status <> 'cancelled'
    and starts_at >= date_trunc('day', requested_starts_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    and starts_at < (date_trunc('day', requested_starts_at at time zone 'America/Sao_Paulo') + interval '1 day') at time zone 'America/Sao_Paulo';

  if day_count >= daily_limit then
    if join_waitlist then
      insert into public.waitlist_requests(pet_id, service_id, requested_starts_at, address, client_notes)
      values(requested_pet_id, requested_service_id, requested_starts_at, trim(requested_address), nullif(trim(requested_notes), ''))
      returning id into created_id;

      select profiles.full_name into owner_name
      from public.pets
      join public.profiles on profiles.id = pets.owner_id
      where pets.id = requested_pet_id;

      insert into public.notifications(user_id, title, body, kind, related_id)
      select profiles.id,
        'Pedido de encaixe',
        coalesce(nullif(owner_name, ''), 'Cliente') || ' entrou na lista de espera para ' ||
          to_char(requested_starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
        'waitlist_request',
        created_id
      from public.profiles
      where role = 'admin' and active;

      return created_id;
    end if;

    raise exception 'Este dia esta lotado. Voce pode entrar na lista de espera para pedir um encaixe.';
  end if;

  insert into public.appointments(pet_id, service_id, starts_at, ends_at, address, client_notes)
  values(
    requested_pet_id,
    requested_service_id,
    requested_starts_at,
    requested_starts_at + make_interval(mins => duration),
    trim(requested_address),
    nullif(trim(requested_notes), '')
  )
  returning id into created_id;

  return created_id;
end;
$$;

revoke all on function public.request_appointment(uuid, uuid, timestamptz, text, text, boolean) from public, anon;
grant execute on function public.request_appointment(uuid, uuid, timestamptz, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
