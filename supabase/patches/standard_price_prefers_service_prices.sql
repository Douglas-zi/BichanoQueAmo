create or replace function public.get_standard_visit_price()
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

notify pgrst, 'reload schema';
