create or replace function public.review_appointment_request(
  target_appointment_id uuid,
  review_action text,
  requested_assigned_to uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  selected public.appointments%rowtype;
  sitter public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem revisar solicitacoes';
  end if;

  select *
  into selected
  from public.appointments
  where id = target_appointment_id
  for update;

  if not found then
    raise exception 'Agendamento nao encontrado';
  end if;

  if selected.status <> 'requested' then
    raise exception 'Esta solicitacao ja foi revisada';
  end if;

  if review_action = 'approve' then
    if requested_assigned_to is null then
      raise exception 'Escolha a baba responsavel';
    end if;

    select *
    into sitter
    from public.profiles
    where id = requested_assigned_to
      and role in ('staff', 'admin')
      and active;

    if not found then
      raise exception 'Baba responsavel indisponivel';
    end if;

    update public.appointments
    set status = 'confirmed',
        assigned_to = requested_assigned_to
    where id = target_appointment_id;

    return;
  elsif review_action = 'reject' then
    update public.appointments
    set status = 'cancelled',
        assigned_to = null,
        internal_notes = concat_ws(E'\n', nullif(internal_notes, ''), 'Solicitacao recusada pela administradora')
    where id = target_appointment_id;

    return;
  end if;

  raise exception 'Acao invalida';
end;
$$;

create or replace function public.notify_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  owner uuid;
  enabled boolean;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
    and new.assigned_to is not distinct from old.assigned_to
    and new.starts_at is not distinct from old.starts_at then
    return new;
  end if;

  select owner_id into owner from public.pets where id = new.pet_id;
  select appointments into enabled from public.notification_preferences where user_id = owner;

  if coalesce(enabled, true) then
    insert into public.notifications(user_id, title, body, kind, related_id)
    values (
      owner,
      case new.status
        when 'confirmed' then 'Agendamento confirmado'
        when 'in_progress' then 'Visita em andamento'
        when 'completed' then 'Visita concluida'
        when 'cancelled' then case when tg_op = 'UPDATE' and old.status = 'requested' then 'Solicitacao recusada' else 'Agendamento cancelado' end
        else 'Solicitacao recebida'
      end,
      case
        when new.status = 'cancelled' and tg_op = 'UPDATE' and old.status = 'requested'
          then 'Nao conseguimos atender esta solicitacao. Fale conosco se quiser tentar outro horario.'
        else 'Atendimento em ' || to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
      end,
      'appointment',
      new.id
    );
  end if;

  return new;
end;
$$;

grant execute on function public.review_appointment_request(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
