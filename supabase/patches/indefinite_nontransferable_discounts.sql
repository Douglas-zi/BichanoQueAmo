alter table public.discount_codes
  alter column benefit_months drop default;

alter table public.discount_codes
  alter column benefit_months drop not null;

alter table public.discount_codes
  drop constraint if exists discount_codes_benefit_months_check;

alter table public.discount_codes
  add constraint discount_codes_benefit_months_check
  check (benefit_months is null);

update public.discount_codes set benefit_months = null;

alter table public.discount_redemptions
  alter column valid_until drop not null;

update public.discount_redemptions
set valid_until = null
where cancelled_at is null;

create or replace function public.activate_discount_code(requested_code text)
returns table(activated boolean, valid_until timestamptz, message text)
language plpgsql security definer
set search_path = public set row_security = off as $$
declare selected public.discount_codes%rowtype; expiry timestamptz; already_active boolean;
begin
  if not public.is_client() then return query select false, null::timestamptz, 'Somente clientes ativos'; return; end if;
  select * into selected from public.discount_codes
  where upper(code) = upper(trim(requested_code)) and active
    and (expires_at is null or expires_at >= now())
    and (max_uses is null or times_used < max_uses) for update;
  if not found then return query select false, null::timestamptz, 'Codigo invalido'; return; end if;
  if selected.assigned_client_id is not null and selected.assigned_client_id <> auth.uid() then
    return query select false, null::timestamptz, 'Codigo intransferivel'; return;
  end if;
  if exists (
    select 1 from public.discount_redemptions
    where discount_code_id = selected.id and client_id <> auth.uid() and cancelled_at is null
  ) then
    return query select false, null::timestamptz, 'Codigo intransferivel'; return;
  end if;
  select true, discount_redemptions.valid_until into already_active, expiry
  from public.discount_redemptions
  where discount_code_id = selected.id and client_id = auth.uid() and cancelled_at is null;
  if coalesce(already_active, false) then return query select true, expiry, 'Codigo ja ativado'; return; end if;
  expiry := null;
  insert into public.discount_redemptions(discount_code_id, client_id, valid_until)
  values(selected.id, auth.uid(), expiry);
  update public.discount_codes set times_used = times_used + 1 where id = selected.id;
  return query select true, expiry, 'Codigo ativado';
end;
$$;

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
    case when ranked.position = 1 then greatest(amount - coalesce(discount, 0), 1) else extra_cat_fee end,
    ranked.starts_at::date
  from (
    select appointments.id, appointments.starts_at,
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
