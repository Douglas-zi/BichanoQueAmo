create or replace function public.admin_approve_client_v3(target_user_id uuid)
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

revoke all on function public.admin_approve_client_v3(uuid) from public, anon;
grant execute on function public.admin_approve_client_v3(uuid) to authenticated;
notify pgrst, 'reload schema';
