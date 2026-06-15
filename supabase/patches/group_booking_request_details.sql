alter table public.appointments
  add column if not exists visit_count integer not null default 1 check (visit_count > 0);

alter table public.appointments
  add column if not exists extra_pet_count integer not null default 0 check (extra_pet_count >= 0);

create or replace function public.request_appointment(
  requested_pet_id uuid,
  requested_service_id uuid,
  requested_starts_at timestamptz,
  requested_address text,
  requested_notes text default null,
  join_waitlist boolean default false,
  requested_visit_count integer default 1,
  requested_extra_pet_count integer default 0
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

  if requested_visit_count < 1 then
    raise exception 'Quantidade de visitas invalida';
  end if;

  if requested_extra_pet_count < 0 then
    raise exception 'Quantidade de gatos extras invalida';
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

  insert into public.appointments(pet_id, service_id, starts_at, ends_at, address, client_notes, visit_count, extra_pet_count)
  values(
    requested_pet_id,
    requested_service_id,
    requested_starts_at,
    requested_starts_at + make_interval(mins => duration),
    trim(requested_address),
    nullif(trim(requested_notes), ''),
    requested_visit_count,
    requested_extra_pet_count
  )
  returning id into created_id;

  return created_id;
end;
$$;

revoke all on function public.request_appointment(uuid, uuid, timestamptz, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.request_appointment(uuid, uuid, timestamptz, text, text, boolean, integer, integer) to authenticated;

create or replace function public.sync_appointment_payment()
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

notify pgrst, 'reload schema';
