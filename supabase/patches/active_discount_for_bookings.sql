create or replace function public.my_active_discount()
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

revoke all on function public.my_active_discount() from public, anon;
grant execute on function public.my_active_discount() to authenticated;

notify pgrst, 'reload schema';
