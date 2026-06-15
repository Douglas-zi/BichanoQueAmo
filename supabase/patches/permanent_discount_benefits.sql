alter table public.discount_codes
  alter column benefit_months drop default;

alter table public.discount_codes
  alter column benefit_months drop not null;

alter table public.discount_codes
  drop constraint if exists discount_codes_benefit_months_check;

update public.discount_codes set benefit_months = null;

alter table public.discount_codes
  add constraint discount_codes_benefit_months_check
  check (benefit_months is null);

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
  if coalesce(already_active, false) then return query select true, null::timestamptz, 'Codigo ja ativado'; return; end if;
  expiry := null;
  insert into public.discount_redemptions(discount_code_id, client_id, valid_until)
  values(selected.id, auth.uid(), expiry);
  update public.discount_codes set times_used = times_used + 1 where id = selected.id;
  return query select true, expiry, 'Codigo ativado';
end;
$$;

notify pgrst, 'reload schema';
