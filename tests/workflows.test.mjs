import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const setupPath = new URL("../supabase/reset_and_setup.sql", import.meta.url);
const migrationsPath = new URL("../supabase/migrations/", import.meta.url);
const appPath = new URL("../components/BichanoApp.tsx", import.meta.url);
const manageAppointmentPatchPath = new URL("../supabase/patches/manage_appointment.sql", import.meta.url);
const reviewAppointmentRequestPatchPath = new URL("../supabase/patches/review_appointment_request.sql", import.meta.url);
const paymentStatusCastPatchPath = new URL("../supabase/patches/sync_appointment_payment_status_cast.sql", import.meta.url);
const adminRegisterStaffPatchPath = new URL("../supabase/patches/admin_register_staff.sql", import.meta.url);
const staffUpdateVisitPatchPath = new URL("../supabase/patches/staff_update_assigned_visit.sql", import.meta.url);

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
    "admin_approve_client_v3",
    "admin_recover_client_v3",
    "admin_register_staff",
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
    "staff_update_assigned_visit",
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
  assert.match(source, /supabase\.rpc\("admin_register_staff"/);
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
  assert.match(source, /supabase\.rpc\("staff_update_assigned_visit"/);
  assert.match(source, /from\("pets"\)\.update\(petPayload\)/);
  assert.match(source, /from\("pets"\)\.update\(\{ active: false \}\)/);
  assert.doesNotMatch(source, /Convite demonstrativo enviado/);
  assert.doesNotMatch(source, /defaultValue="2026-06-16"/);
});

test("staff can update only assigned visits without admin privileges", async () => {
  const source = await readFile(appPath, "utf8");
  const setupSql = await readFile(setupPath, "utf8");
  const patchSql = await readFile(staffUpdateVisitPatchPath, "utf8");
  assert.match(source, /Status da visita/);
  assert.match(source, /function updateAssignedVisit/);
  assert.match(source, /requested_status: managedStatus/);
  assert.match(setupSql, /create function public\.staff_update_assigned_visit/);
  assert.match(patchSql, /public\.staff_is_assigned_to_appointment\(target_appointment_id\)/);
  assert.match(patchSql, /requested_status not in \('confirmed', 'in_progress', 'completed'\)/);
  assert.doesNotMatch(patchSql, /public\.is_admin\(\)/);
});

test("staff registration promotes an existing signup without Edge Functions", async () => {
  const appSource = await readFile(appPath, "utf8");
  const setupSql = await readFile(setupPath, "utf8");
  const patchSql = await readFile(adminRegisterStaffPatchPath, "utf8");
  assert.match(appSource, /Cadastrar babá/);
  assert.match(appSource, /supabase\.rpc\("admin_register_staff"/);
  assert.doesNotMatch(appSource, /functions\/v1\/invite-staff/);
  assert.doesNotMatch(appSource, /setInviteOpen/);
  assert.match(appSource, /staffFormError/);
  assert.match(appSource, /styles\.staffRegistration/);
  assert.match(setupSql, /create function public\.admin_register_staff/);
  assert.match(patchSql, /create or replace function public\.admin_register_staff/);
  assert.match(patchSql, /role = 'staff'/);
  assert.match(patchSql, /notify pgrst, 'reload schema'/);
});
