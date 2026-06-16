create or replace function public.staff_update_assigned_visit(
  target_appointment_id uuid,
  requested_status public.appointment_status,
  visit_note text default null
)
returns void language plpgsql security definer
set search_path = public set row_security = off as $$
begin
  if not public.staff_is_assigned_to_appointment(target_appointment_id) then
    raise exception 'Atendimento nao atribuido';
  end if;

  if requested_status not in ('confirmed', 'in_progress', 'completed') then
    raise exception 'Status indisponivel para baba';
  end if;

  if nullif(trim(coalesce(visit_note, '')), '') is not null then
    insert into public.appointment_notes(appointment_id, created_by, note)
    values(target_appointment_id, auth.uid(), trim(visit_note));
  end if;

  update public.appointments
  set status = requested_status
  where id = target_appointment_id and assigned_to = auth.uid();
end;
$$;

grant execute on function public.staff_update_assigned_visit(uuid, public.appointment_status, text) to authenticated;

notify pgrst, 'reload schema';
