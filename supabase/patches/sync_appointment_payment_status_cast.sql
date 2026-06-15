alter table public.appointments
  add column if not exists visit_count integer not null default 1 check (visit_count > 0);

alter table public.appointments
  add column if not exists extra_pet_count integer not null default 0 check (extra_pet_count >= 0);

create or replace function public.sync_appointment_payment()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  owner uuid;
  amount integer;
  discount integer;
  extra_cat_fee integer := 1000;
begin
  select owner_id into owner from public.pets where id = new.pet_id;

  if new.status = 'cancelled' then
    update public.payments
    set status = 'cancelled'::public.payment_status
    where appointment_id = new.id and status in ('pending', 'overdue');
  end if;

  if new.status not in ('confirmed', 'cancelled') then
    return new;
  end if;

  select coalesce(custom.amount_cents, base.price_cents)
  into amount
  from public.service_prices base
  left join public.client_service_prices custom on custom.service_id = base.service_id
    and custom.client_id = owner and custom.active
  where base.service_id = new.service_id;

  select max(codes.discount_value)
  into discount
  from public.discount_redemptions redemption
  join public.discount_codes codes on codes.id = redemption.discount_code_id
  where redemption.client_id = owner
    and redemption.cancelled_at is null
    and (redemption.valid_until is null or redemption.valid_until >= new.starts_at)
    and codes.active;

  if amount is null then
    return new;
  end if;

  insert into public.payments(appointment_id, amount_cents, due_date)
  select ranked.id,
    case when ranked.position = 1
      then greatest(amount - coalesce(discount, 0), 1) * greatest(ranked.visit_count, 1)
        + greatest(ranked.extra_pet_count, 0) * extra_cat_fee * greatest(ranked.visit_count, 1)
      else extra_cat_fee
    end,
    ranked.starts_at::date
  from (
    select appointments.id,
      appointments.starts_at,
      appointments.visit_count,
      appointments.extra_pet_count,
      row_number() over (order by appointments.created_at, appointments.id) as position
    from public.appointments
    join public.pets on pets.id = appointments.pet_id
    where appointments.status = 'confirmed'
      and pets.owner_id = owner
      and appointments.starts_at = new.starts_at
      and appointments.address is not distinct from new.address
  ) ranked
  on conflict(appointment_id) do update
  set amount_cents = excluded.amount_cents,
      due_date = excluded.due_date,
      status = case
        when public.payments.status = 'paid' then 'paid'::public.payment_status
        else 'pending'::public.payment_status
      end;

  return new;
end;
$$;

notify pgrst, 'reload schema';
