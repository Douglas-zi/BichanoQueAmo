create or replace function public.manage_appointment(
  target_appointment_id uuid,
  requested_status public.appointment_status,
  requested_assigned_to uuid default null,
  requested_starts_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  duration integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem organizar a agenda';
  end if;

  select services.duration_minutes
  into duration
  from public.appointments
  join public.services on services.id = appointments.service_id
  where appointments.id = target_appointment_id;

  if duration is null then
    raise exception 'Agendamento nao encontrado';
  end if;

  update public.appointments
  set status = requested_status,
      assigned_to = requested_assigned_to,
      starts_at = coalesce(requested_starts_at, starts_at),
      ends_at = case
        when requested_starts_at is null then ends_at
        else requested_starts_at + make_interval(mins => duration)
      end
  where id = target_appointment_id;
end;
$$;

grant execute on function public.manage_appointment(uuid, public.appointment_status, uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
