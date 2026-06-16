create or replace function public.admin_register_staff(requested_email text, requested_full_name text)
returns uuid language plpgsql security definer
set search_path = public, auth set row_security = off as $$
declare
  target_user auth.users%rowtype;
  normalized_email text := lower(trim(requested_email));
  normalized_name text := trim(requested_full_name);
begin
  if not public.is_admin() then raise exception 'Apenas a administradora pode cadastrar babas'; end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(normalized_name) < 2 then
    raise exception 'Nome ou e-mail invalido';
  end if;

  select * into target_user from auth.users where lower(email) = normalized_email limit 1;
  if not found then
    raise exception 'Peça para a babá criar uma conta pelo botão Cadastrar antes de adicioná-la à equipe';
  end if;

  if exists (select 1 from public.profiles where id = target_user.id and role = 'admin') then
    raise exception 'Esta conta ja e administradora';
  end if;

  insert into public.profiles (id, email, full_name, role, active)
  values (target_user.id, target_user.email, normalized_name, 'staff', true)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = 'staff',
    active = true,
    updated_at = now();

  return target_user.id;
end;
$$;

notify pgrst, 'reload schema';
