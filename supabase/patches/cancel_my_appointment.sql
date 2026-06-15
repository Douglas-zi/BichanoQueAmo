create or replace function public.cancel_my_appointment(target_appointment_id uuid)
returns void language plpgsql security definer
set search_path = public set row_security = off as $$
declare selected public.appointments%rowtype;
begin
  select appointments.* into selected
  from public.appointments
  join public.pets on pets.id = appointments.pet_id
  where appointments.id = target_appointment_id
    and pets.owner_id = auth.uid()
  for update of appointments;

  if not found then raise exception 'Agendamento nao encontrado'; end if;
  if selected.status = 'cancelled' then return; end if;
  if selected.status not in ('requested', 'confirmed') then
    raise exception 'Esta visita nao pode mais ser cancelada pelo app';
  end if;

  update public.appointments
  set status = 'cancelled',
      internal_notes = concat_ws(E'\n', nullif(internal_notes, ''), 'Cancelado pelo tutor no app')
  where id = target_appointment_id;
end;
$$;

notify pgrst, 'reload schema';
