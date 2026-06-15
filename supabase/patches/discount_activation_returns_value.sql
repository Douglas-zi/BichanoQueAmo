drop function if exists public.activate_discount_code(text);

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

notify pgrst, 'reload schema';
