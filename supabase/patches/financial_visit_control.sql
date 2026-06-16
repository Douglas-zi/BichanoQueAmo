-- Incremental patch: financial control for completed visits.
-- Apply in Supabase SQL Editor after the consolidated setup is already installed.

alter table public.appointments
  add column if not exists completed_at timestamptz;

create or replace function public.manage_appointment(
  target_appointment_id uuid, requested_status public.appointment_status,
  requested_assigned_to uuid default null, requested_starts_at timestamptz default null
)
returns void language plpgsql security definer
set search_path = public set row_security = off as $$
declare duration integer;
begin
  if not public.is_admin() then raise exception 'Apenas administradores podem organizar a agenda'; end if;
  if requested_status = 'completed' then raise exception 'Conclua a visita pelo fechamento financeiro'; end if;
  select services.duration_minutes into duration from public.appointments
  join public.services on services.id = appointments.service_id
  where appointments.id = target_appointment_id;
  if duration is null then raise exception 'Agendamento nao encontrado'; end if;
  update public.appointments set status = requested_status, assigned_to = requested_assigned_to,
    starts_at = coalesce(requested_starts_at, starts_at),
    ends_at = case when requested_starts_at is null then ends_at
      else requested_starts_at + make_interval(mins => duration) end
  where id = target_appointment_id;
end;
$$;

drop function if exists public.record_visit(uuid, text, boolean);
drop function if exists public.record_visit(uuid, text, boolean, public.payment_status, text);
create function public.record_visit(
  target_appointment_id uuid,
  visit_note text,
  complete_visit boolean default false,
  admin_payment_status public.payment_status default null,
  financial_note text default null
)
returns void language plpgsql security definer
set search_path = public set row_security = off as $$
declare
  selected public.appointments%rowtype;
  owner uuid;
  payment_id uuid;
  amount integer;
  discount integer;
  enabled boolean;
begin
  if not public.is_admin() and not public.staff_is_assigned_to_appointment(target_appointment_id)
    then raise exception 'Atendimento nao atribuido'; end if;

  select * into selected from public.appointments where id = target_appointment_id for update;
  if not found then raise exception 'Agendamento nao encontrado'; end if;

  if complete_visit and public.is_admin() and (admin_payment_status is null or admin_payment_status not in ('pending', 'paid')) then
    raise exception 'Defina se a visita concluida ficou pendente de pagamento ou foi paga';
  end if;

  insert into public.appointment_notes(appointment_id, created_by, note)
  values(target_appointment_id, auth.uid(), trim(visit_note));

  update public.appointments
  set status = case
        when complete_visit then 'completed'::public.appointment_status
        else 'in_progress'::public.appointment_status
      end,
      completed_at = case when complete_visit then coalesce(completed_at, now()) else completed_at end
  where id = target_appointment_id;

  if complete_visit and public.is_admin() then
    select pets.owner_id into owner from public.pets where id = selected.pet_id;

    select payments.amount_cents into amount
    from public.payments
    where appointment_id = target_appointment_id;

    if amount is null then
      select coalesce(custom.amount_cents, base.price_cents) into amount
      from public.service_prices base
      left join public.client_service_prices custom on custom.service_id = base.service_id
        and custom.client_id = owner and custom.active
      where base.service_id = selected.service_id;

      select max(codes.discount_value) into discount
      from public.discount_redemptions redemption
      join public.discount_codes codes on codes.id = redemption.discount_code_id
      where redemption.client_id = owner and redemption.cancelled_at is null
        and (redemption.valid_until is null or redemption.valid_until >= selected.starts_at) and codes.active;

      amount := greatest(coalesce(amount, 1) - coalesce(discount, 0), 1)
        * greatest(selected.visit_count, 1)
        + greatest(selected.extra_pet_count, 0) * 1000 * greatest(selected.visit_count, 1);
    end if;

    amount := greatest(coalesce(amount, 1), 1);

    insert into public.payments(appointment_id, amount_cents, due_date, status, paid_at, payment_notes)
    values (
      target_appointment_id,
      amount,
      selected.starts_at::date,
      admin_payment_status,
      case when admin_payment_status = 'paid' then now() else null end,
      nullif(trim(coalesce(financial_note, '')), '')
    )
    on conflict(appointment_id) do update set
      amount_cents = excluded.amount_cents,
      due_date = excluded.due_date,
      status = excluded.status,
      paid_at = case when excluded.status = 'paid' then coalesce(public.payments.paid_at, now()) else null end,
      reminder_sent_at = case when excluded.status = 'paid' then null else public.payments.reminder_sent_at end,
      payment_notes = excluded.payment_notes
    returning id into payment_id;

    if admin_payment_status = 'paid' then
      delete from public.notifications
      where related_id = payment_id and kind in ('payment_due', 'payment_overdue');
    else
      select payments into enabled from public.notification_preferences where user_id = owner;
      if coalesce(enabled, true) then
        delete from public.notifications
        where user_id = owner and related_id = payment_id and kind in ('payment_due', 'payment_overdue');

        insert into public.notifications(user_id, title, body, kind, related_id)
        values (
          owner,
          'Pagamento pendente',
          'Existe um debito pendente de ' || to_char(amount / 100.0, 'FM999G999G990D00') || ' referente a visita concluida.',
          'payment_due',
          payment_id
        );
      end if;
    end if;
  end if;
end;
$$;

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
  set status = requested_status,
      completed_at = case when requested_status = 'completed' then coalesce(completed_at, now()) else completed_at end
  where id = target_appointment_id and assigned_to = auth.uid();
end;
$$;

create or replace function public.generate_overdue_payment_reminders()
returns integer language plpgsql security definer
set search_path = public set row_security = off as $$
declare created_count integer;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Apenas administradores'; end if;
  update public.payments set status = 'overdue'::public.payment_status
  where status = 'pending' and due_date < current_date;

  with inserted as (
    insert into public.notifications(user_id, title, body, kind, related_id)
    select pets.owner_id, 'Lembrete de pagamento',
      'Existe um pagamento pendente de ' || to_char(payments.amount_cents / 100.0, 'FM999G999G990D00') ||
        ' referente a visita concluida em ' || to_char(appointments.completed_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
      'payment_overdue', payments.id
    from public.payments
    join public.appointments on appointments.id = payments.appointment_id
    join public.pets on pets.id = appointments.pet_id
    where payments.status in ('pending', 'overdue')
      and appointments.status = 'completed'
      and (payments.reminder_sent_at is null or payments.reminder_sent_at <= now() - interval '3 days')
    returning related_id
  )
  update public.payments set reminder_sent_at = now() where id in (select related_id from inserted);
  get diagnostics created_count = row_count;
  return created_count;
end;
$$;

grant execute on function public.manage_appointment(uuid, public.appointment_status, uuid, timestamptz) to authenticated;
grant execute on function public.record_visit(uuid, text, boolean, public.payment_status, text) to authenticated;
grant execute on function public.staff_update_assigned_visit(uuid, public.appointment_status, text) to authenticated;
grant execute on function public.generate_overdue_payment_reminders() to authenticated;

notify pgrst, 'reload schema';
