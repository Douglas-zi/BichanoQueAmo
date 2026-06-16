import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const setupPath = new URL("../supabase/reset_and_setup.sql", import.meta.url);
const migrationsPath = new URL("../supabase/migrations/", import.meta.url);
const appPath = new URL("../components/BichanoApp.tsx", import.meta.url);
const readmePath = new URL("../README.md", import.meta.url);
const supabaseReadmePath = new URL("../supabase/README.md", import.meta.url);

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
  assert.match(setupSql, /create function public\.manage_appointment/);
  assert.match(setupSql, /create function public\.review_appointment_request/);
  assert.match(setupSql, /Solicitacao recusada/);
  assert.match(setupSql, /role in \('staff', 'admin'\)/);
  assert.match(setupSql, /'pending'::public\.payment_status/);
  assert.match(setupSql, /create function public\.sync_appointment_payment/);
  assert.match(setupSql, /visit_count integer not null default 1/);
  assert.match(setupSql, /extra_pet_count integer not null default 0/);
  assert.match(setupSql, /completed_at timestamptz/);
  assert.match(source, /requested_visit_count: bookingVisitCount/);
  assert.match(source, /requested_extra_pet_count: Math\.max\(bookingPetIds\.length - 1, 0\)/);
  assert.doesNotMatch(source, /for \(const selectedPetId of bookingPetIds\)/);
  assert.doesNotMatch(source, /bookingPetIds\.flatMap\(\(selectedPetId\)/);
  assert.match(source, /supabase\.rpc\("record_visit"/);
  assert.match(source, /trimmedVisitNote \|\| "Visita concluida pela administracao\."/);
  assert.match(source, /function markAppointmentPaymentReceived/);
  assert.match(source, /\.eq\("appointment_id", appointmentId\)/);
  assert.match(source, /Status financeiro ao concluir/);
  assert.match(source, /admin_payment_status/);
  assert.match(source, /financial_note/);
  assert.match(source, /function isMissingRpcSignature/);
  assert.match(source, /function isAppointmentStatusCastError/);
  assert.match(source, /function saveVisitRecordDirect/);
  assert.match(source, /function saveVisitRecord/);
  assert.match(source, /syncCompletedVisitPayment/);
  assert.match(source, /could not find/);
  assert.match(source, /amount_cents: 1/);
  assert.match(source, /Concluida - aguardando pagamento/);
  assert.match(source, /Concluida - pagamento recebido/);
  assert.match(source, /recordVisit\(true, adminCompletionPaymentStatus\)/);
  assert.match(setupSql, /admin_payment_status public\.payment_status default null/);
  assert.match(setupSql, /Defina se a visita concluida ficou pendente de pagamento ou foi paga/);
  assert.match(setupSql, /payment_due/);
  assert.match(setupSql, /interval '3 days'/);
  assert.match(setupSql, /amount := greatest\(coalesce\(amount, 1\), 1\)/);
  assert.match(setupSql, /'completed'::public\.appointment_status/);
  assert.match(setupSql, /'in_progress'::public\.appointment_status/);
  assert.match(source, /supabase\.rpc\("staff_update_assigned_visit"/);
  assert.match(source, /from\("pets"\)\.update\(petPayload\)/);
  assert.match(source, /from\("pets"\)\.update\(\{ active: false \}\)/);
  assert.doesNotMatch(source, /Convite demonstrativo enviado/);
  assert.doesNotMatch(source, /defaultValue="2026-06-16"/);
});

test("staff can update only assigned visits without admin privileges", async () => {
  const source = await readFile(appPath, "utf8");
  const setupSql = await readFile(setupPath, "utf8");
  assert.match(source, /Status da visita/);
  assert.match(source, /function updateAssignedVisit/);
  assert.match(source, /requested_status: managedStatus/);
  assert.match(setupSql, /create function public\.staff_update_assigned_visit/);
  assert.match(setupSql, /public\.staff_is_assigned_to_appointment\(target_appointment_id\)/);
  assert.match(setupSql, /requested_status not in \('confirmed', 'in_progress', 'completed'\)/);
  assert.doesNotMatch(
    setupSql.match(/create function public\.staff_update_assigned_visit[\s\S]*?\$\$;/)?.[0] || "",
    /public\.is_admin\(\)/,
  );
});

test("financial dashboard separates pending and received payments", async () => {
  const source = await readFile(appPath, "utf8");
  const setupSql = await readFile(setupPath, "utf8");
  const patchSql = await readFile(new URL("../supabase/patches/financial_visit_control.sql", import.meta.url), "utf8");
  assert.match(source, /Pendentes de pagamento/);
  assert.match(source, /Pagamentos recebidos/);
  assert.match(source, /Total recebido/);
  assert.match(source, /Total pendente/);
  assert.match(source, /em aberto/);
  assert.match(source, /\.in\("status", \["pending", "overdue", "paid"\]\)/);
  assert.match(setupSql, /Conclua a visita pelo fechamento financeiro/);
  assert.match(patchSql, /financial control for completed visits/);
  assert.match(patchSql, /drop function if exists public\.record_visit\(uuid, text, boolean, public\.payment_status, text\)/);
  assert.match(patchSql, /notify pgrst, 'reload schema'/);
});

test("staff registration promotes an existing signup without Edge Functions", async () => {
  const appSource = await readFile(appPath, "utf8");
  const setupSql = await readFile(setupPath, "utf8");
  assert.match(appSource, /Cadastrar babá/);
  assert.match(appSource, /supabase\.rpc\("admin_register_staff"/);
  assert.doesNotMatch(appSource, /functions\/v1\/invite-staff/);
  assert.doesNotMatch(appSource, /setInviteOpen/);
  assert.match(appSource, /staffFormError/);
  assert.match(appSource, /styles\.staffRegistration/);
  assert.match(setupSql, /create function public\.admin_register_staff/);
  assert.match(setupSql, /role = 'staff'/);
  assert.match(setupSql, /notify pgrst, 'reload schema'/);
});

test("documentation points to the consolidated Supabase setup", async () => {
  const readme = await readFile(readmePath, "utf8");
  const supabaseReadme = await readFile(supabaseReadmePath, "utf8");
  assert.match(readme, /reset_and_setup\.sql/);
  assert.match(readme, /fonte canônica/);
  assert.match(readme, /patches\/` são histórico/);
  assert.match(readme, /admin_register_staff/);
  assert.doesNotMatch(readme, /functions deploy invite-staff/);
  assert.match(supabaseReadme, /canonical backend definition/);
  assert.match(supabaseReadme, /Legacy SQL Patches/);
  assert.match(supabaseReadme, /Legacy Edge Function/);
});
