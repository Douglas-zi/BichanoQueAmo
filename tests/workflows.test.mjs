import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const setupPath = new URL("../supabase/reset_and_setup.sql", import.meta.url);
const migrationsPath = new URL("../supabase/migrations/", import.meta.url);
const appPath = new URL("../components/BichanoApp.tsx", import.meta.url);
const manageAppointmentPatchPath = new URL("../supabase/patches/manage_appointment.sql", import.meta.url);
const reviewAppointmentRequestPatchPath = new URL("../supabase/patches/review_appointment_request.sql", import.meta.url);
const paymentStatusCastPatchPath = new URL("../supabase/patches/sync_appointment_payment_status_cast.sql", import.meta.url);
const inviteStaffPath = new URL("../supabase/functions/invite-staff/index.ts", import.meta.url);

test("Supabase has one consolidated setup and no historical migrations", async () => {
  const entries = await readdir(migrationsPath).catch(() => []);
  assert.deepEqual(entries.filter((name) => name.endsWith(".sql")), []);
  const sql = await readFile(setupPath, "utf8");
  assert.match(sql, /drop schema if exists public cascade/);
  assert.match(sql, /delete from auth\.users/);
  assert.match(sql, /notify pgrst, 'reload schema'/);
});

test("consolidated setup defines every app table", async () => {
  const sql = await readFile(setupPath, "utf8");
  for (const table of [
    "profiles",
    "pets",
    "services",
    "service_prices",
    "app_settings",
    "staff_invites",
    "appointments",
    "waitlist_requests",
    "appointment_notes",
    "payments",
    "notifications",
    "notification_preferences",
    "discount_codes",
    "discount_redemptions",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
  }
});

test("consolidated setup defines every RPC used by the app", async () => {
  const sql = await readFile(setupPath, "utf8");
  for (const operation of [
    "admin_pending_clients_v2",
    "admin_review_client_v2",
    "admin_recover_client_v3",
    "complete_client_intake",
    "get_standard_visit_price",
    "set_standard_visit_price",
    "set_staff_access",
    "request_appointment",
    "manage_waitlist_request",
    "manage_appointment",
    "review_appointment_request",
    "cancel_my_appointment",
    "record_visit",
    "activate_discount_code",
    "my_welcome_code",
    "generate_overdue_payment_reminders",
  ]) {
    assert.match(sql, new RegExp(`create function public\\.${operation}`));
  }
});

test("client list reads the canonical profiles table", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /from\("profiles"\)[\s\S]*eq\("role", "client"\)/);
  assert.match(source, /rpc\("admin_review_client_v2"/);
  assert.match(source, /rpc\("set_standard_visit_price"/);
  assert.doesNotMatch(source, /rpc\("admin_list_clients"/);
  assert.doesNotMatch(source, /rpc\("admin_review_client"/);
  assert.doesNotMatch(source, /rpc\("set_service_price"/);
});

test("interactive workflows are connected", async () => {
  const source = await readFile(appPath, "utf8");
  const manageAppointmentPatch = await readFile(manageAppointmentPatchPath, "utf8");
  const reviewAppointmentRequestPatch = await readFile(reviewAppointmentRequestPatchPath, "utf8");
  const paymentStatusCastPatch = await readFile(paymentStatusCastPatchPath, "utf8");
  const setupSql = await readFile(setupPath, "utf8");
  assert.match(source, /supabase\.functions\.invoke\("invite-staff"/);
  assert.match(source, /supabase\.rpc\("request_appointment"/);
  assert.match(source, /supabase\.rpc\("manage_waitlist_request"/);
  assert.match(source, /supabase\.rpc\("manage_appointment"/);
  assert.match(source, /supabase\.rpc\("review_appointment_request"/);
  assert.match(source, /supabase\.rpc\("cancel_my_appointment"/);
  assert.match(source, /function RequestedAppointmentCard/);
  assert.match(source, />Revisar</);
  assert.match(source, /Aceitar atendimento/);
  assert.match(source, />Recusar</);
  assert.match(manageAppointmentPatch, /create or replace function public\.manage_appointment/);
  assert.match(manageAppointmentPatch, /notify pgrst, 'reload schema'/);
  assert.match(reviewAppointmentRequestPatch, /create or replace function public\.review_appointment_request/);
  assert.match(reviewAppointmentRequestPatch, /Solicitacao recusada/);
  assert.match(reviewAppointmentRequestPatch, /role in \('staff', 'admin'\)/);
  assert.match(setupSql, /'pending'::public\.payment_status/);
  assert.match(paymentStatusCastPatch, /create or replace function public\.sync_appointment_payment/);
  assert.match(paymentStatusCastPatch, /add column if not exists visit_count/);
  assert.match(paymentStatusCastPatch, /add column if not exists extra_pet_count/);
  assert.match(paymentStatusCastPatch, /'pending'::public\.payment_status/);
  assert.match(source, /requested_visit_count: bookingVisitCount/);
  assert.match(source, /requested_extra_pet_count: Math\.max\(bookingPetIds\.length - 1, 0\)/);
  assert.doesNotMatch(source, /for \(const selectedPetId of bookingPetIds\)/);
  assert.doesNotMatch(source, /bookingPetIds\.flatMap\(\(selectedPetId\)/);
  assert.match(source, /supabase\.rpc\("record_visit"/);
  assert.match(source, /from\("pets"\)\.update\(petPayload\)/);
  assert.match(source, /from\("pets"\)\.update\(\{ active: false \}\)/);
  assert.doesNotMatch(source, /Convite demonstrativo enviado/);
  assert.doesNotMatch(source, /defaultValue="2026-06-16"/);
});

test("staff invitations handle browser calls and surface backend errors", async () => {
  const appSource = await readFile(appPath, "utf8");
  const functionSource = await readFile(inviteStaffPath, "utf8");
  assert.match(appSource, /functionErrorMessage\(error/);
  assert.match(appSource, /error\.context\.json\(\)/);
  assert.match(appSource, /Failed to send a request to the Edge Function/i);
  assert.match(appSource, /Publique invite-staff/);
  assert.match(appSource, /throw new Error\(await functionErrorMessage\(error, "Não foi possível enviar o convite\."\)\)/);
  assert.match(functionSource, /allowedOrigins\.length === 0 \|\| allowedOrigins\.includes\(origin\)/);
  assert.match(functionSource, /\.eq\("id", inviteRecord\.id\)/);
});
