"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./BichanoApp.module.css";

type Role = "client" | "admin" | "staff";
type ProfilePanel = "personal" | "address" | "notifications" | "security" | "help" | null;
type AuthProfile = {
  role: Role;
  onboarding_completed_at: string | null;
  active: boolean;
  full_name: string | null;
  phone: string | null;
  address: string | null;
};
type AppointmentView = {
  id: string;
  date: string;
  time: string;
  pet: string;
  service: string;
  tutor: string;
  address: string;
  sitter: string;
  status: string;
  notes?: string;
  dateKey?: string;
  rawStatus?: string;
  sitterId?: string;
  startsAt?: string;
};
type PetView = {
  id: string;
  icon: string;
  name: string;
  description: string;
  ownerId?: string;
  photoUrl?: string;
  sex?: string;
  breed?: string | null;
  approximateAge?: string | null;
  medicationDetails?: string | null;
};
type ServiceView = { id: string; icon: string; name: string; description: string; durationMinutes: number };
type BookingDateSelection = { date: string; visitsPerDay: "1" | "2" };
type StaffView = { id: string; name: string; phone: string; role: Role; active: boolean; assignedCount: number };
type ClientView = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  petNames: string[];
  active: boolean;
  onboardingCompleted: boolean;
  emailConfirmed: boolean;
  welcomeCode: string | null;
};
type ClientPetDetail = {
  id: string;
  name: string;
  sex: string | null;
  breed: string | null;
  approximateAge: string | null;
  hasHealthCondition: boolean;
  healthConditionDetails: string | null;
  usesMedication: boolean;
  medicationDetails: string | null;
  hasAllergy: boolean;
  allergyDetails: string | null;
  veterinarianContact: string | null;
  intakeObservations: string | null;
  intakeCompletedAt: string | null;
  photoUrl?: string;
};
type ClientDetail = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string | null;
  profession: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  onboardingCompletedAt: string | null;
  active: boolean;
  pets: ClientPetDetail[];
};
type PaymentView = { id: string; amountCents: number; dueDate: string; status: string; pet: string; service: string; tutor: string };
type NotificationView = { id: string; title: string; body: string };
type WaitlistRequestView = {
  id: string;
  date: string;
  time: string;
  pet: string;
  service: string;
  tutor: string;
  address: string;
  notes: string;
  status: string;
  requestedStartsAt: string;
};
type DiscountCodeView = {
  id: string;
  code: string;
  discountValue: number;
  expiresAt: string | null;
  maxUses: number | null;
  timesUsed: number;
  active: boolean;
  benefitMonths: number | null;
  usedBy?: string[];
};
type DiscountRedemptionView = {
  id: string;
  code: string;
  clientName: string;
  validUntil: string | null;
  cancelledAt: string | null;
};
type ActiveDiscountView = {
  code: string;
  discountValue: number;
  validUntil: string | null;
};
type AdminMetrics = {
  todayTotal: number;
  todayCompleted: number;
  requested: number;
  clients: number;
  pets: number;
  waitlist: number;
  pendingCents: number;
  overdueCents: number;
  overdueCount: number;
};
type IntakeData = {
  tutorName: string;
  tutorPhone: string;
  tutorAddress: string;
  tutorProfession: string;
  emergencyName: string;
  emergencyPhone: string;
  petName: string;
  petSex: string;
  petBreed: string;
  petAge: string;
  hasHealthCondition: boolean;
  healthDetails: string;
  usesMedication: boolean;
  medicationDetails: string;
  hasAllergy: boolean;
  allergyDetails: string;
  veterinarian: string;
  observations: string;
};
type Page =
  | "home"
  | "services"
  | "pets"
  | "calendar"
  | "admin"
  | "payments"
  | "clients"
  | "history"
  | "staffAccess"
  | "staffHome"
  | "profile";

const roleStartPage: Record<Role, Page> = {
  client: "home",
  admin: "admin",
  staff: "staffHome",
};

const EXTRA_CAT_FEE_CENTS = 1000;

const demoServices = [
  { id: "demo-service-1", icon: "⌂", name: "Cat sitting", description: "Visita com alimentação, água, caixa de areia, brincadeiras e relatório com fotos.", durationMinutes: 60 },
  { id: "demo-service-2", icon: "+", name: "Administração de medicamento", description: "Visita seguindo receita e orientações informadas pelo tutor.", durationMinutes: 60 },
  { id: "demo-service-3", icon: "◇", name: "Hospedagem domiciliar", description: "Diária de 24 horas em ambiente telado, individual e preparado para gatos.", durationMinutes: 1440 },
];

const demoPets = [
  { icon: "●", name: "Mel", description: "Fêmea • Persa • 3 anos • Sem medicação contínua" },
  { icon: "●", name: "Frodo", description: "Macho • SRD • 5 anos • Medicação às 14h30" },
];

const demoAppointments: AppointmentView[] = [
  {
    id: "demo-1",
    date: "Terça, 16 de junho",
    time: "09:00",
    pet: "Mel",
    service: "Cat sitting",
    tutor: "Ana Lima",
    address: "Rua Barata Ribeiro, 312 • Copacabana",
    sitter: "Bárbara Alves",
    status: "Confirmada",
  },
  {
    id: "demo-2",
    date: "Quarta, 17 de junho",
    time: "14:30",
    pet: "Nina",
    service: "Administração de medicamento",
    tutor: "Júlia Costa",
    address: "Rua Voluntários da Pátria, 188 • Botafogo",
    sitter: "Aguardando atribuição",
    status: "Pendente",
  },
];

function relation(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return (value[0] || {}) as Record<string, unknown>;
  return (value || {}) as Record<string, unknown>;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

function startOfLocalDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function copyTextWithSelection(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
}

function bookingStartsAtOptions(date: string, visitsPerDay: "1" | "2") {
  const times = visitsPerDay === "2" ? ["09:00", "17:00"] : ["12:00"];
  return times.map((time) => new Date(`${date}T${time}`));
}

function earliestBookableDateKey() {
  return localDateKey(new Date(Date.now() + 86400000));
}

function datesBetween(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return [];
  const dates: string[] = [];
  for (const current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
    dates.push(localDateKey(current));
  }
  return dates;
}

function normalizeQrCodeSource(source: string) {
  const trimmed = source.trim();
  const separatorIndex = trimmed.indexOf(",");

  if (trimmed.startsWith("data:image/svg+xml") && separatorIndex >= 0) {
    const prefix = trimmed.slice(0, separatorIndex + 1);
    const svg = trimmed.slice(separatorIndex + 1);
    return `${prefix}${encodeURIComponent(svg)}`;
  }

  if (trimmed.startsWith("<svg") || trimmed.startsWith("<?xml")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
  }

  return trimmed;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function mapAppointment(row: Record<string, unknown>): AppointmentView {
  const startsAt = new Date(String(row.starts_at));
  const pet = relation(row.pet);
  const owner = relation(pet.owner);
  const service = relation(row.service);
  const sitter = relation(row.sitter);
  const rawStatus = String(row.status || "requested");
  const statusLabels: Record<string, string> = {
    requested: "Solicitada",
    confirmed: "Confirmada",
    in_progress: "Em andamento",
    completed: "Concluída",
    cancelled: "Cancelada",
  };

  return {
    id: String(row.id),
    date: new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(startsAt),
    dateKey: localDateKey(startsAt),
    time: rawStatus === "requested" ? "ROTA" : startsAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    pet: String(pet.name || "Bichano não informado"),
    service: String(service.name || "Serviço não informado"),
    tutor: String(owner.full_name || "Tutor não informado"),
    address: String(row.address || "Endereço não informado"),
    sitter: String(sitter.full_name || "Não atribuída"),
    sitterId: sitter.id ? String(sitter.id) : undefined,
    status: statusLabels[rawStatus] || rawStatus,
    notes: String(row.client_notes || ""),
    rawStatus,
    startsAt: startsAt.toISOString(),
  };
}

function mapPayment(row: Record<string, unknown>): PaymentView {
  const appointment = relation(row.appointment);
  const pet = relation(appointment.pet);
  const service = relation(appointment.service);
  return {
    id: String(row.id),
    amountCents: Number(row.amount_cents || 0),
    dueDate: String(row.due_date || ""),
    status: String(row.status || "pending"),
    pet: String(pet.name || "Bichano não informado"),
    service: String(service.name || "Serviço não informado"),
    tutor: String(relation(pet.owner).full_name || "Tutor não informado"),
  };
}

function mapWaitlistRequest(row: Record<string, unknown>): WaitlistRequestView {
  const startsAt = new Date(String(row.requested_starts_at));
  const pet = relation(row.pet);
  const owner = relation(pet.owner);
  const service = relation(row.service);
  const rawStatus = String(row.status || "waiting");
  const statusLabels: Record<string, string> = {
    waiting: "Aguardando encaixe",
    approved: "Encaixado",
    rejected: "Recusado",
    cancelled: "Cancelado",
  };

  return {
    id: String(row.id),
    date: new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(startsAt),
    time: startsAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    pet: String(pet.name || "Bichano não informado"),
    service: String(service.name || "Serviço não informado"),
    tutor: String(owner.full_name || "Tutor não informado"),
    address: String(row.address || "Endereço não informado"),
    notes: String(row.client_notes || ""),
    status: statusLabels[rawStatus] || rawStatus,
    requestedStartsAt: startsAt.toISOString(),
  };
}

function isRouteAppointment(appointment: AppointmentView) {
  return appointment.rawStatus === "requested"
    || appointment.status === "Solicitada"
    || appointment.status === "Pendente"
    || appointment.time === "12:00";
}

function appointmentTimeLabel(appointment: AppointmentView) {
  return isRouteAppointment(appointment) ? "ROTA" : appointment.time;
}

function appointmentCalendarDateKeys(appointment: AppointmentView) {
  const keys = new Set<string>();
  const notes = appointment.notes || "";
  const dateMatches = notes.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g);

  for (const match of dateMatches) {
    const [, day, month, year] = match;
    keys.add(`${year}-${month}-${day}`);
  }

  if (appointment.dateKey) keys.add(appointment.dateKey);
  return [...keys];
}

function LogoAnimation() {
  return (
    <div className={styles.logoStage} aria-label="Bichano que Amo">
      <div className={styles.logoGlow} />
      <div className={styles.animatedLogo}>
        <Image src="/BichanoQueAmoLogo.svg" alt="Bichano que Amo" fill priority />
        <span className={`${styles.eyelid} ${styles.leftEye}`} />
        <span className={`${styles.eyelid} ${styles.rightEye}`} />
        {["small", "", "large", "small", "", "large"].map((size, index) => (
          <span
            className={`${styles.floatingHeart} ${index % 2 ? styles.heartRight : styles.heartLeft} ${
              size ? styles[size as "small" | "large"] : ""
            }`}
            key={`${size}-${index}`}
          >
            ♥
          </span>
        ))}
      </div>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  if (!message) return null;
  return <div className={styles.toast}>{message}</div>;
}

export function BichanoApp() {
  const supabase = useMemo(() => createClient(), []);
  const requireStaffMfa = process.env.NEXT_PUBLIC_REQUIRE_STAFF_MFA === "true";
  const [loggedIn, setLoggedIn] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(Boolean(supabase));
  const [rememberSession, setRememberSession] = useState(true);
  const [role, setRole] = useState<Role>("client");
  const [page, setPage] = useState<Page>("home");
  const [email, setEmail] = useState(supabase ? "" : "ana@email.com");
  const [password, setPassword] = useState(supabase ? "" : "123456");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [pendingAccess, setPendingAccess] = useState<{ userId: string; profile: AuthProfile } | null>(null);
  const [mfaMode, setMfaMode] = useState<"challenge" | "enroll" | null>(null);
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaQrCode, setMfaQrCode] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [signupSuccess, setSignupSuccess] = useState("");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [petOpen, setPetOpen] = useState(false);
  const [appointmentOpen, setAppointmentOpen] = useState<AppointmentView | null>(null);
  const [cancelAppointmentOpen, setCancelAppointmentOpen] = useState<AppointmentView | null>(null);
  const [profilePanel, setProfilePanel] = useState<ProfilePanel>(null);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [toast, setToast] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileId, setProfileId] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [notificationPreferences, setNotificationPreferences] = useState({
    appointments: true,
    payments: true,
    news: false,
  });
  const [realAppointments, setRealAppointments] = useState<AppointmentView[]>([]);
  const [realPets, setRealPets] = useState<PetView[]>([]);
  const [realServices, setRealServices] = useState<ServiceView[]>([]);
  const [realStaff, setRealStaff] = useState<StaffView[]>([]);
  const [realClients, setRealClients] = useState<ClientView[]>([]);
  const [realPayments, setRealPayments] = useState<PaymentView[]>([]);
  const [realNotifications, setRealNotifications] = useState<NotificationView[]>([]);
  const [realWaitlistRequests, setRealWaitlistRequests] = useState<WaitlistRequestView[]>([]);
  const [clearedHistoryIds, setClearedHistoryIds] = useState<string[]>([]);
  const [adminMetrics, setAdminMetrics] = useState<AdminMetrics>({
    todayTotal: 0,
    todayCompleted: 0,
    requested: 0,
    clients: 0,
    pets: 0,
    waitlist: 0,
    pendingCents: 0,
    overdueCents: 0,
    overdueCount: 0,
  });
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [paymentSavingId, setPaymentSavingId] = useState("");
  const [clientSavingId, setClientSavingId] = useState("");
  const [clientListLoading, setClientListLoading] = useState(false);
  const [clientListError, setClientListError] = useState("");
  const [clientListCheckedAt, setClientListCheckedAt] = useState("");
  const [clientDetail, setClientDetail] = useState<ClientDetail | null>(null);
  const [clientDetailLoading, setClientDetailLoading] = useState(false);
  const [clientDetailError, setClientDetailError] = useState("");
  const [legacyClientEmail, setLegacyClientEmail] = useState("");
  const [pricingOpen, setPricingOpen] = useState(false);
  const [standardVisitPrice, setStandardVisitPrice] = useState(supabase ? "" : "55,00");
  const [pricingSaving, setPricingSaving] = useState(false);
  const [discountCodes, setDiscountCodes] = useState<DiscountCodeView[]>([]);
  const [discountDeleteOpen, setDiscountDeleteOpen] = useState<DiscountCodeView | null>(null);
  const [discountValue, setDiscountValue] = useState("10,00");
  const [discountExpiresAt, setDiscountExpiresAt] = useState("");
  const [discountMaxUses, setDiscountMaxUses] = useState("1");
  const [discountRedemptions, setDiscountRedemptions] = useState<DiscountRedemptionView[]>([]);
  const [clientActiveDiscount, setClientActiveDiscount] = useState<ActiveDiscountView | null>(null);
  const [bookingDiscountCode, setBookingDiscountCode] = useState("");
  const [bookingDiscountValueCents, setBookingDiscountValueCents] = useState(0);
  const [discountActivating, setDiscountActivating] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [bookingPetIds, setBookingPetIds] = useState<string[]>([]);
  const [bookingServiceId, setBookingServiceId] = useState("");
  const [bookingDateDraft, setBookingDateDraft] = useState("");
  const [bookingEndDateDraft, setBookingEndDateDraft] = useState("");
  const [bookingVisitsDraft, setBookingVisitsDraft] = useState<"1" | "2">("1");
  const [bookingDates, setBookingDates] = useState<BookingDateSelection[]>([]);
  const [bookingAddress, setBookingAddress] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [bookingDiscountOpen, setBookingDiscountOpen] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingWaitlistAvailable, setBookingWaitlistAvailable] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [petName, setPetName] = useState("");
  const [petSex, setPetSex] = useState("unknown");
  const [petBreed, setPetBreed] = useState("");
  const [petAge, setPetAge] = useState("");
  const [petMedication, setPetMedication] = useState("");
  const [petPhoto, setPetPhoto] = useState<File | null>(null);
  const [editingPet, setEditingPet] = useState<PetView | null>(null);
  const [managedStatus, setManagedStatus] = useState("requested");
  const [managedStaffId, setManagedStaffId] = useState("");
  const [managedStartsAt, setManagedStartsAt] = useState("");
  const [selectedCalendarDateKey, setSelectedCalendarDateKey] = useState("");
  const [visitNote, setVisitNote] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  const allAppointments = supabase ? realAppointments : demoAppointments;
  const currentDayStartTime = startOfLocalDay(new Date()).getTime();
  const visibleAppointments = allAppointments.filter((appointment) => {
    const appointmentTime = appointment.startsAt ? new Date(appointment.startsAt).getTime() : currentDayStartTime;
    return appointment.rawStatus !== "cancelled"
      && appointment.rawStatus !== "completed"
      && (!Number.isFinite(appointmentTime) || appointmentTime >= currentDayStartTime);
  });
  const approvedAppointments = visibleAppointments.filter((appointment) => (
    appointment.rawStatus === "confirmed" || appointment.rawStatus === "in_progress" || appointment.status === "Confirmada" || appointment.status === "Em andamento"
  ));
  const selectedCalendarAppointments = selectedCalendarDateKey
    ? approvedAppointments.filter((appointment) => appointmentCalendarDateKeys(appointment).includes(selectedCalendarDateKey))
    : visibleAppointments;
  const requestedAppointments = visibleAppointments.filter((appointment) => (
    appointment.rawStatus === "requested" || appointment.status === "Solicitada" || appointment.status === "Pendente"
  ));
  const visitHistory = allAppointments.filter((appointment) => (
    appointment.rawStatus === "cancelled" || appointment.rawStatus === "completed"
  ));
  const visibleVisitHistory = (role === "client" ? visitHistory.slice(0, 2) : visitHistory)
    .filter((appointment) => !clearedHistoryIds.includes(appointment.id));
  const visiblePets: PetView[] = supabase ? realPets : demoPets.map((pet, index) => ({ id: String(index), icon: pet.icon, name: pet.name, description: pet.description }));
  const visibleServices = supabase ? realServices : demoServices;
  const bookingServices = visibleServices.filter((service) => service.name.toLowerCase() === "cat sitting");
  const selectedBookingService = bookingServices.find((service) => service.id === bookingServiceId) || bookingServices[0];
  const bookingVisitCount = bookingDates.reduce((sum, item) => sum + Number(item.visitsPerDay), 0);
  const bookingUnitPriceCents = parseCurrencyToCents(standardVisitPrice);
  const bookingExtraCatFeeCents = Math.max(bookingPetIds.length - 1, 0) * EXTRA_CAT_FEE_CENTS;
  const bookingDailyTotalCents = Number.isFinite(bookingUnitPriceCents) ? bookingUnitPriceCents + bookingExtraCatFeeCents : 0;
  const bookingTotalCents = Number.isFinite(bookingUnitPriceCents)
    ? bookingDailyTotalCents * bookingVisitCount
    : 0;
  const effectiveBookingDiscountCents = bookingDiscountValueCents || clientActiveDiscount?.discountValue || 0;
  const bookingDiscountPerVisitCents = Number.isFinite(bookingUnitPriceCents)
    ? Math.min(effectiveBookingDiscountCents, bookingUnitPriceCents)
    : 0;
  const bookingDiscountedDailyTotalCents = Math.max(bookingDailyTotalCents - bookingDiscountPerVisitCents, 0);
  const bookingTotalDiscountCents = bookingDiscountPerVisitCents * bookingVisitCount;
  const bookingDiscountedTotalCents = Math.max(bookingTotalCents - bookingTotalDiscountCents, 0);
  const nextAppointment = approvedAppointments[0];
  const myAppointments = role === "admin"
    ? visibleAppointments.filter((appointment) => appointment.sitterId === profileId)
    : visibleAppointments;
  const nextPayment = realPayments[0];
  const pendingClients = realClients.filter((client) => !client.active);
  const todayLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(new Date());
  const firstName = profileName.trim().split(" ")[0] || (role === "staff" ? "Babá" : role === "admin" ? "Equipe" : "Cliente");
  const profileInitials = profileName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("pt-BR") || (role === "admin" ? "EQ" : role === "staff" ? "BA" : "CL");

  useEffect(() => {
    if (!supabase) return;
    const authClient = supabase;

    let active = true;

    async function restoreSession() {
      const { data } = await authClient.auth.getSession();
      if (!active || !data.session) {
        if (active) setSessionChecking(false);
        return;
      }

      const remembered = window.localStorage.getItem("bichano-remember-session") === "true";
      const currentTab = window.sessionStorage.getItem("bichano-session-tab") === "true";
      setRememberSession(remembered);

      if (!remembered && !currentTab) {
        void authClient.auth.signOut();
        if (active) setSessionChecking(false);
        return;
      }

      try {
        await Promise.race([
          continueAuthenticatedSession(data.session.user.id),
          new Promise<never>((_, reject) => {
            window.setTimeout(
              () => reject(new Error("A verificação da sessão demorou para responder.")),
              12000,
            );
          }),
        ]);
      } catch {
        void authClient.auth.signOut();
      } finally {
        if (active) setSessionChecking(false);
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
    // Session restoration must run only when the singleton auth client changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function openBooking() {
    setBookingError("");
    setBookingWaitlistAvailable(false);
    setBookingPetIds((current) => current.length ? current : (visiblePets[0]?.id ? [visiblePets[0].id] : []));
    setBookingServiceId((current) => current || bookingServices[0]?.id || "");
    setBookingAddress((current) => current || profileAddress);
    setBookingDateDraft((current) => current || earliestBookableDateKey());
    setBookingEndDateDraft((current) => current || earliestBookableDateKey());
    setBookingDates((current) => current.length ? current : [{ date: earliestBookableDateKey(), visitsPerDay: "1" }]);
    setBookingDiscountOpen(false);
    setBookingOpen(true);
  }

  function toggleBookingPet(petId: string) {
    setBookingPetIds((current) => (
      current.includes(petId)
        ? current.filter((item) => item !== petId)
        : [...current, petId]
    ));
  }

  function addBookingDate() {
    setBookingError("");
    if (!bookingDateDraft || !bookingEndDateDraft) {
      setBookingError("Escolha a data de início e a data final.");
      return;
    }
    const periodDates = datesBetween(bookingDateDraft, bookingEndDateDraft);
    if (!periodDates.length) {
      setBookingError("A data final precisa ser igual ou posterior ao início.");
      return;
    }
    const startsAtOptions = periodDates.flatMap((date) => bookingStartsAtOptions(date, bookingVisitsDraft));
    if (!startsAtOptions.length || startsAtOptions.some((startsAt) => !Number.isFinite(startsAt.getTime())) || startsAtOptions.some((startsAt) => startsAt <= new Date())) {
      setBookingError("Escolha uma data futura.");
      return;
    }
    setBookingDates((current) => {
      const selectedDates = new Set(periodDates);
      const withoutPeriod = current.filter((item) => !selectedDates.has(item.date));
      return [...withoutPeriod, ...periodDates.map((date) => ({ date, visitsPerDay: bookingVisitsDraft }))]
        .sort((left, right) => left.date.localeCompare(right.date));
    });
  }

  function updateBookingDateVisits(date: string, visitsPerDay: "1" | "2") {
    setBookingDates((current) => current.map((item) => (
      item.date === date ? { ...item, visitsPerDay } : item
    )));
  }

  function removeBookingDate(date: string) {
    setBookingDates((current) => current.filter((item) => item.date !== date));
  }

  function selectDemoRole(nextRole: Role) {
    if (supabase) {
      notify("No modo conectado, o perfil é definido pelo usuário.");
      return;
    }
    setRole(nextRole);
    setProfileName(nextRole === "admin" ? "Bárbara Queiroz" : nextRole === "staff" ? "Bárbara Alves" : "Ana Lima");
    setProfilePhone(nextRole === "admin" ? "(21) 99999-0000" : "(21) 98888-0000");
    setProfileAddress(nextRole === "client" ? "Rua Barata Ribeiro, 312 - Copacabana" : "");
    setEmail(
      nextRole === "admin"
        ? "contato@bichano.com"
        : nextRole === "staff"
          ? "baba@bichano.com"
          : "ana@email.com",
    );
  }

  async function getProfile(userId: string) {
    if (!supabase) throw new Error("Serviço de autenticação indisponível.");

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role, onboarding_completed_at, active, full_name, phone, address")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw new Error(`O perfil não pôde ser carregado: ${error.message}`);
    if (!profile) throw new Error("Usuário autenticado, mas o perfil do app não foi criado.");
    if (!profile.active) {
      throw new Error(
        profile.role === "client"
          ? "Seu cadastro está aguardando aprovação da administradora."
          : "Este acesso está suspenso. Fale com a administradora.",
      );
    }

    return profile as AuthProfile;
  }

  async function enterApp(userId: string, profile: AuthProfile) {
    if (!supabase) return;

    const { data: factors } = await supabase.auth.mfa.listFactors();
    setMfaEnabled(Boolean(factors?.totp.length));
    setProfileId(userId);
    setProfileName(profile.full_name || "");
    setProfilePhone(profile.phone || "");
    setProfileAddress(profile.address || "");
    setRole(profile.role);
    setOnboardingRequired(profile.role === "client" && !profile.onboarding_completed_at);
    setPage(roleStartPage[profile.role]);
    setPendingAccess(null);
    setMfaMode(null);
    setMfaCode("");
    setPassword("");
    setLoggedIn(true);
    if (window.localStorage.getItem("bichano-password-recovery") === "true") {
      window.localStorage.removeItem("bichano-password-recovery");
      setPage("profile");
      setProfilePanel("security");
    }
    void loadRealData(profile.role);
  }

  async function beginMfaEnrollment(userId: string, profile: AuthProfile) {
    if (!supabase) return;

    const { data: existingFactors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;

    const staleFactors = existingFactors.all.filter((factor) => factor.status !== "verified");
    for (const factor of staleFactors) {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) throw unenrollError;
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Bichano que Amo",
    });
    if (error) throw error;

    setPendingAccess({ userId, profile });
    setMfaFactorId(data.id);
    setMfaQrCode(data.totp.qr_code);
    setMfaSecret(data.totp.secret);
    setMfaCode("");
    setMfaError("");
    setMfaMode("enroll");
  }

  async function continueAuthenticatedSession(userId: string) {
    if (!supabase) return;

    const profile = await getProfile(userId);
    if (!requireStaffMfa) {
      await enterApp(userId, profile);
      return;
    }

    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw assuranceError;

    if (profile.role === "client" || assurance?.currentLevel === "aal2") {
      await enterApp(userId, profile);
      return;
    }

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    const factor = factors.totp.find((item) => item.status === "verified");

    if (!factor) {
      await beginMfaEnrollment(userId, profile);
      return;
    }

    setPendingAccess({ userId, profile });
    setMfaFactorId(factor.id);
    setMfaCode("");
    setMfaError("");
    setMfaMode("challenge");
  }

  async function verifyMfa(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !pendingAccess || !/^\d{6}$/.test(mfaCode)) {
      setMfaError("Informe o código de seis dígitos.");
      return;
    }

    setMfaBusy(true);
    setMfaError("");
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: mfaFactorId,
        code: mfaCode,
      });
      if (error) throw error;

      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;

      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance.currentLevel !== "aal2") {
        throw new Error("A sessão não recebeu a verificação em duas etapas.");
      }

      setMfaEnabled(true);
      await enterApp(pendingAccess.userId, pendingAccess.profile);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setMfaError(
        /invalid|expired|code|challenge/i.test(message)
          ? "Código inválido ou expirado. Aguarde o próximo código e tente novamente."
          : `Não foi possível concluir a entrada: ${message || "tente novamente."}`,
      );
    } finally {
      setMfaBusy(false);
    }
  }

  async function cancelMfa() {
    if (!supabase) return;
    if (mfaMode === "enroll" && mfaFactorId) {
      await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
    }

    if (loggedIn && pendingAccess?.profile.role === "client") {
      setPendingAccess(null);
      setMfaMode(null);
      setMfaCode("");
      return;
    }

    await logout();
    setPendingAccess(null);
    setMfaMode(null);
    setMfaCode("");
  }

  async function openSecurityPanel() {
    setProfilePanel("security");
    setMfaError("");
    if (!supabase) return;
    const { data } = await supabase.auth.mfa.listFactors();
    setMfaEnabled(Boolean(data?.totp.length));
  }

  async function enableMfaFromProfile() {
    if (!supabase || !profileId) return;
    try {
      await beginMfaEnrollment(profileId, {
        role,
        onboarding_completed_at: onboardingRequired ? null : new Date().toISOString(),
        active: true,
        full_name: profileName,
        phone: profilePhone,
        address: profileAddress,
      });
      setProfilePanel(null);
    } catch (error) {
      setMfaError(error instanceof Error ? error.message : "Não foi possível iniciar a verificação.");
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoginError("");

    if (!email.trim() || !password) {
      setLoginError("Informe o e-mail e a senha.");
      return;
    }

    if (!supabase) {
      if (!profileName) {
        setProfileName(role === "admin" ? "Bárbara Queiroz" : role === "staff" ? "Bárbara Alves" : "Ana Lima");
      }
      setLoggedIn(true);
      setPage(roleStartPage[role]);
      setOnboardingRequired(role === "client");
      notify("Modo demonstrativo ativo.");
      return;
    }

    setLoading(true);
    try {
      if (rememberSession) {
        window.localStorage.setItem("bichano-remember-session", "true");
        window.sessionStorage.removeItem("bichano-session-tab");
      } else {
        window.localStorage.removeItem("bichano-remember-session");
        window.sessionStorage.setItem("bichano-session-tab", "true");
      }

      const loginRequest = supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      const { data, error } = await Promise.race([
        loginRequest,
        new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new Error("O serviço de login demorou para responder. Tente novamente.")),
            15000,
          );
        }),
      ]);
      if (error || !data.user) {
        setLoginError(
          error?.message === "Invalid login credentials"
            ? "E-mail ou senha incorretos."
            : `Não foi possível entrar: ${error?.message || "usuário não encontrado"}`,
        );
        return;
      }

      await continueAuthenticatedSession(data.user.id);
    } catch (error) {
      await supabase.auth.signOut();
      setLoginError(
        error instanceof Error
          ? error.message
          : "Não foi possível conectar ao serviço de login.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await supabase?.auth.signOut();
    window.localStorage.removeItem("bichano-remember-session");
    window.sessionStorage.removeItem("bichano-session-tab");
    setLoggedIn(false);
    setProfileId("");
    setProfilePanel(null);
    setPage("home");
    setRealAppointments([]);
    setRealPets([]);
    setRealStaff([]);
    setRealClients([]);
    setRealPayments([]);
    setRealNotifications([]);
  }

  async function saveProfile(fields: "personal" | "address") {
    setProfileError("");
    if (fields === "personal" && !profileName.trim()) {
      setProfileError("Informe seu nome.");
      return;
    }

    setProfileSaving(true);
    try {
      if (supabase && profileId) {
        const changes = fields === "personal"
          ? { full_name: profileName.trim(), phone: profilePhone.trim() || null }
          : { address: profileAddress.trim() || null };
        const { error } = await supabase.from("profiles").update(changes).eq("id", profileId);
        if (error) throw error;
      }
      setProfilePanel(null);
      notify(fields === "personal" ? "Dados pessoais atualizados." : "Endereço atualizado.");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Não foi possível salvar as alterações.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function loadAdminClients() {
    if (!supabase) return;

    setClientListLoading(true);
    setClientListError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("A sessão administrativa expirou. Saia e entre novamente.");

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, address, active, onboarding_completed_at")
        .eq("role", "client")
        .order("active", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;

      const clientIds = (data || []).map((client) => client.id);
      const { data: petRows, error: petError } = clientIds.length
        ? await supabase
            .from("pets")
            .select("owner_id, name")
            .in("owner_id", clientIds)
            .eq("active", true)
            .order("name")
        : { data: [], error: null };
      if (petError) throw petError;

      const petNamesByClient = new Map<string, string[]>();
      (petRows || []).forEach((pet) => {
        const names = petNamesByClient.get(pet.owner_id) || [];
        names.push(pet.name);
        petNamesByClient.set(pet.owner_id, names);
      });

      setRealClients((data || []).map((client) => ({
        id: client.id,
        name: client.full_name?.trim() || client.email?.split("@")[0] || "Nome não informado",
        email: client.email || "E-mail não informado",
        phone: client.phone || "Telefone não informado",
        address: client.address || "EndereÃ§o nÃ£o informado",
        petNames: petNamesByClient.get(client.id) || [],
        active: client.active,
        onboardingCompleted: Boolean(client.onboarding_completed_at),
        emailConfirmed: true,
        welcomeCode: null,
      })));
      setClientListCheckedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      setClientListError(`Não foi possível carregar os cadastros: ${message}`);
      throw error;
    } finally {
      setClientListLoading(false);
    }
  }

  async function openClientDetail(client: ClientView) {
    if (!supabase) {
      setClientDetail({
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: "Rua Barata Ribeiro, 312 - Copacabana",
        profession: "Tutor de demonstracao",
        emergencyContactName: "Contato de emergencia",
        emergencyContactPhone: "(21) 99999-0000",
        onboardingCompletedAt: client.onboardingCompleted ? new Date().toISOString() : null,
        active: client.active,
        pets: demoPets.map((pet, index) => ({
          id: `demo-client-pet-${index}`,
          name: pet.name,
          sex: index === 0 ? "female" : "male",
          breed: index === 0 ? "Persa" : "SRD",
          approximateAge: index === 0 ? "3 anos" : "5 anos",
          hasHealthCondition: false,
          healthConditionDetails: null,
          usesMedication: index === 1,
          medicationDetails: index === 1 ? "Medicacao as 14h30" : null,
          hasAllergy: false,
          allergyDetails: null,
          veterinarianContact: null,
          intakeObservations: "Ficha demonstrativa.",
          intakeCompletedAt: new Date().toISOString(),
        })),
      });
      return;
    }

    setClientDetailLoading(true);
    setClientDetailError("");
    setClientDetail(null);
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, email, full_name, phone, address, profession, emergency_contact_name, emergency_contact_phone, onboarding_completed_at, active")
        .eq("id", client.id)
        .eq("role", "client")
        .single();
      if (profileError) throw profileError;

      const { data: petRows, error: petError } = await supabase
        .from("pets")
        .select(`
          id,
          name,
          sex,
          breed,
          approximate_age,
          has_health_condition,
          health_condition_details,
          uses_medication,
          medication_details,
          has_allergy,
          allergy_details,
          veterinarian_contact,
          intake_observations,
          intake_completed_at,
          photo_path
        `)
        .eq("owner_id", client.id)
        .eq("active", true)
        .order("created_at", { ascending: true });
      if (petError) throw petError;

      const pets = await Promise.all((petRows || []).map(async (pet) => {
        let photoUrl: string | undefined;
        if (pet.photo_path) {
          const { data: signedPhoto } = await supabase.storage.from("pet-photos").createSignedUrl(pet.photo_path, 3600);
          photoUrl = signedPhoto?.signedUrl;
        }
        return {
          id: pet.id,
          name: pet.name,
          sex: pet.sex,
          breed: pet.breed,
          approximateAge: pet.approximate_age,
          hasHealthCondition: Boolean(pet.has_health_condition),
          healthConditionDetails: pet.health_condition_details,
          usesMedication: Boolean(pet.uses_medication),
          medicationDetails: pet.medication_details,
          hasAllergy: Boolean(pet.has_allergy),
          allergyDetails: pet.allergy_details,
          veterinarianContact: pet.veterinarian_contact,
          intakeObservations: pet.intake_observations,
          intakeCompletedAt: pet.intake_completed_at,
          photoUrl,
        };
      }));

      setClientDetail({
        id: profile.id,
        name: profile.full_name?.trim() || profile.email?.split("@")[0] || "Nome nao informado",
        email: profile.email || "E-mail nao informado",
        phone: profile.phone || "Telefone nao informado",
        address: profile.address,
        profession: profile.profession,
        emergencyContactName: profile.emergency_contact_name,
        emergencyContactPhone: profile.emergency_contact_phone,
        onboardingCompletedAt: profile.onboarding_completed_at,
        active: Boolean(profile.active),
        pets,
      });
    } catch (error) {
      setClientDetailError(error instanceof Error ? error.message : "Nao foi possivel carregar a ficha do cliente.");
    } finally {
      setClientDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!supabase || !loggedIn || role !== "admin" || page !== "clients") return;

    const refreshClients = () => {
      void loadAdminClients().catch(() => undefined);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshClients();
    };

    refreshClients();
    const intervalId = window.setInterval(refreshClients, 15000);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
    // Refreshing is intentionally scoped to the clients page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, loggedIn, role, page]);

  async function loadRealData(currentRole: Role) {
    if (!supabase) return;
    setDataLoading(true);
    setDataError("");
    if (currentRole !== "client") setClientActiveDiscount(null);

    try {
      if (currentRole === "admin") {
        await loadAdminClients();

        const { error: reminderError } = await supabase.rpc("generate_overdue_payment_reminders");
        if (reminderError && reminderError.code !== "PGRST202") throw reminderError;
      }

      const { data: serviceRows, error: servicesError } = await supabase
        .from("services")
        .select("id, name, description, duration_minutes")
        .eq("active", true)
        .order("name");
      if (servicesError) throw servicesError;
      const mappedServices = (serviceRows || []).map((service) => ({
        id: service.id,
        icon: service.name === "Cat sitting" ? "⌂" : service.name.toLowerCase().includes("med") ? "+" : "◇",
        name: service.name,
        description: service.description || "Cuidado especializado para o seu bichano.",
        durationMinutes: service.duration_minutes,
      }));
      setRealServices(mappedServices);
      setBookingServiceId((current) => current || mappedServices.find((service) => service.name.toLowerCase() === "cat sitting")?.id || "");

      const catSittingServiceId = mappedServices.find((service) => service.name.toLowerCase() === "cat sitting")?.id;
      const { data: standardServiceRows, error: servicePriceError } = await supabase
        .rpc("get_standard_visit_price");
      const standardService = Array.isArray(standardServiceRows) ? standardServiceRows[0] : standardServiceRows;
      let loadedPrice = Number(standardService?.price_cents);
      if (catSittingServiceId) {
        const { data: directPrice, error: directPriceError } = await supabase
          .from("service_prices")
          .select("price_cents")
          .eq("service_id", catSittingServiceId)
          .maybeSingle();
        if (directPriceError && !["42P01", "PGRST205"].includes(directPriceError.code)) throw directPriceError;
        const directLoadedPrice = Number(directPrice?.price_cents);
        if (Number.isFinite(directLoadedPrice) && directLoadedPrice > 0) loadedPrice = directLoadedPrice;
      } else if (servicePriceError && !["42883", "PGRST202"].includes(servicePriceError.code)) {
        throw servicePriceError;
      }
      if (Number.isFinite(loadedPrice) && loadedPrice > 0) {
        setStandardVisitPrice((loadedPrice / 100).toFixed(2).replace(".", ","));
      }

      const appointmentQuery = supabase
        .from("appointments")
        .select(`
          id,
          starts_at,
          ends_at,
          status,
          address,
          client_notes,
          pet:pets!appointments_pet_id_fkey(
            name,
            owner:profiles!pets_owner_id_fkey(full_name)
          ),
          service:services!appointments_service_id_fkey(name),
          sitter:profiles!appointments_assigned_to_fkey(id, full_name)
        `)
        .order("starts_at", { ascending: true });

      const todayStart = startOfLocalDay(new Date());
      const historyStart = new Date(todayStart);
      historyStart.setMonth(historyStart.getMonth() - 6);
      appointmentQuery.gte("starts_at", currentRole === "admin" ? historyStart.toISOString() : new Date().toISOString());

      const { data: appointmentRows, error: appointmentError } = await appointmentQuery.limit(50);
      if (appointmentError) throw appointmentError;

      const mappedAppointments = (appointmentRows || []).map((row) => mapAppointment(row as unknown as Record<string, unknown>));
      setRealAppointments(mappedAppointments);

      if (currentRole === "admin") {
        const { data: waitlistRows, error: waitlistError } = await supabase
          .from("waitlist_requests")
          .select(`
            id,
            requested_starts_at,
            address,
            client_notes,
            status,
            pet:pets!waitlist_requests_pet_id_fkey(
              name,
              owner:profiles!pets_owner_id_fkey(full_name)
            ),
            service:services!waitlist_requests_service_id_fkey(name)
          `)
          .eq("status", "waiting")
          .order("requested_starts_at", { ascending: true })
          .limit(20);
        if (waitlistError && !["42P01", "PGRST205"].includes(waitlistError.code)) throw waitlistError;
        setRealWaitlistRequests((waitlistRows || []).map((row) => mapWaitlistRequest(row as unknown as Record<string, unknown>)));
      } else {
        setRealWaitlistRequests([]);
      }

      if (currentRole === "client" || currentRole === "admin") {
        const { data: petRows, error: petError } = await supabase
          .from("pets")
          .select("id, name, sex, breed, approximate_age, uses_medication, medication_details, owner_id, photo_path")
          .eq("active", true)
          .order("name");
        if (petError) throw petError;
        const petsWithPhotos = await Promise.all((petRows || []).map(async (pet) => {
          let photoUrl: string | undefined;
          if (pet.photo_path) {
            const { data: signedPhoto } = await supabase.storage.from("pet-photos").createSignedUrl(pet.photo_path, 3600);
            photoUrl = signedPhoto?.signedUrl;
          }
          return {
            id: pet.id,
            icon: "●",
            name: pet.name,
            ownerId: pet.owner_id,
            photoUrl,
            sex: pet.sex,
            breed: pet.breed,
            approximateAge: pet.approximate_age,
            medicationDetails: pet.medication_details,
            description: [
              pet.sex === "female" ? "Fêmea" : pet.sex === "male" ? "Macho" : "Sexo não informado",
              pet.breed || "Raça não informada",
              pet.approximate_age || "Idade não informada",
              pet.uses_medication ? `Medicação: ${pet.medication_details || "detalhes não informados"}` : "Sem medicação contínua",
            ].join(" • "),
          };
        }));
        setRealPets(petsWithPhotos);
        setBookingPetIds((current) => current.length ? current : (petRows?.[0]?.id ? [petRows[0].id] : []));
      }

      const { data: paymentRows, error: paymentError } = await supabase
        .from("payments")
        .select(`
          id,
          amount_cents,
          due_date,
          status,
          appointment:appointments!payments_appointment_id_fkey(
            pet:pets!appointments_pet_id_fkey(
              name,
              owner:profiles!pets_owner_id_fkey(full_name)
            ),
            service:services!appointments_service_id_fkey(name)
          )
        `)
        .in("status", ["pending", "overdue"])
        .order("due_date");
      if (paymentError) throw paymentError;
      const mappedPayments = (paymentRows || []).map((row) => mapPayment(row as unknown as Record<string, unknown>));
      setRealPayments(mappedPayments);

      if (currentRole === "client") {
        const { data: preferences, error: preferencesError } = await supabase
          .from("notification_preferences")
          .select("appointments, payments, news")
          .maybeSingle();
        if (preferencesError && !["42P01", "PGRST205"].includes(preferencesError.code)) throw preferencesError;
        if (preferences) setNotificationPreferences(preferences);

        const { error: welcomeCodeError } = await supabase.rpc("my_welcome_code");
        if (welcomeCodeError && !["42883", "PGRST202"].includes(welcomeCodeError.code)) throw welcomeCodeError;

        const { data: activeDiscountRows, error: activeDiscountError } = await supabase.rpc("my_active_discount");
        if (activeDiscountError && !["42883", "PGRST202"].includes(activeDiscountError.code)) throw activeDiscountError;
        const activeDiscount = Array.isArray(activeDiscountRows) ? activeDiscountRows[0] : activeDiscountRows;
        const activeDiscountValue = Number(activeDiscount?.discount_value || 0);
        setClientActiveDiscount(activeDiscount && Number.isFinite(activeDiscountValue) && activeDiscountValue > 0 ? {
          code: String(activeDiscount.discount_code || ""),
          discountValue: activeDiscountValue,
          validUntil: activeDiscount.valid_until || null,
        } : null);

        const { data: notificationRows, error: notificationError } = await supabase
          .from("notifications")
          .select("id, title, body")
          .is("read_at", null)
          .order("created_at", { ascending: false })
          .limit(10);
        if (notificationError) throw notificationError;
        setRealNotifications(notificationRows || []);
      }

      if (currentRole === "admin") {
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        const [
          { count: clientCount },
          { count: petCount },
          { data: staffRows, error: staffError },
          { count: todayCount },
          { count: completedCount },
          { count: requestedCount },
          { count: waitlistCount },
        ] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "client").eq("active", true),
          supabase.from("pets").select("id", { count: "exact", head: true }).eq("active", true),
          supabase.from("profiles").select("id, full_name, phone, role, active").in("role", ["staff", "admin"]).order("full_name"),
          supabase.from("appointments").select("id", { count: "exact", head: true }).neq("status", "cancelled").gte("starts_at", todayStart.toISOString()).lt("starts_at", tomorrowStart.toISOString()),
          supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "completed").gte("starts_at", todayStart.toISOString()).lt("starts_at", tomorrowStart.toISOString()),
          supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "requested"),
          supabase.from("waitlist_requests").select("id", { count: "exact", head: true }).eq("status", "waiting"),
        ]);
        if (staffError) throw staffError;

        const pendingCents = mappedPayments.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.amountCents, 0);
        const overduePayments = mappedPayments.filter((item) => item.status === "overdue");

        setAdminMetrics({
          todayTotal: todayCount || 0,
          todayCompleted: completedCount || 0,
          requested: requestedCount || 0,
          clients: clientCount || 0,
          pets: petCount || 0,
          waitlist: waitlistCount || 0,
          pendingCents,
          overdueCents: overduePayments.reduce((sum, item) => sum + item.amountCents, 0),
          overdueCount: overduePayments.length,
        });
        setRealStaff((staffRows || []).map((person) => ({
          id: person.id,
          name: person.full_name || "Nome não informado",
          phone: person.phone || "Telefone não informado",
          role: person.role as Role,
          active: person.active,
          assignedCount: mappedAppointments.filter((item) => item.sitterId === person.id && item.rawStatus !== "cancelled").length,
        })));
        const { data: codeRows, error: codesError } = await supabase
          .from("discount_codes")
          .select("id, code, discount_type, discount_value, expires_at, max_uses, times_used, active, benefit_months")
          .eq("active", true)
          .order("created_at", { ascending: false })
          .limit(20);
        if (codesError && !["42P01", "PGRST205"].includes(codesError.code)) throw codesError;
        setDiscountCodes((codeRows || []).map((item) => ({
          id: item.id,
          code: item.code,
          discountValue: item.discount_value,
          expiresAt: item.expires_at,
          maxUses: item.max_uses,
          timesUsed: item.times_used,
          active: item.active,
          benefitMonths: item.benefit_months ?? null,
        })));

        const { data: redemptionRows, error: redemptionsError } = await supabase
          .from("discount_redemptions")
          .select("id, valid_until, cancelled_at, code:discount_codes(code), client:profiles!discount_redemptions_client_id_fkey(full_name)")
          .order("redeemed_at", { ascending: false })
          .limit(30);
        if (redemptionsError && !["42P01", "PGRST205"].includes(redemptionsError.code)) throw redemptionsError;
        const mappedRedemptions = (redemptionRows || []).map((item) => ({
          id: item.id,
          code: String(relation(item.code).code || ""),
          clientName: String(relation(item.client).full_name || "Cliente não informado"),
          validUntil: item.valid_until,
          cancelledAt: item.cancelled_at,
        }));
        setDiscountRedemptions(mappedRedemptions);
        setDiscountCodes((current) => current.map((code) => ({
          ...code,
          usedBy: mappedRedemptions
            .filter((redemption) => redemption.code === code.code && !redemption.cancelledAt)
            .map((redemption) => redemption.clientName),
        })));
      }
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Não foi possível carregar os dados.");
    } finally {
      setDataLoading(false);
    }
  }

  async function markPaymentReceived(paymentId: string) {
    if (!supabase || role !== "admin") return;
    setPaymentSavingId(paymentId);
    try {
      const { error } = await supabase
        .from("payments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", paymentId);
      if (error) throw error;

      const { error: notificationError } = await supabase
        .from("notifications")
        .delete()
        .eq("kind", "payment_overdue")
        .eq("related_id", paymentId);
      if (notificationError) throw notificationError;

      setRealPayments((current) => current.filter((payment) => payment.id !== paymentId));
      notify("Pagamento marcado como recebido.");
      void loadRealData("admin");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível atualizar o pagamento.");
    } finally {
      setPaymentSavingId("");
    }
  }

  function clearVisitHistory() {
    if (!visibleVisitHistory.length) return;
    const confirmed = window.confirm("Limpar o historico exibido? As visitas antigas serao preservadas nos registros do app.");
    if (!confirmed) return;

    setClearedHistoryIds((current) => [...new Set([...current, ...visibleVisitHistory.map((appointment) => appointment.id)])]);
    notify("Historico limpo.");
  }

  async function reviewClient(clientId: string, action: "approve" | "delete") {
    if (!supabase || role !== "admin") return;
    setClientSavingId(clientId);
    try {
      const { data, error } = await supabase.rpc("admin_review_client_v2", {
        target_user_id: clientId,
        review_action: action,
      });
      if (error) throw error;

      if (action === "approve") {
        setRealClients((current) => current.map((client) => (
          client.id === clientId ? { ...client, active: true, welcomeCode: data || client.welcomeCode } : client
        )));
        notify(
          data
            ? `Cliente aceito. Código de boas-vindas: ${data}`
            : "Cliente aceito. O acesso ao app foi liberado.",
        );
      } else {
        setRealClients((current) => current.filter((client) => client.id !== clientId));
        setClientDetail(null);
        notify("Cadastro excluído.");
      }
      void loadRealData("admin");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível revisar o cadastro.");
    } finally {
      setClientSavingId("");
    }
  }

  async function recoverLegacyClient() {
    const requestedEmail = legacyClientEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) {
      setClientListError("Informe o e-mail usado no cadastro antigo.");
      return;
    }

    setClientListLoading(true);
    setClientListError("");
    try {
      const { error } = await supabase?.rpc("admin_recover_client_v3", {
        requested_email: requestedEmail,
      }) || { error: new Error("Supabase indisponível.") };
      if (error) throw error;
      setLegacyClientEmail("");
      await loadAdminClients();
      notify("Cadastro antigo recuperado. Agora ele pode ser aprovado.");
    } catch (error) {
      const message = errorMessage(error, "Não foi possível recuperar o cadastro.");
      setClientListError(
        message.includes("admin_recover_client_v3") || (error && typeof error === "object" && "code" in error && error.code === "PGRST202")
          ? "O backend consolidado não está instalado. Execute supabase/reset_and_setup.sql no SQL Editor."
          : message,
      );
    } finally {
      setClientListLoading(false);
    }
  }

  function openAppointment(appointment: AppointmentView) {
    setAppointmentOpen(appointment);
    setManagedStatus(appointment.rawStatus || "requested");
    setManagedStaffId(appointment.sitterId || "");
    setManagedStartsAt(appointment.startsAt ? appointment.startsAt.slice(0, 16) : "");
    setVisitNote("");
  }

  async function requestAppointment(joinWaitlist = false) {
    setBookingError("");
    if (!joinWaitlist) setBookingWaitlistAvailable(false);
    if (!visiblePets.length) {
      setBookingError("Cadastre pelo menos um bichano antes de solicitar uma visita.");
      return;
    }
    if (!bookingServices.length || !selectedBookingService) {
      setBookingError("Nenhum cuidado ativo foi encontrado. Confira os serviços no Supabase.");
      return;
    }
    if (!bookingPetIds.length || !bookingDates.length || !bookingAddress.trim()) {
      setBookingError("Selecione ao menos um bichano e preencha cuidado, data, quantidade de visitas e endereço.");
      return;
    }

    const startsAtOptions = bookingDates.flatMap((item) => bookingStartsAtOptions(item.date, item.visitsPerDay));
    if (!startsAtOptions.length || startsAtOptions.some((startsAt) => !Number.isFinite(startsAt.getTime())) || startsAtOptions.some((startsAt) => startsAt <= new Date())) {
      setBookingError("Escolha uma data futura.");
      return;
    }
    const primaryPetId = bookingPetIds[0];
    const selectedPetNames = bookingPetIds
      .map((petId) => visiblePets.find((pet) => pet.id === petId)?.name)
      .filter(Boolean) as string[];
    const visitsDetails = bookingDates.map((item) => `${formatDate(item.date)}: ${item.visitsPerDay} visita${item.visitsPerDay === "1" ? "" : "s"}`);
    const bookingRequestNotes = [
      selectedPetNames.length ? `Bichanos: ${selectedPetNames.join(", ")}` : "",
      `Dias solicitados: ${visitsDetails.join("; ")}`,
      `Total de visitas/diárias: ${bookingVisitCount}`,
      bookingPetIds.length > 1 ? `Gatos extras: ${bookingPetIds.length - 1}` : "",
      bookingNotes.trim() ? `Observações: ${bookingNotes.trim()}` : "",
    ].filter(Boolean).join("\n");

    setActionBusy(true);
    try {
      if (supabase) {
        if (role === "client") {
          const { error } = await supabase.rpc("request_appointment", {
            requested_pet_id: primaryPetId,
            requested_service_id: selectedBookingService.id,
            requested_starts_at: startsAtOptions[0].toISOString(),
            requested_address: bookingAddress.trim(),
            requested_notes: bookingRequestNotes,
            join_waitlist: joinWaitlist,
            requested_visit_count: bookingVisitCount,
            requested_extra_pet_count: Math.max(bookingPetIds.length - 1, 0),
          });
          if (error) throw error;
        } else if (role === "admin") {
          const { error } = await supabase.from("appointments").insert({
            pet_id: primaryPetId,
            service_id: selectedBookingService.id,
            starts_at: startsAtOptions[0].toISOString(),
            ends_at: new Date(startsAtOptions[0].getTime() + selectedBookingService.durationMinutes * 60000).toISOString(),
            address: bookingAddress.trim(),
            client_notes: bookingRequestNotes,
            visit_count: bookingVisitCount,
            extra_pet_count: Math.max(bookingPetIds.length - 1, 0),
            status: "requested",
          });
          if (error) throw error;
        }
        await loadRealData(role);
      }
      setBookingOpen(false);
      setBookingDates([]);
      setBookingDiscountOpen(false);
      setBookingDiscountCode("");
      setBookingDiscountValueCents(0);
      setBookingNotes("");
      setBookingError("");
      setBookingWaitlistAvailable(false);
      notify(joinWaitlist
        ? "Pedido de encaixe enviado para a administradora."
        : "Pedido de visita enviado.");
    } catch (error) {
      const message = databaseErrorMessage(error, "Não foi possível solicitar o agendamento.");
      setBookingWaitlistAvailable(role === "client" && message.toLowerCase().includes("lotado"));
      setBookingError(message);
    } finally {
      setActionBusy(false);
    }
  }

  async function inviteStaff() {
    if (!inviteName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      notify("Informe o nome e um e-mail válido.");
      return;
    }
    setActionBusy(true);
    try {
      if (supabase) {
        const { data, error } = await supabase.functions.invoke("invite-staff", {
          body: { fullName: inviteName.trim(), email: inviteEmail.trim().toLowerCase() },
        });
        if (error) throw new Error(await functionErrorMessage(error, "Não foi possível enviar o convite."));
        if (data?.error) throw new Error(data.error);
        await loadRealData("admin");
      }
      setInviteName("");
      setInviteEmail("");
      setInviteOpen(false);
      notify("Convite enviado.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível enviar o convite.");
    } finally {
      setActionBusy(false);
    }
  }

  async function toggleStaffAccess(person: StaffView) {
    if (!supabase || person.role === "admin") return;
    setActionBusy(true);
    try {
      const { error } = await supabase.rpc("set_staff_access", {
        target_user_id: person.id,
        access_enabled: !person.active,
      });
      if (error) throw error;
      setRealStaff((current) => current.map((item) => (
        item.id === person.id ? { ...item, active: !item.active } : item
      )));
      notify(person.active ? "Acesso revogado." : "Acesso concedido.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível alterar o acesso.");
    } finally {
      setActionBusy(false);
    }
  }

  function resetPetForm() {
    setPetName("");
    setPetSex("unknown");
    setPetBreed("");
    setPetAge("");
    setPetMedication("");
    setPetPhoto(null);
    setEditingPet(null);
  }

  function openPetForm(pet?: PetView) {
    setEditingPet(pet || null);
    setPetName(pet?.name || "");
    setPetSex(pet?.sex || "unknown");
    setPetBreed(pet?.breed || "");
    setPetAge(pet?.approximateAge || "");
    setPetMedication(pet?.medicationDetails || "");
    setPetPhoto(null);
    setPetOpen(true);
  }

  async function savePet() {
    if (!petName.trim()) {
      notify("Informe o nome do bichano.");
      return;
    }
    setActionBusy(true);
    try {
      if (supabase) {
        const petPayload = {
          name: petName.trim(),
          sex: petSex,
          breed: petBreed.trim() || null,
          approximate_age: petAge.trim() || null,
          uses_medication: Boolean(petMedication.trim()),
          medication_details: petMedication.trim() || null,
          intake_completed_at: new Date().toISOString(),
        };
        const { data: savedPet, error } = editingPet
          ? await supabase.from("pets").update(petPayload).eq("id", editingPet.id).select("id").single()
          : await supabase.from("pets").insert({
              owner_id: profileId,
              ...petPayload,
            }).select("id").single();
        if (error) throw error;
        if (petPhoto && savedPet) {
          if (!petPhoto.type.startsWith("image/") || petPhoto.size > 5 * 1024 * 1024) {
            throw new Error("A foto deve ser uma imagem de até 5 MB.");
          }
          const extension = petPhoto.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
          const photoPath = `${profileId}/${savedPet.id}/${Date.now()}.${extension}`;
          const { error: uploadError } = await supabase.storage.from("pet-photos").upload(photoPath, petPhoto, {
            contentType: petPhoto.type,
            upsert: false,
          });
          if (uploadError) throw uploadError;
          const { error: photoUpdateError } = await supabase.from("pets").update({ photo_path: photoPath }).eq("id", savedPet.id);
          if (photoUpdateError) throw photoUpdateError;
        }
        await loadRealData(role);
      }
      resetPetForm();
      setPetOpen(false);
      notify(editingPet ? "Bichano atualizado." : "Bichano cadastrado.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível salvar o bichano.");
    } finally {
      setActionBusy(false);
    }
  }

  async function deletePet(pet: PetView) {
    if (!supabase) return;
    const confirmed = window.confirm(`Excluir ${pet.name}? Ele sairá da sua lista, mas os agendamentos antigos serão preservados.`);
    if (!confirmed) return;

    setActionBusy(true);
    try {
      const { error } = await supabase.from("pets").update({ active: false }).eq("id", pet.id);
      if (error) throw error;
      await loadRealData(role);
      setBookingPetIds((current) => current.filter((petId) => petId !== pet.id));
      notify("Bichano excluído.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível excluir o bichano.");
    } finally {
      setActionBusy(false);
    }
  }

  async function saveManagedAppointment(
    appointment: AppointmentView,
    requestedStatus: string,
    requestedStaffId: string,
    requestedStartsAt: string,
  ) {
    if (!supabase || role !== "admin") return false;
    setActionBusy(true);
    try {
      const { error } = await supabase.rpc("manage_appointment", {
        target_appointment_id: appointment.id,
        requested_status: requestedStatus,
        requested_assigned_to: requestedStaffId || null,
        requested_starts_at: requestedStartsAt ? new Date(requestedStartsAt).toISOString() : null,
      });
      if (error) throw error;
      await loadRealData("admin");
      return true;
    } catch (error) {
      const message = databaseErrorMessage(error, "Não foi possível atualizar o agendamento.");
      notify(
        message.includes("manage_appointment") || (error && typeof error === "object" && "code" in error && error.code === "PGRST202")
          ? "A aprovação ainda não está instalada no Supabase. Aplique o patch supabase/patches/manage_appointment.sql."
          : message,
      );
      return false;
    } finally {
      setActionBusy(false);
    }
  }

  async function manageAppointment() {
    if (!appointmentOpen) return;
    const updated = await saveManagedAppointment(appointmentOpen, managedStatus, managedStaffId, managedStartsAt);
    if (!updated) return;
    setAppointmentOpen(null);
    notify("Agendamento atualizado.");
  }

  async function approveAppointment(appointment: AppointmentView) {
    if (!managedStaffId) {
      notify("Escolha a babá que irá atender antes de aceitar.");
      return;
    }
    const reviewed = await reviewAppointmentRequest(appointment, "approve", managedStaffId);
    if (!reviewed) return;
    setAppointmentOpen(null);
    notify("Visita aceita e enviada para a agenda da babá.");
  }

  async function rejectAppointment(appointment: AppointmentView) {
    const confirmed = window.confirm(`Recusar a solicitação de ${appointment.pet}? O cliente será avisado.`);
    if (!confirmed) return;
    const reviewed = await reviewAppointmentRequest(appointment, "reject", null);
    if (!reviewed) return;
    setAppointmentOpen(null);
    notify("Visita recusada e cliente avisado.");
  }

  async function reviewAppointmentRequest(appointment: AppointmentView, reviewAction: "approve" | "reject", staffId: string | null) {
    if (!supabase || role !== "admin") return false;
    setActionBusy(true);
    try {
      const { error } = await supabase.rpc("review_appointment_request", {
        target_appointment_id: appointment.id,
        review_action: reviewAction,
        requested_assigned_to: staffId,
      });
      if (error) throw error;
      await loadRealData("admin");
      return true;
    } catch (error) {
      const message = databaseErrorMessage(error, "Não foi possível revisar a solicitação.");
      notify(
        message.includes("review_appointment_request") || (error && typeof error === "object" && "code" in error && error.code === "PGRST202")
          ? "A revisão de solicitações ainda não está instalada no Supabase. Aplique o patch supabase/patches/review_appointment_request.sql."
          : message,
      );
      return false;
    } finally {
      setActionBusy(false);
    }
  }

  async function cancelMyAppointment(appointment: AppointmentView) {
    setActionBusy(true);
    try {
      if (supabase) {
        const { error } = await supabase.rpc("cancel_my_appointment", {
          target_appointment_id: appointment.id,
        });
        if (error) throw error;
        await loadRealData(role);
      }
      setCancelAppointmentOpen(null);
      setAppointmentOpen(null);
      notify("Visita cancelada.");
    } catch (error) {
      const message = databaseErrorMessage(error, "Não foi possível cancelar a visita.");
      notify(
        message.includes("cancel_my_appointment") || (error && typeof error === "object" && "code" in error && error.code === "PGRST202")
          ? "O cancelamento pelo cliente ainda não está instalado no Supabase. Aplique o patch supabase/patches/cancel_my_appointment.sql."
          : message,
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function reviewWaitlistRequest(request: WaitlistRequestView, action: "approve" | "reject") {
    if (!supabase || role !== "admin") return;
    setActionBusy(true);
    try {
      const { error } = await supabase.rpc("manage_waitlist_request", {
        target_waitlist_id: request.id,
        review_action: action,
        requested_assigned_to: null,
        requested_starts_at: request.requestedStartsAt,
      });
      if (error) throw error;
      await loadRealData("admin");
      notify(action === "approve" ? "Encaixe confirmado." : "Pedido de encaixe recusado.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível revisar o pedido de encaixe.");
    } finally {
      setActionBusy(false);
    }
  }

  async function recordVisit(completeVisit: boolean) {
    if (!supabase || !appointmentOpen || !visitNote.trim()) {
      notify("Escreva o relatório da visita.");
      return;
    }
    setActionBusy(true);
    try {
      const { error } = await supabase.rpc("record_visit", {
        target_appointment_id: appointmentOpen.id,
        visit_note: visitNote.trim(),
        complete_visit: completeVisit,
      });
      if (error) throw error;
      await loadRealData(role);
      setAppointmentOpen(null);
      notify(completeVisit ? "Visita concluída e relatório enviado." : "Relatório salvo.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível salvar o relatório.");
    } finally {
      setActionBusy(false);
    }
  }

  async function saveNotificationPreferences() {
    setActionBusy(true);
    try {
      if (supabase) {
        const { error } = await supabase.from("notification_preferences").upsert({
          user_id: profileId,
          ...notificationPreferences,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      setProfilePanel(null);
      notify("Preferências de notificação salvas.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível salvar as preferências.");
    } finally {
      setActionBusy(false);
    }
  }

  async function markNotificationRead(notificationId: string) {
    if (!supabase) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId);
    if (error) {
      notify(error.message);
      return;
    }
    setRealNotifications((current) => current.filter((item) => item.id !== notificationId));
  }

  async function sendPasswordRecovery() {
    if (!supabase || !email.trim()) {
      setLoginError("Informe seu e-mail primeiro.");
      return;
    }
    setLoading(true);
    setLoginError("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      window.localStorage.setItem("bichano-password-recovery", "true");
      setSignupSuccess("Enviamos um link para redefinir sua senha.");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Não foi possível enviar o link.");
    } finally {
      setLoading(false);
    }
  }

  async function updatePassword() {
    if (!supabase || newPassword.length < 8) {
      setMfaError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    setActionBusy(true);
    setMfaError("");
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      notify("Senha atualizada.");
    } catch (error) {
      setMfaError(error instanceof Error ? error.message : "Não foi possível atualizar a senha.");
    } finally {
      setActionBusy(false);
    }
  }

  function parseCurrencyToCents(value: string) {
    const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
    return Math.round(Number(normalized) * 100);
  }

  function formatCurrencyInput(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 12);
    if (!digits) return "";
    return new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(digits) / 100);
  }

  function databaseErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
      return error.message;
    }
    return fallback;
  }

  async function functionErrorMessage(error: unknown, fallback: string) {
    if (error && typeof error === "object" && "context" in error && error.context instanceof Response) {
      try {
        const body = await error.context.json() as { error?: unknown };
        if (typeof body.error === "string" && body.error.trim()) return body.error;
      } catch {
        // The response may not contain JSON when the function is unreachable.
      }
    }
    const message = databaseErrorMessage(error, fallback);
    if (message.toLowerCase().includes("failed to send a request to the edge function")) {
      return "Não foi possível conectar à Edge Function. Publique invite-staff e confira ALLOWED_ORIGINS e SUPABASE_SERVICE_ROLE_KEY no Supabase.";
    }
    return message;
  }

  async function saveStandardVisitPrice() {
    if (role !== "admin") {
      setPricingOpen(false);
      return;
    }
    const priceCents = parseCurrencyToCents(standardVisitPrice);
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      notify("Informe um valor de visita válido.");
      return;
    }
    if (!supabase) {
      notify("Valor padrão salvo no modo demonstrativo.");
      return;
    }

    setPricingSaving(true);
    try {
      const { data, error } = await supabase.rpc("set_standard_visit_price", {
        requested_price_cents: priceCents,
      });
      if (error) throw error;
      const savedPrice = Number(data);
      if (!Number.isFinite(savedPrice) || savedPrice !== priceCents) {
        throw new Error("O banco não confirmou o novo valor.");
      }
      setStandardVisitPrice((savedPrice / 100).toFixed(2).replace(".", ","));
      notify("Valor padrão da visita atualizado.");
      await loadRealData("admin");
    } catch (error) {
      notify(databaseErrorMessage(error, "Não foi possível salvar o valor."));
    } finally {
      setPricingSaving(false);
    }
  }

  function createDynamicCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const values = new Uint32Array(6);
    window.crypto.getRandomValues(values);
    return `BQA-${Array.from(values, (value) => alphabet[value % alphabet.length]).join("")}`;
  }

  async function generateDiscountCode() {
    const discountCents = parseCurrencyToCents(discountValue);
    const maxUses = discountMaxUses ? Number(discountMaxUses) : null;
    if (!Number.isFinite(discountCents) || discountCents <= 0) {
      notify("Informe um valor de desconto válido.");
      return;
    }
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses <= 0)) {
      notify("O limite de usos precisa ser um número inteiro positivo.");
      return;
    }
    const code = createDynamicCode();
    const item: DiscountCodeView = {
      id: code,
      code,
      discountValue: discountCents,
      expiresAt: discountExpiresAt ? new Date(`${discountExpiresAt}T23:59:59`).toISOString() : null,
      maxUses,
      timesUsed: 0,
      active: true,
      benefitMonths: null,
    };

    setPricingSaving(true);
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from("discount_codes")
          .insert({
            code,
            discount_type: "fixed",
            discount_value: item.discountValue,
            expires_at: item.expiresAt,
            max_uses: item.maxUses,
            benefit_months: null,
          })
          .select("id")
          .single();
        if (error) throw error;
        item.id = data.id;
      }
      setDiscountCodes((current) => [item, ...current]);
      notify(`Código ${code} criado.`);
    } catch (error) {
      const message = databaseErrorMessage(error, "Não foi possível criar o código.");
      notify(
        message.toLowerCase().includes("benefit_months") || message.toLowerCase().includes("violates not-null")
          ? "Atualize o Supabase com supabase/patches/permanent_discount_benefits.sql para criar cupons permanentes."
          : message,
      );
    } finally {
      setPricingSaving(false);
    }
  }

  async function copyDiscountCode(code: string) {
    try {
      const copied = copyTextWithSelection(code);
      if (!copied) await navigator.clipboard.writeText(code);
      notify(`Código ${code} copiado.`);
    } catch {
      notify(`Código: ${code}`);
    }
  }

  async function deleteDiscountCode(code: DiscountCodeView) {
    setPricingSaving(true);
    try {
      if (supabase) {
        const response = await supabase.from("discount_codes").update({ active: false }).eq("id", code.id);
        if (response.error) throw response.error;
      }
      setDiscountCodes((current) => current.filter((item) => item.id !== code.id));
      setDiscountDeleteOpen(null);
      notify("Cupom excluído.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível excluir o cupom.");
    } finally {
      setPricingSaving(false);
    }
  }

  async function activateDiscountCode() {
    const code = bookingDiscountCode.trim().toUpperCase();
    if (!code) return;
    if (!supabase) {
      setBookingDiscountCode("");
      notify("Desconto ativo por tempo indeterminado no modo demonstrativo.");
      return;
    }

    setDiscountActivating(true);
    try {
      const { data, error } = await supabase.rpc("activate_discount_code", { requested_code: code });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.activated) throw new Error(result?.message || "Não foi possível ativar o código.");
      const activatedDiscount = Number(result.discount_value || 0);
      setBookingDiscountValueCents(Number.isFinite(activatedDiscount) && activatedDiscount > 0 ? activatedDiscount : 0);
      setClientActiveDiscount(Number.isFinite(activatedDiscount) && activatedDiscount > 0 ? {
        code,
        discountValue: activatedDiscount,
        validUntil: result.valid_until || null,
      } : null);
      setBookingDiscountCode("");
      notify(result.valid_until ? `Desconto ativo até ${formatDate(String(result.valid_until).slice(0, 10))}.` : "Desconto ativo por tempo indeterminado.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível ativar o código.");
    } finally {
      setDiscountActivating(false);
    }
  }

  async function cancelDiscountRedemption(redemptionId: string) {
    setPricingSaving(true);
    try {
      if (supabase) {
        const { error } = await supabase
          .from("discount_redemptions")
          .update({ cancelled_at: new Date().toISOString(), cancelled_by: profileId })
          .eq("id", redemptionId);
        if (error) throw error;
      }
      setDiscountRedemptions((current) => current.map((item) => (
        item.id === redemptionId ? { ...item, cancelledAt: new Date().toISOString() } : item
      )));
      const cancelledRedemption = discountRedemptions.find((item) => item.id === redemptionId);
      if (cancelledRedemption) {
        setDiscountCodes((current) => current.map((code) => (
          code.code === cancelledRedemption.code
            ? { ...code, usedBy: (code.usedBy || []).filter((name) => name !== cancelledRedemption.clientName) }
            : code
        )));
      }
      notify("Benefício cancelado.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível cancelar o benefício.");
    } finally {
      setPricingSaving(false);
    }
  }

  async function signup(event: FormEvent) {
    event.preventDefault();
    setSignupError("");
    setSignupSuccess("");

    if (!signupName.trim() || !signupEmail.trim() || signupPassword.length < 6) {
      setSignupError("Informe nome, e-mail e uma senha com pelo menos 6 caracteres.");
      return;
    }
    if (!supabase) {
      setSignupOpen(false);
      setRole("client");
      setLoggedIn(true);
      setOnboardingRequired(true);
      notify("Cadastro demonstrativo criado.");
      return;
    }

    setLoading(true);
    try {
      const signupRequest = supabase.auth.signUp({
        email: signupEmail.trim().toLowerCase(),
        password: signupPassword,
        options: {
          data: { full_name: signupName.trim() },
          emailRedirectTo: window.location.origin,
        },
      });
      const { data, error } = await Promise.race([
        signupRequest,
        new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new Error("O cadastro demorou para responder. Tente novamente.")),
            15000,
          );
        }),
      ]);
      if (error) {
        setSignupError(
          error.message.toLowerCase().includes("already")
            ? "Este e-mail já possui cadastro."
            : `Não foi possível cadastrar: ${error.message}`,
        );
        return;
      }
      if (!data.user || data.user.identities?.length === 0) {
        setSignupError("Este e-mail já possui cadastro.");
        return;
      }

      setSignupOpen(false);
      setEmail(signupEmail.trim().toLowerCase());
      setSignupName("");
      setSignupEmail("");
      setSignupPassword("");

      if (data.session) await supabase.auth.signOut();
      setSignupSuccess(
        data.session
          ? "Cadastro enviado. Aguarde a aprovação da administradora para entrar."
          : `Enviamos um e-mail de confirmação para ${signupEmail.trim().toLowerCase()}. Confirme o endereço e depois aguarde a aprovação da administradora.`,
      );
    } catch (error) {
      setSignupError(
        error instanceof Error
          ? error.message
          : "Não foi possível conectar ao serviço de cadastro.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function completeIntake(data: IntakeData) {
    if (!supabase) {
      setOnboardingRequired(false);
      notify("Ficha demonstrativa salva com sucesso.");
      return;
    }

    const { error } = await supabase.rpc("complete_client_intake", {
      tutor_full_name: data.tutorName,
      tutor_phone: data.tutorPhone,
      tutor_address: data.tutorAddress,
      tutor_profession: data.tutorProfession,
      emergency_name: data.emergencyName,
      emergency_phone: data.emergencyPhone,
      pet_name: data.petName,
      pet_sex: data.petSex,
      pet_breed: data.petBreed,
      pet_age: data.petAge,
      health_condition: data.hasHealthCondition,
      health_details: data.healthDetails,
      medication_use: data.usesMedication,
      medication_details: data.medicationDetails,
      allergy: data.hasAllergy,
      allergy_details: data.allergyDetails,
      veterinarian: data.veterinarian,
      observations: data.observations,
    });

    if (error) throw error;
    setOnboardingRequired(false);
    notify("Ficha de atendimento concluída.");
  }

  const navItems: Record<Role, { page: Page; icon: string; label: string }[]> = {
    client: [
      { page: "home", icon: "⌂", label: "Início" },
      { page: "services", icon: "♡", label: "Cuidados" },
      { page: "pets", icon: "●", label: "Bichanos" },
      { page: "calendar", icon: "□", label: "Agenda" },
    ],
    admin: [
      { page: "admin", icon: "⌂", label: "Painel" },
      { page: "clients", icon: "♙", label: "Clientes" },
      { page: "history", icon: "▤", label: "Histórico" },
      { page: "staffHome", icon: "♡", label: "Minha agenda" },
      { page: "staffAccess", icon: "♙", label: "Babás" },
      { page: "calendar", icon: "□", label: "Agenda" },
    ],
    staff: [
      { page: "staffHome", icon: "⌂", label: "Minha agenda" },
      { page: "profile", icon: "♙", label: "Minha conta" },
    ],
  };

  if (sessionChecking) {
    return (
      <main className={styles.phoneShell}>
        <section className={styles.authLoading}>
          <LogoAnimation />
          <strong>Verificando sua sessão...</strong>
        </section>
      </main>
    );
  }

  if (mfaMode) {
    const qrCodeSource = normalizeQrCodeSource(mfaQrCode);

    return (
      <main className={styles.phoneShell}>
        <section className={styles.mfaScreen}>
          <Image src="/BichanoQueAmoLogo.svg" alt="Bichano que Amo" width={82} height={76} priority />
          <span className={styles.securityBadge}>Verificação em duas etapas</span>
          <h1>{mfaMode === "enroll" ? "Proteja sua conta" : "Confirme que é você"}</h1>
          <p>
            {mfaMode === "enroll"
              ? "Escaneie o QR Code em um aplicativo autenticador e informe o código gerado."
              : "Abra seu aplicativo autenticador e informe o código de seis dígitos."}
          </p>

          {mfaMode === "enroll" && (
            <div className={styles.qrCard}>
              <Image src={qrCodeSource} alt="QR Code para configurar o aplicativo autenticador" width={210} height={210} unoptimized />
              <small>Não consegue escanear? Digite esta chave no aplicativo:</small>
              <code>{mfaSecret}</code>
            </div>
          )}

          <form onSubmit={verifyMfa}>
            <label className={styles.field}>
              <span>Código de segurança</span>
              <input
                autoComplete="one-time-code"
                autoFocus
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="000000"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>
            <button className={styles.primaryButton} disabled={mfaBusy} type="submit">
              {mfaBusy ? "Verificando..." : mfaMode === "enroll" ? "Ativar e entrar" : "Confirmar entrada"}
            </button>
            <button className={styles.textButton} type="button" onClick={() => void cancelMfa()}>
              {loggedIn && pendingAccess?.profile.role === "client" ? "Agora não" : "Voltar para o login"}
            </button>
            {mfaError && <p className={styles.loginError}>{mfaError}</p>}
          </form>
        </section>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className={styles.phoneShell}>
        <section className={styles.login}>
          <LogoAnimation />
          <h1>Que bom ter você por aqui.</h1>
          <p>Acompanhe a rotina, os cuidados e os momentos especiais do seu bichano.</p>

          <form onSubmit={login}>
            <label className={styles.field}>
              <span>E-mail</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Senha</span>
              <PasswordInput
                autoComplete="current-password"
                value={password}
                visible={showPassword}
                onChange={setPassword}
                onToggle={() => setShowPassword((current) => !current)}
              />
            </label>
            <label className={styles.rememberRow}>
              <input type="checkbox" checked={rememberSession} onChange={(event) => setRememberSession(event.target.checked)} />
              <span>Continuar conectado neste aparelho</span>
            </label>
            <button className={styles.primaryButton} disabled={loading} type="submit">
              {loading ? "Entrando..." : "Entrar →"}
            </button>
            {supabase && <button className={styles.textButton} disabled={loading} type="button" onClick={() => void sendPasswordRecovery()}>
              Esqueci minha senha
            </button>}
            <button className={styles.signupButton} type="button" onClick={() => setSignupOpen(true)}>
              Cadastrar
            </button>
            {loginError && <p className={styles.loginError}>{loginError}</p>}
            {signupSuccess && <p className={styles.signupSuccess}>{signupSuccess}</p>}
          </form>

          {!supabase && <div className={styles.demoRoles}>
            {(["client", "admin", "staff"] as Role[]).map((item) => (
              <button
                className={role === item ? styles.demoRoleActive : ""}
                key={item}
                onClick={() => selectDemoRole(item)}
                type="button"
              >
                {item === "client" ? "Cliente" : item === "admin" ? "Admin" : "Babá"}
              </button>
            ))}
          </div>}
        </section>
        {signupOpen && (
          <Modal
            title="Criar cadastro"
            description="Após o cadastro, enviaremos um e-mail de confirmação. O acesso será liberado depois da aprovação da administradora."
            onClose={() => setSignupOpen(false)}
          >
            <form onSubmit={signup}>
              <label className={styles.field}>
                <span>Nome completo</span>
                <input value={signupName} onChange={(event) => setSignupName(event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>E-mail</span>
                <input type="email" value={signupEmail} onChange={(event) => setSignupEmail(event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Senha</span>
                <PasswordInput
                  autoComplete="new-password"
                  value={signupPassword}
                  visible={showSignupPassword}
                  onChange={setSignupPassword}
                  onToggle={() => setShowSignupPassword((current) => !current)}
                />
              </label>
              <p className={styles.accountRoleHint}>Novos cadastros entram como clientes. O administrador geral é definido com segurança no Supabase.</p>
              <button className={styles.primaryButton} disabled={loading} type="submit">
                {loading ? "Criando..." : "Criar conta"}
              </button>
              {signupError && <p className={styles.loginError}>{signupError}</p>}
            </form>
          </Modal>
        )}
        <Toast message={toast} />
      </main>
    );
  }

  if (role === "client" && onboardingRequired) {
    return (
      <main className={styles.phoneShell}>
        <ClientIntake email={email} onSubmit={completeIntake} onLogout={logout} />
        <Toast message={toast} />
      </main>
    );
  }

  return (
    <main className={styles.phoneShell}>
      <div className={styles.appScroll}>
        <header className={styles.topbar}>
          <div>
            <span>Bichano que Amo</span>
            <h2>Olá, {firstName}!</h2>
          </div>
          <button className={styles.avatar} onClick={() => setPage("profile")}>
            {profileInitials}
          </button>
        </header>

        {page === "home" && (
          <section className={styles.page}>
            <article className={styles.hero}>
              <span className={styles.pill}>{nextAppointment ? nextAppointment.status : "Agenda livre"}</span>
              <h1>{nextAppointment ? `${nextAppointment.pet} • ${nextAppointment.service}` : "Nenhuma visita agendada."}</h1>
              <p>{nextAppointment ? `${nextAppointment.date}, às ${nextAppointment.time}.` : "Quando uma visita for confirmada, os detalhes aparecerão aqui."}</p>
              <span className={styles.heroCat}>◕</span>
            </article>
            <div className={styles.quickGrid}>
              <QuickAction icon="+" label="Agendar" onClick={openBooking} />
              <QuickAction icon="●" label="Meus gatos" onClick={() => setPage("pets")} />
              <QuickAction icon="♡" label="Visitas" onClick={() => setPage("calendar")} />
            </div>
            <SectionTitle title="Próxima visita" action="Ver agenda" onClick={() => setPage("calendar")} />
            {nextAppointment ? <AppointmentCard appointment={nextAppointment} onClick={() => openAppointment(nextAppointment)} /> : <EmptyState text="Nenhuma visita futura cadastrada." />}
            {nextPayment && <article className={styles.paymentCard}>
              <span className={styles.paymentIcon}>R$</span>
              <span>
                <strong>{nextPayment.status === "overdue" ? "Pagamento em atraso" : "Pagamento pendente"}</strong>
                <small>{nextPayment.service} de {nextPayment.pet} • vence em {formatDate(nextPayment.dueDate)}</small>
              </span>
              <button onClick={() => notify("O pagamento é feito diretamente com a Bichano que Amo. O app apenas acompanha o vencimento.")}>Ver detalhes</button>
            </article>}
            {realNotifications.length > 0 && <>
              <SectionTitle title="Avisos" />
              <div className={styles.list}>
                {realNotifications.map((notification) => (
                  <article className={styles.paymentCard} key={notification.id}>
                    <span className={styles.paymentIcon}>!</span>
                    <span>
                      <strong>{notification.title}</strong>
                      <small>{notification.body}</small>
                    </span>
                    <button onClick={() => void markNotificationRead(notification.id)}>Lido</button>
                  </article>
                ))}
              </div>
            </>}
          </section>
        )}

        {page === "services" && (
          <Page title="Cuidados" intro="O valor é combinado individualmente com cada cliente antes do atendimento.">
            <div className={styles.list}>
              {visibleServices.map((service) => (
                <button className={styles.serviceCard} key={service.name} onClick={openBooking}>
                  <span className={styles.cardIcon}>{service.icon}</span>
                  <span>
                    <strong>{service.name}</strong>
                    <small>{service.description}</small>
                  </span>
                  <b>Valor combinado</b>
                </button>
              ))}
            </div>
          </Page>
        )}

        {page === "pets" && (
          <Page title="Meus bichanos" intro="Consulte saúde, rotina, medicação e contatos veterinários cadastrados.">
            <div className={styles.list}>
              {visiblePets.map((pet) => (
                <article className={styles.petCard} key={pet.id}>
                  <span className={styles.petPhoto} style={pet.photoUrl ? { backgroundImage: `url("${pet.photoUrl}")` } : undefined}>{pet.photoUrl ? "" : pet.icon}</span>
                  <span>
                    <strong>{pet.name}</strong>
                    <small>{pet.description}</small>
                  </span>
                  {supabase ? (
                    <div className={styles.petActions}>
                      <button disabled={actionBusy} onClick={() => openPetForm(pet)}>Editar</button>
                      <button className={styles.deletePet} disabled={actionBusy} onClick={() => void deletePet(pet)}>Excluir</button>
                    </div>
                  ) : <b>›</b>}
                </article>
              ))}
              {supabase && visiblePets.length === 0 && <EmptyState text="Nenhum bichano cadastrado." />}
              <button className={styles.dashedButton} onClick={() => openPetForm()}>
                + Adicionar bichano
              </button>
            </div>
          </Page>
        )}

        {page === "calendar" && (
          <Page title="Agenda" intro="Horários exibidos no fuso de Brasília.">
            <Calendar
              appointments={approvedAppointments}
              selectedDateKey={selectedCalendarDateKey}
              onSelectDate={setSelectedCalendarDateKey}
            />
            <SectionTitle
              title={selectedCalendarDateKey ? `Visitas confirmadas em ${formatDate(selectedCalendarDateKey)}` : "Atendimentos cadastrados"}
              action={selectedCalendarDateKey ? "Ver todos" : undefined}
              onClick={() => setSelectedCalendarDateKey("")}
            />
            <div className={styles.list}>
              {selectedCalendarAppointments.length ? selectedCalendarAppointments.map((item) => <AppointmentCard appointment={item} key={item.id} onClick={() => openAppointment(item)} />) : <EmptyState text={selectedCalendarDateKey ? "Nenhuma visita confirmada neste dia." : "Nenhum atendimento cadastrado."} />}
            </div>
          </Page>
        )}

        {page === "admin" && (
          <section className={styles.page}>
            <article className={`${styles.hero} ${styles.adminHero}`}>
              <span className={styles.pill}>Hoje, {todayLabel}</span>
              <h1>{adminMetrics.todayTotal ? `${adminMetrics.todayTotal} visita${adminMetrics.todayTotal === 1 ? "" : "s"} na agenda.` : "Nenhuma visita hoje."}</h1>
              <p>{adminMetrics.todayCompleted} concluída{adminMetrics.todayCompleted === 1 ? "" : "s"} • {Math.max(adminMetrics.todayTotal - adminMetrics.todayCompleted, 0)} restante{Math.max(adminMetrics.todayTotal - adminMetrics.todayCompleted, 0) === 1 ? "" : "s"} • {adminMetrics.requested} solicitação{adminMetrics.requested === 1 ? "" : "ões"} • {adminMetrics.waitlist} encaixe{adminMetrics.waitlist === 1 ? "" : "s"}.</p>
            </article>
            {dataLoading && <EmptyState text="Carregando dados do Supabase..." />}
            {dataError && <p className={styles.formError}>{dataError}</p>}
            <div className={styles.statsGrid}>
              <Stat label={`Visitas em ${todayLabel}`} value={String(adminMetrics.todayTotal)} note={`${adminMetrics.todayCompleted} concluídas • ${Math.max(adminMetrics.todayTotal - adminMetrics.todayCompleted, 0)} restantes`} />
              <Stat label="Solicitações" value={String(adminMetrics.requested)} note="Com status solicitado" />
              <Stat label="Encaixes" value={String(adminMetrics.waitlist)} note="Lista de espera pendente" />
              <Stat label="Bichanos ativos" value={String(adminMetrics.pets)} note="Cadastros ativos no banco" />
            </div>
            {pendingClients.length > 0 && <article className={styles.pendingApprovalCard}>
              <span>
                <strong>{pendingClients.length} cliente{pendingClients.length === 1 ? "" : "s"} aguardando aprovação</strong>
                <small>Revise os novos cadastros para liberar o acesso.</small>
              </span>
              <button onClick={() => setPage("clients")}>Revisar</button>
            </article>}
            <article className={styles.financeCard}>
              <SectionTitle title="Controle de pagamentos" action="Ver pendências" onClick={() => setPage("payments")} />
              <div>
                <span><small>Valores aguardando confirmação</small><strong>{formatMoney(adminMetrics.pendingCents)}</strong></span>
                <span><small>{adminMetrics.overdueCount} vencida{adminMetrics.overdueCount === 1 ? "" : "s"}</small><strong>{formatMoney(adminMetrics.overdueCents)}</strong></span>
              </div>
            </article>
            <article className={styles.pricingCard}>
              <span>
                <small>Valor padrão da visita</small>
                <strong>{standardVisitPrice ? `R$ ${standardVisitPrice}` : "Não definido"}</strong>
                <em>{discountCodes.filter((item) => item.active).length} código{discountCodes.filter((item) => item.active).length === 1 ? "" : "s"} de desconto ativo{discountCodes.filter((item) => item.active).length === 1 ? "" : "s"}</em>
              </span>
              <button onClick={() => setPricingOpen(true)}>Configurar</button>
            </article>
            <SectionTitle title="Pedidos de encaixe" />
            <div className={styles.list}>
              {realWaitlistRequests.length ? realWaitlistRequests.map((item) => (
                <WaitlistCard
                  key={item.id}
                  request={item}
                  saving={actionBusy}
                  onApprove={() => void reviewWaitlistRequest(item, "approve")}
                  onReject={() => void reviewWaitlistRequest(item, "reject")}
                />
              )) : <EmptyState text="Nenhum pedido de encaixe aguardando." />}
            </div>
            <SectionTitle title="Solicitações de visitas" action="Ver agenda" onClick={() => setPage("calendar")} />
            <div className={styles.list}>
              {requestedAppointments.length ? requestedAppointments.map((item) => (
                <RequestedAppointmentCard
                  appointment={item}
                  key={item.id}
                  saving={actionBusy}
                  onReview={() => openAppointment(item)}
                />
              )) : <EmptyState text="Nenhuma visita aguardando aprovação." />}
            </div>
            <SectionTitle title="Próximas visitas aprovadas" action="Ver agenda" onClick={() => setPage("calendar")} />
            <div className={styles.list}>{approvedAppointments.length ? approvedAppointments.slice(0, 5).map((item) => <AppointmentCard appointment={item} key={item.id} onClick={() => openAppointment(item)} />) : <EmptyState text="Nenhuma visita aprovada cadastrada." />}</div>
          </section>
        )}

        {page === "payments" && (
          <Page title="Controle de pagamentos" intro="O pagamento acontece fora do app. Registre aqui quando o valor combinado for recebido.">
            <div className={styles.list}>
              {realPayments.length ? realPayments.map((payment) => (
                <article className={styles.paymentCard} key={payment.id}>
                  <span className={styles.paymentIcon}>R$</span>
                  <span>
                    <strong>{payment.tutor} • {formatMoney(payment.amountCents)}</strong>
                    <small>{payment.service} de {payment.pet}</small>
                    <small>Data combinada: {formatDate(payment.dueDate)} • {payment.status === "overdue" ? "Em atraso" : "Aguardando confirmação"}</small>
                  </span>
                  <button disabled={paymentSavingId === payment.id} onClick={() => markPaymentReceived(payment.id)}>
                    {paymentSavingId === payment.id ? "Salvando..." : "Recebido"}
                  </button>
                </article>
              )) : <EmptyState text="Nenhum pagamento pendente." />}
            </div>
          </Page>
        )}

        {page === "clients" && (
          <Page title="Clientes cadastrados" intro="Aceite novos cadastros ou exclua solicitações que não devem ter acesso ao app.">
            <div className={styles.clientListToolbar}>
              <span>
                <strong>{realClients.length} cadastro{realClients.length === 1 ? "" : "s"}</strong>
                <small>{clientListCheckedAt ? `Última consulta: ${clientListCheckedAt}` : "Ainda não consultado"}</small>
              </span>
              <button disabled={clientListLoading} onClick={() => void loadAdminClients().catch(() => undefined)}>
                {clientListLoading ? "Consultando..." : "Atualizar"}
              </button>
            </div>
            <div className={styles.legacyClientRecovery}>
              <label className={styles.field}>
                <span>Cadastro antigo não apareceu?</span>
                <input type="email" value={legacyClientEmail} onChange={(event) => setLegacyClientEmail(event.target.value)} placeholder="email usado no cadastro" />
              </label>
              <button disabled={clientListLoading || !legacyClientEmail.trim()} onClick={() => void recoverLegacyClient()}>
                Recuperar cadastro
              </button>
            </div>
            {clientListLoading && <EmptyState text="Atualizando clientes..." />}
            {clientListError && <p className={styles.formError}>{clientListError}</p>}
            <div className={styles.list}>
              {realClients.length ? realClients.map((client) => (
                <ClientCard
                  key={client.id}
                  client={client}
                  saving={clientSavingId === client.id}
                  onOpen={() => void openClientDetail(client)}
                  onApprove={() => reviewClient(client.id, "approve")}
                />
              )) : !clientListLoading && !clientListError && <EmptyState text="O Supabase Auth retornou zero clientes. Se o cadastro acabou de ser feito, confirme se ele aparece em Authentication > Users no mesmo projeto." />}
            </div>
          </Page>
        )}

        {page === "history" && (
          <Page title="Histórico de visitas" intro="Visitas concluídas e canceladas ficam aqui, fora do painel atual.">
            {visibleVisitHistory.length > 0 && (
              <button className={styles.clearHistoryButton} onClick={clearVisitHistory} type="button">
                Limpar historico
              </button>
            )}
            <div className={styles.list}>{visibleVisitHistory.length ? visibleVisitHistory.map((item) => <AppointmentCard appointment={item} key={item.id} onClick={() => openAppointment(item)} />) : <EmptyState text="Nenhuma visita no histórico." />}</div>
          </Page>
        )}

        {page === "staffAccess" && (
          <Page title="Acesso das babás" intro="Cada profissional acessa somente os atendimentos atribuídos à própria conta.">
            <div className={styles.list}>
              {supabase
                ? realStaff.length
                  ? realStaff.map((person) => <StaffCard key={person.id} name={person.name} detail={`${person.role === "admin" ? "ADM e babá • " : ""}${person.phone} • ${person.assignedCount} visita${person.assignedCount === 1 ? "" : "s"} atribuída${person.assignedCount === 1 ? "" : "s"}`} active={person.active} locked={person.role === "admin" || actionBusy} onAction={() => void toggleStaffAccess(person)} />)
                  : <EmptyState text="Nenhuma babá cadastrada." />
                : <>
                  <StaffCard name="Bárbara Alves" detail="3 visitas atribuídas" active onAction={() => notify("Acesso demonstrativo revogado.")} />
                  <StaffCard name="Letícia Souza" detail="Nenhuma visita atribuída" onAction={() => notify("Acesso demonstrativo concedido.")} />
                </>}
              <button className={styles.dashedButton} onClick={() => setInviteOpen(true)}>+ Convidar nova babá</button>
            </div>
          </Page>
        )}

        {page === "staffHome" && (
          <section className={styles.page}>
            <article className={`${styles.hero} ${styles.staffHero}`}>
              <span className={styles.pill}>Minha agenda</span>
              <h1>{myAppointments.length ? `${myAppointments.length} atendimento${myAppointments.length === 1 ? "" : "s"} atribuído${myAppointments.length === 1 ? "" : "s"}.` : "Nenhum atendimento atribuído."}</h1>
              <p>Somente visitas vinculadas à sua conta são exibidas.</p>
            </article>
            <SectionTitle title="Meus atendimentos" />
            <div className={styles.list}>{myAppointments.length ? myAppointments.map((item) => <AppointmentCard appointment={item} key={item.id} onClick={() => openAppointment(item)} />) : <EmptyState text="Sua agenda está vazia." />}</div>
          </section>
        )}

        {page === "profile" && (
          <Page title="Minha conta" intro="Seus dados, preferências e configurações.">
            <div className={styles.profileCard}>
              <button onClick={() => { setProfileError(""); setProfilePanel("personal"); }}>Dados pessoais<span>›</span></button>
              <button onClick={() => { setProfileError(""); setProfilePanel("address"); }}>Endereços<span>›</span></button>
              <button onClick={() => setProfilePanel("notifications")}>Notificações<span>›</span></button>
              <button onClick={() => void openSecurityPanel()}>Segurança da conta<span>›</span></button>
              <button onClick={() => setProfilePanel("help")}>Ajuda<span>›</span></button>
            </div>
            <button className={`${styles.primaryButton} ${styles.logout}`} onClick={logout}>Sair da conta</button>
          </Page>
        )}
      </div>

      <nav className={styles.bottomNav} style={{ gridTemplateColumns: `repeat(${navItems[role].length}, 1fr)` }}>
        {navItems[role].map((item) => (
          <button className={page === item.page ? styles.navActive : ""} key={item.page} onClick={() => setPage(item.page)}>
            <span>{item.icon}</span>{item.label}
          </button>
        ))}
      </nav>

      {bookingOpen && (
        <Modal title="Novo agendamento" description="Conte para a gente qual cuidado seu bichano precisa." onClose={() => setBookingOpen(false)}>
          {!visiblePets.length && <p className={styles.formError}>Você ainda não tem bichanos cadastrados. Cadastre um bichano antes de agendar.</p>}
          {!bookingServices.length && <p className={styles.formError}>Cat sitting não está ativo para agendamento.</p>}
          <div className={styles.petPicker}>
            <strong>Bichanos da visita</strong>
            <small>Marque um ou mais. Cada bichano gera a quantidade de visitas escolhida para o dia.</small>
            {visiblePets.map((item) => (
              <label className={styles.petChoice} key={item.id}>
                <input
                  checked={bookingPetIds.includes(item.id)}
                  disabled={!visiblePets.length}
                  type="checkbox"
                  onChange={() => toggleBookingPet(item.id)}
                />
                <span>{item.name}</span>
              </label>
            ))}
          </div>
          <article className={styles.bookingSummary}>
            <span>Cuidado</span>
            <strong>{selectedBookingService?.name || "Cat sitting"}</strong>
            <small>Alimentação, água, caixa de areia, brincadeiras e relatório com fotos.</small>
          </article>
          <div className={styles.twoColumns}>
            <label className={styles.field}><span>Início</span><input type="date" min={earliestBookableDateKey()} value={bookingDateDraft} onChange={(event) => setBookingDateDraft(event.target.value)} /></label>
            <label className={styles.field}><span>Fim</span><input type="date" min={bookingDateDraft || earliestBookableDateKey()} value={bookingEndDateDraft} onChange={(event) => setBookingEndDateDraft(event.target.value)} /></label>
          </div>
          <label className={styles.field}>
            <span>Visitas por dia no período</span>
            <select value={bookingVisitsDraft} onChange={(event) => setBookingVisitsDraft(event.target.value as "1" | "2")}>
              <option value="1">1 visita</option>
              <option value="2">2 visitas</option>
            </select>
          </label>
          <button className={styles.secondaryButton} type="button" onClick={addBookingDate}>Adicionar período</button>
          <div className={styles.bookingDates}>
            <strong>Dias de atendimento</strong>
            <small>Se algum dia tiver só 1 atendimento, ajuste abaixo.</small>
            {bookingDates.map((item) => (
              <article key={item.date}>
                <span>
                  <strong>{formatDate(item.date)}</strong>
                  <small>{item.visitsPerDay === "1" ? "1 visita" : "2 visitas"}</small>
                </span>
                <select value={item.visitsPerDay} onChange={(event) => updateBookingDateVisits(item.date, event.target.value as "1" | "2")}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
                <button type="button" onClick={() => removeBookingDate(item.date)}>Remover</button>
              </article>
            ))}
            {!bookingDates.length && <small>Adicione pelo menos um dia de atendimento.</small>}
          </div>
          <label className={styles.field}><span>Endereço da visita</span><textarea rows={2} value={bookingAddress} onChange={(event) => setBookingAddress(event.target.value)} placeholder="Rua, número, complemento e bairro" /></label>
          <label className={styles.field}><span>Observações</span><textarea rows={2} value={bookingNotes} onChange={(event) => setBookingNotes(event.target.value)} placeholder="Rotina, acesso ao imóvel ou cuidados importantes" /></label>
          <article className={styles.bookingSummary}>
            <span>Total sem descontos</span>
            <strong>{bookingTotalCents > 0 ? formatMoney(bookingTotalCents) : "A calcular"}</strong>
            <small>{bookingVisitCount} visita{bookingVisitCount === 1 ? "" : "s"} {bookingPetIds.length > 1 ? `para ${bookingPetIds.length} bichanos, com ${formatMoney(EXTRA_CAT_FEE_CENTS)} por gato extra` : ""}</small>
          </article>
          {effectiveBookingDiscountCents > 0 && (
            <>
              <article className={styles.bookingSummary}>
                <span>Valor da diária com desconto</span>
                <strong>{formatMoney(bookingDiscountedDailyTotalCents)}</strong>
                <small>Desconto do cupom: {formatMoney(bookingDiscountPerVisitCents)} em cada diária</small>
              </article>
              <article className={styles.bookingSummary}>
                <span>Total com desconto</span>
                <strong>{formatMoney(bookingDiscountedTotalCents)}</strong>
                <small>Desconto total: {formatMoney(bookingTotalDiscountCents)}</small>
              </article>
            </>
          )}
          {role === "client" && <div className={styles.discountActivation}>
            <strong>{clientActiveDiscount ? "Cupom ativo" : "Possui cupom de desconto?"}</strong>
            {clientActiveDiscount ? (
              <small>{clientActiveDiscount.code} aplicado automaticamente. O desconto continua valendo enquanto a administradora mantiver o benefício ativo.</small>
            ) : !bookingDiscountOpen ? <button className={styles.secondaryButton} type="button" onClick={() => setBookingDiscountOpen(true)}>Tenho cupom</button> : <>
              <label className={styles.field}><span>Código de desconto</span><input value={bookingDiscountCode} onChange={(event) => {
                setBookingDiscountCode(event.target.value.toUpperCase());
                setBookingDiscountValueCents(0);
              }} placeholder="BQA-XXXXXX" /></label>
              <button className={styles.secondaryButton} disabled={discountActivating || !bookingDiscountCode.trim()} onClick={() => void activateDiscountCode()}>
                {discountActivating ? "Ativando..." : "Usar código"}
              </button>
              <small>Use apenas um cupom informado pela administradora.</small>
            </>}
          </div>}
          {bookingError && <p className={styles.formError}>{bookingError}</p>}
          {bookingWaitlistAvailable && (
            <article className={styles.waitlistPrompt}>
              <strong>Entrar na lista de espera?</strong>
              <small>A administradora recebe o pedido e pode confirmar um encaixe se surgir vaga ou se ela abrir um horário extra.</small>
              <button className={styles.secondaryButton} disabled={actionBusy} onClick={() => void requestAppointment(true)}>
                Pedir encaixe para este dia
              </button>
            </article>
          )}
          <button className={styles.primaryButton} disabled={actionBusy || !visiblePets.length || !bookingServices.length} onClick={() => void requestAppointment()}>
            {actionBusy ? "Salvando..." : "Solicitar agendamento"}
          </button>
        </Modal>
      )}

      {inviteOpen && (
        <Modal title="Convidar babá" description="Ela receberá um e-mail para criar a senha." onClose={() => setInviteOpen(false)}>
          <label className={styles.field}><span>Nome completo</span><input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Nome da babá" /></label>
          <label className={styles.field}><span>E-mail</span><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="baba@email.com" /></label>
          <button className={styles.primaryButton} disabled={actionBusy} onClick={() => void inviteStaff()}>{actionBusy ? "Enviando..." : "Enviar convite"}</button>
        </Modal>
      )}

      {petOpen && (
        <Modal
          title={editingPet ? "Editar bichano" : "Adicionar bichano"}
          description="Cadastre os dados essenciais para os próximos cuidados."
          onClose={() => {
            resetPetForm();
            setPetOpen(false);
          }}
        >
          <label className={styles.field}><span>Nome</span><input value={petName} onChange={(event) => setPetName(event.target.value)} /></label>
          <div className={styles.twoColumns}>
            <label className={styles.field}><span>Sexo</span><select value={petSex} onChange={(event) => setPetSex(event.target.value)}><option value="unknown">Não informado</option><option value="female">Fêmea</option><option value="male">Macho</option></select></label>
            <label className={styles.field}><span>Idade aproximada</span><input value={petAge} onChange={(event) => setPetAge(event.target.value)} placeholder="Ex.: 3 anos" /></label>
          </div>
          <label className={styles.field}><span>Raça</span><input value={petBreed} onChange={(event) => setPetBreed(event.target.value)} /></label>
          <label className={styles.field}><span>Medicação e horários</span><textarea rows={3} value={petMedication} onChange={(event) => setPetMedication(event.target.value)} /></label>
          <label className={styles.field}><span>Foto (até 5 MB)</span><input type="file" accept="image/*" onChange={(event) => setPetPhoto(event.target.files?.[0] || null)} /></label>
          <button className={styles.primaryButton} disabled={actionBusy} onClick={() => void savePet()}>{actionBusy ? "Salvando..." : editingPet ? "Salvar alterações" : "Cadastrar bichano"}</button>
        </Modal>
      )}

      {(clientDetail || clientDetailLoading || clientDetailError) && (
        <Modal
          title={clientDetail?.name || "Ficha do cliente"}
          description="Informacoes preenchidas pelo cliente no cadastro, formulario e fichas dos bichanos."
          onClose={() => {
            setClientDetail(null);
            setClientDetailError("");
            setClientDetailLoading(false);
          }}
        >
          {clientDetailLoading && <EmptyState text="Carregando ficha do cliente..." />}
          {clientDetailError && <p className={styles.formError}>{clientDetailError}</p>}
          {clientDetail && <>
            <ClientDetailPanel detail={clientDetail} />
            <button
              className={styles.deleteClientDetail}
              disabled={clientSavingId === clientDetail.id}
              onClick={() => {
                const confirmed = window.confirm(`Excluir o cadastro de ${clientDetail.name}? Essa acao nao pode ser desfeita.`);
                if (confirmed) void reviewClient(clientDetail.id, "delete");
              }}
            >
              {clientSavingId === clientDetail.id ? "Excluindo..." : "Excluir cliente"}
            </button>
          </>}
        </Modal>
      )}

      {appointmentOpen && (
        <Modal title={`${appointmentOpen.pet} • ${appointmentOpen.service}`} description={`${appointmentOpen.date}${isRouteAppointment(appointmentOpen) ? "" : `, às ${appointmentOpen.time}`} • ${appointmentOpen.address}`} onClose={() => setAppointmentOpen(null)}>
          {role === "client" && (appointmentOpen.rawStatus === "requested" || appointmentOpen.rawStatus === "confirmed") && (
            <button className={styles.secondaryButton} disabled={actionBusy} onClick={() => setCancelAppointmentOpen(appointmentOpen)}>
              {actionBusy ? "Cancelando..." : "Desistir da visita"}
            </button>
          )}
          {role === "admin" && appointmentOpen.rawStatus !== "requested" && <>
            <label className={styles.field}><span>Status</span><select value={managedStatus} onChange={(event) => setManagedStatus(event.target.value)}><option value="confirmed">Confirmada</option><option value="in_progress">Em andamento</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option></select></label>
            <label className={styles.field}><span>Responsável</span><select value={managedStaffId} onChange={(event) => setManagedStaffId(event.target.value)}><option value="">Não atribuída</option>{realStaff.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            <label className={styles.field}><span>Data e horário</span><input type="datetime-local" value={managedStartsAt} onChange={(event) => setManagedStartsAt(event.target.value)} /></label>
            <button className={styles.primaryButton} disabled={actionBusy} onClick={() => void manageAppointment()}>{actionBusy ? "Salvando..." : "Salvar agendamento"}</button>
          </>}
          {role === "admin" && appointmentOpen.rawStatus === "requested" && (
            <>
              <p className={styles.formHint}>Revise a solicitação, escolha a babá responsável e aceite ou recuse o atendimento.</p>
              <label className={styles.field}><span>Babá responsável</span><select value={managedStaffId} onChange={(event) => setManagedStaffId(event.target.value)}><option value="">Escolha a babá</option>{realStaff.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
              <div className={styles.formActions}>
                <button className={styles.secondaryButton} disabled={actionBusy} onClick={() => void rejectAppointment(appointmentOpen)}>Recusar</button>
                <button className={styles.primaryButton} disabled={actionBusy || !managedStaffId} onClick={() => void approveAppointment(appointmentOpen)}>{actionBusy ? "Salvando..." : "Aceitar atendimento"}</button>
              </div>
            </>
          )}
          {(role === "staff" || role === "admin") && appointmentOpen.rawStatus !== "cancelled" && <>
            <div className={styles.formDivider}>Relatório da visita</div>
            <label className={styles.field}><span>Resumo para o tutor</span><textarea rows={4} value={visitNote} onChange={(event) => setVisitNote(event.target.value)} placeholder="Alimentação, água, caixa de areia, comportamento e medicação" /></label>
            <div className={styles.formActions}>
              <button className={styles.secondaryButton} disabled={actionBusy} onClick={() => void recordVisit(false)}>Salvar relatório</button>
              <button className={styles.primaryButton} disabled={actionBusy} onClick={() => void recordVisit(true)}>Concluir visita</button>
            </div>
          </>}
        </Modal>
      )}

      {cancelAppointmentOpen && (
        <Modal
          title="Desistir da visita?"
          description={`${cancelAppointmentOpen.pet} • ${cancelAppointmentOpen.date}. A visita será cancelada e sairá da sua agenda.`}
          onClose={() => {
            if (!actionBusy) setCancelAppointmentOpen(null);
          }}
        >
          <div className={styles.formActions}>
            <button className={styles.secondaryButton} disabled={actionBusy} onClick={() => setCancelAppointmentOpen(null)}>
              Voltar
            </button>
            <button className={styles.primaryButton} disabled={actionBusy} onClick={() => void cancelMyAppointment(cancelAppointmentOpen)}>
              {actionBusy ? "Cancelando..." : "Confirmar desistência"}
            </button>
          </div>
        </Modal>
      )}

      {profilePanel === "personal" && (
        <Modal title="Dados pessoais" description="Atualize as informações exibidas no seu perfil." onClose={() => setProfilePanel(null)}>
          <label className={styles.field}><span>Nome completo</span><input value={profileName} onChange={(event) => setProfileName(event.target.value)} /></label>
          <label className={styles.field}><span>E-mail</span><input value={email} disabled /></label>
          <label className={styles.field}><span>Telefone</span><input type="tel" value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} /></label>
          {profileError && <p className={styles.formError}>{profileError}</p>}
          <button className={styles.primaryButton} disabled={profileSaving} onClick={() => void saveProfile("personal")}>
            {profileSaving ? "Salvando..." : "Salvar dados"}
          </button>
        </Modal>
      )}

      {profilePanel === "address" && (
        <Modal title="Endereço" description="Informe o endereço principal usado nos atendimentos." onClose={() => setProfilePanel(null)}>
          <label className={styles.field}><span>Endereço completo</span><textarea rows={3} value={profileAddress} onChange={(event) => setProfileAddress(event.target.value)} /></label>
          {profileError && <p className={styles.formError}>{profileError}</p>}
          <button className={styles.primaryButton} disabled={profileSaving} onClick={() => void saveProfile("address")}>
            {profileSaving ? "Salvando..." : "Salvar endereço"}
          </button>
        </Modal>
      )}

      {profilePanel === "notifications" && (
        <Modal title="Notificações" description="Escolha quais avisos deseja receber." onClose={() => setProfilePanel(null)}>
          <label className={styles.preferenceRow}><span>Agendamentos e visitas</span><input type="checkbox" checked={notificationPreferences.appointments} onChange={(event) => setNotificationPreferences((current) => ({ ...current, appointments: event.target.checked }))} /></label>
          <label className={styles.preferenceRow}><span>Lembretes de pagamento</span><input type="checkbox" checked={notificationPreferences.payments} onChange={(event) => setNotificationPreferences((current) => ({ ...current, payments: event.target.checked }))} /></label>
          <label className={styles.preferenceRow}><span>Novidades e promoções</span><input type="checkbox" checked={notificationPreferences.news} onChange={(event) => setNotificationPreferences((current) => ({ ...current, news: event.target.checked }))} /></label>
          <button className={styles.primaryButton} disabled={actionBusy} onClick={() => void saveNotificationPreferences()}>{actionBusy ? "Salvando..." : "Salvar preferências"}</button>
        </Modal>
      )}

      {profilePanel === "security" && (
        <Modal title="Segurança da conta" description="Use um aplicativo autenticador para proteger sua conta mesmo se alguém descobrir sua senha." onClose={() => setProfilePanel(null)}>
          <div className={styles.securityStatus}>
            <span>{mfaEnabled ? "Proteção em duas etapas ativa" : "Proteção em duas etapas desativada"}</span>
            <small>
              {mfaEnabled
                ? requireStaffMfa
                  ? "O código do aplicativo será solicitado em novos acessos."
                  : "O autenticador continua cadastrado, mas não será exigido no momento."
                : requireStaffMfa && role !== "client"
                  ? "A ativação é obrigatória para a equipe."
                  : "A ativação é opcional no momento."}
            </small>
          </div>
          {!mfaEnabled && (
            <button className={styles.primaryButton} onClick={() => void enableMfaFromProfile()}>
              Configurar aplicativo autenticador
            </button>
          )}
          {mfaEnabled && <p className={styles.securityHint}>Para trocar ou remover o autenticador, fale com a administradora. Isso evita que alguém com uma sessão aberta desative sua proteção.</p>}
          {supabase && <>
            <div className={styles.formDivider}>Alterar senha</div>
            <label className={styles.field}><span>Nova senha</span><PasswordInput autoComplete="new-password" minLength={8} value={newPassword} visible={showNewPassword} onChange={setNewPassword} onToggle={() => setShowNewPassword((current) => !current)} /></label>
            <button className={styles.secondaryButton} disabled={actionBusy || newPassword.length < 8} onClick={() => void updatePassword()}>Atualizar senha</button>
          </>}
          {mfaError && <p className={styles.loginError}>{mfaError}</p>}
        </Modal>
      )}

      {profilePanel === "help" && (
        <Modal title="Ajuda" description="Fale com a equipe Bichano que Amo quando precisar." onClose={() => setProfilePanel(null)}>
          <div className={styles.helpCard}>
            <strong>Atendimento</strong>
            <span>contato@bichano.com</span>
            <small>Respondemos assim que possível.</small>
          </div>
          <button className={styles.primaryButton} onClick={() => { window.location.href = "mailto:contato@bichano.com?subject=Ajuda%20-%20Bichano%20que%20Amo"; }}>Enviar e-mail</button>
        </Modal>
      )}

      {pricingOpen && (
        <Modal title="Preço e descontos" description="Defina o valor padrão da visita e emita códigos promocionais únicos." onClose={() => setPricingOpen(false)}>
          <div className={styles.pricingSection}>
            <strong>Valor padrão</strong>
            <label className={styles.field}><span>Valor da visita</span><input inputMode="numeric" value={standardVisitPrice} onChange={(event) => setStandardVisitPrice(formatCurrencyInput(event.target.value))} placeholder="0,00" /></label>
            <button className={styles.primaryButton} disabled={pricingSaving} onClick={() => void saveStandardVisitPrice()}>
              {pricingSaving ? "Salvando..." : "Salvar valor padrão"}
            </button>
          </div>

          <div className={styles.pricingSection}>
            <strong>Gerar código de desconto</strong>
            <label className={styles.field}><span>Valor do desconto (R$)</span><input inputMode="numeric" value={discountValue} onChange={(event) => setDiscountValue(formatCurrencyInput(event.target.value))} placeholder="0,00" /></label>
            <div className={styles.twoColumns}>
              <label className={styles.field}><span>Validade</span><input type="date" value={discountExpiresAt} onChange={(event) => setDiscountExpiresAt(event.target.value)} /></label>
              <label className={styles.field}><span>Limite de usos</span><input type="number" min="1" value={discountMaxUses} onChange={(event) => setDiscountMaxUses(event.target.value)} /></label>
            </div>
            <button className={styles.primaryButton} disabled={pricingSaving} onClick={() => void generateDiscountCode()}>Gerar código dinâmico</button>
          </div>

          <div className={styles.discountList}>
            <strong>Códigos emitidos</strong>
            {discountCodes.length ? discountCodes.map((item) => (
              <article key={item.id}>
                <span><b>{item.code}</b><small>{formatMoney(item.discountValue)} de desconto permanente • intransferível{item.usedBy?.length ? ` • usado por ${item.usedBy.join(", ")}` : ""}</small></span>
                <em>{item.timesUsed}/{item.maxUses ?? "∞"} usos</em>
                <span className={styles.discountActions}>
                  <button type="button" onClick={() => void copyDiscountCode(item.code)}>Copiar</button>
                  <button className={styles.deleteDiscount} disabled={pricingSaving} type="button" onClick={() => setDiscountDeleteOpen(item)}>Excluir</button>
                </span>
              </article>
            )) : <EmptyState text="Nenhum código emitido ainda." />}
          </div>

          <div className={styles.discountList}>
            <strong>Benefícios ativados</strong>
            {discountRedemptions.length ? discountRedemptions.map((item) => (
              <article className={item.cancelledAt ? styles.cancelledBenefit : ""} key={item.id}>
                <span><b>{item.clientName}</b><small>{item.code} • {item.validUntil ? `até ${formatDate(item.validUntil.slice(0, 10))}` : "tempo indeterminado"}</small></span>
                {item.cancelledAt
                  ? <em>Cancelado</em>
                  : <button disabled={pricingSaving} onClick={() => void cancelDiscountRedemption(item.id)}>Cancelar</button>}
              </article>
            )) : <EmptyState text="Nenhum cliente ativou um benefício ainda." />}
          </div>
        </Modal>
      )}

      {discountDeleteOpen && (
        <Modal
          title="Excluir cupom?"
          description={`${discountDeleteOpen.code} deixará de poder ser usado e não será mais aplicado nas próximas reservas.`}
          onClose={() => {
            if (!pricingSaving) setDiscountDeleteOpen(null);
          }}
        >
          <div className={styles.formActions}>
            <button className={styles.secondaryButton} disabled={pricingSaving} onClick={() => setDiscountDeleteOpen(null)}>
              Voltar
            </button>
            <button className={styles.primaryButton} disabled={pricingSaving} onClick={() => void deleteDiscountCode(discountDeleteOpen)}>
              {pricingSaving ? "Excluindo..." : "Excluir cupom"}
            </button>
          </div>
        </Modal>
      )}

      <Toast message={toast} />
    </main>
  );
}

function Page({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return <section className={styles.page}><h1 className={styles.pageTitle}>{title}</h1><p className={styles.pageIntro}>{intro}</p>{children}</section>;
}

function EmptyState({ text }: { text: string }) {
  return <div className={styles.emptyState}>{text}</div>;
}

function QuickAction({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return <button className={styles.quickAction} onClick={onClick}><span>{icon}</span><strong>{label}</strong></button>;
}

function SectionTitle({ title, action, onClick }: { title: string; action?: string; onClick?: () => void }) {
  return <div className={styles.sectionTitle}><h3>{title}</h3>{action && <button onClick={onClick}>{action}</button>}</div>;
}

function AppointmentCard({ appointment, onClick }: { appointment: AppointmentView; onClick?: () => void }) {
  return (
    <button className={styles.appointmentCard} onClick={onClick} type="button">
      <span className={styles.time}>{appointmentTimeLabel(appointment)}</span>
      <span>
        <strong>{appointment.pet} • {appointment.service}</strong>
        <small>{appointment.date} • Tutor: {appointment.tutor}</small>
        <small>{appointment.address}</small>
        {appointment.notes && <small>Detalhes: {appointment.notes}</small>}
        <small>Responsável: {appointment.sitter}</small>
      </span>
      <em className={appointment.status === "Pendente" ? styles.pending : ""}>{appointment.status}</em>
    </button>
  );
}

function RequestedAppointmentCard({
  appointment,
  saving,
  onReview,
}: {
  appointment: AppointmentView;
  saving: boolean;
  onReview: () => void;
}) {
  return (
    <article className={styles.requestedAppointmentCard}>
      <span className={styles.time}>ROTA<small>Solicitada</small></span>
      <span>
        <strong>{appointment.pet} • {appointment.service}</strong>
        <small>{appointment.date} • Tutor: {appointment.tutor}</small>
        <small>{appointment.address}</small>
        {appointment.notes && <small>Detalhes: {appointment.notes}</small>}
      </span>
      <div className={styles.requestedAppointmentActions}>
        <button disabled={saving} onClick={onReview}>Revisar</button>
      </div>
    </article>
  );
}

function WaitlistCard({
  request,
  saving,
  onApprove,
  onReject,
}: {
  request: WaitlistRequestView;
  saving: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <article className={styles.waitlistCard}>
      <span className={styles.time}>{request.time}<small>Encaixe</small></span>
      <span>
        <strong>{request.pet} • {request.service}</strong>
        <small>{request.date} • Tutor: {request.tutor}</small>
        <small>{request.address}</small>
        {request.notes && <small>Obs.: {request.notes}</small>}
        <em>{request.status}</em>
      </span>
      <div className={styles.waitlistActions}>
        <button disabled={saving} onClick={onApprove}>Encaixar</button>
        <button className={styles.rejectWaitlist} disabled={saving} onClick={onReject}>Recusar</button>
      </div>
    </article>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className={styles.stat}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function StaffCard({ name, detail, active = false, locked = false, onAction }: { name: string; detail: string; active?: boolean; locked?: boolean; onAction: () => void }) {
  return <article className={styles.staffCard}><span className={styles.initials}>{name.split(" ").map((part) => part[0]).join("")}</span><span><strong>{name}</strong><small>{active ? `Acesso ativo • ${detail}` : `Acesso suspenso • ${detail}`}</small></span><button className={active ? styles.revoke : ""} disabled={locked} onClick={onAction}>{locked ? "Principal" : active ? "Revogar" : "Conceder"}</button></article>;
}

function ClientCard({ client, saving, onOpen, onApprove }: { client: ClientView; saving: boolean; onOpen: () => void; onApprove: () => void }) {
  return (
    <article
      className={styles.clientCard}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <span className={styles.initials}>{client.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
      <span>
        <strong>{client.name}</strong>
        <small>{client.phone}</small>
        <small>{client.address}</small>
        <small>{client.petNames.length ? client.petNames.join(", ") : "Bichano não informado"}</small>
        {client.welcomeCode && <small className={styles.welcomeCode}>Cupom de boas-vindas: <b>{client.welcomeCode}</b></small>}
        <em className={client.active ? styles.clientActive : styles.clientPending}>
          {client.active ? "Acesso ativo" : "Aguardando aprovação"}
        </em>
      </span>
      <div className={styles.clientActions}>
        {!client.active && <button disabled={saving} onClick={(event) => { event.stopPropagation(); onApprove(); }}>Aceitar</button>}
      </div>
    </article>
  );
}

function detailText(value: string | null | undefined) {
  return value?.trim() || "Nao informado";
}

function boolText(value: boolean) {
  return value ? "Sim" : "Nao";
}

function sexText(value: string | null) {
  if (value === "female") return "Femea";
  if (value === "male") return "Macho";
  return "Nao informado";
}

function DetailItem({ label, value }: { label: string; value: string | null | undefined }) {
  return <span><small>{label}</small><strong>{detailText(value)}</strong></span>;
}

function ClientDetailPanel({ detail }: { detail: ClientDetail }) {
  return (
    <div className={styles.clientDetail}>
      <section>
        <h4>Dados do cliente</h4>
        <div className={styles.detailGrid}>
          <DetailItem label="Nome" value={detail.name} />
          <DetailItem label="E-mail" value={detail.email} />
          <DetailItem label="Telefone" value={detail.phone} />
          <DetailItem label="Endereco" value={detail.address} />
          <DetailItem label="Profissao" value={detail.profession} />
          <DetailItem label="Ficha" value={detail.onboardingCompletedAt ? `Preenchida em ${new Date(detail.onboardingCompletedAt).toLocaleDateString("pt-BR")}` : "Pendente"} />
        </div>
      </section>

      <section>
        <h4>Contato de emergencia</h4>
        <div className={styles.detailGrid}>
          <DetailItem label="Nome" value={detail.emergencyContactName} />
          <DetailItem label="Telefone" value={detail.emergencyContactPhone} />
        </div>
      </section>

      <section>
        <h4>Bichanos</h4>
        {detail.pets.length ? detail.pets.map((pet) => (
          <article className={styles.clientPetDetail} key={pet.id}>
            <span className={styles.clientPetPhoto} style={pet.photoUrl ? { backgroundImage: `url("${pet.photoUrl}")` } : undefined}>
              {pet.photoUrl ? "" : "Foto"}
            </span>
            <div>
              <strong>{pet.name}</strong>
              <div className={styles.detailGrid}>
                <DetailItem label="Sexo" value={sexText(pet.sex)} />
                <DetailItem label="Raca" value={pet.breed} />
                <DetailItem label="Idade aproximada" value={pet.approximateAge} />
                <DetailItem label="Ficha do bichano" value={pet.intakeCompletedAt ? `Preenchida em ${new Date(pet.intakeCompletedAt).toLocaleDateString("pt-BR")}` : "Pendente"} />
                <DetailItem label="Condicao de saude" value={`${boolText(pet.hasHealthCondition)}${pet.healthConditionDetails ? ` - ${pet.healthConditionDetails}` : ""}`} />
                <DetailItem label="Medicacao" value={`${boolText(pet.usesMedication)}${pet.medicationDetails ? ` - ${pet.medicationDetails}` : ""}`} />
                <DetailItem label="Alergia" value={`${boolText(pet.hasAllergy)}${pet.allergyDetails ? ` - ${pet.allergyDetails}` : ""}`} />
                <DetailItem label="Veterinario" value={pet.veterinarianContact} />
                <DetailItem label="Observacoes" value={pet.intakeObservations} />
              </div>
            </div>
          </article>
        )) : <EmptyState text="Nenhum bichano ativo cadastrado para este cliente." />}
      </section>
    </div>
  );
}

function Calendar({
  appointments = [],
  selectedDateKey = "",
  onSelectDate,
}: {
  appointments?: AppointmentView[];
  selectedDateKey?: string;
  onSelectDate?: (dateKey: string) => void;
}) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(today);
  const appointmentDays = new Set(
    appointments
      .filter((appointment) => appointment.rawStatus !== "cancelled" && appointment.rawStatus !== "completed")
      .flatMap((appointment) => appointmentCalendarDateKeys(appointment)),
  );
  return <div className={styles.calendar}><div className={styles.calendarHead}><span /><strong>{monthLabel}</strong><span /></div><div className={styles.calendarGrid}>{["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}{days.map((day, index) => {
    if (day === null) return <span key={`empty-${index}`} />;
    const dateKey = localDateKey(new Date(year, month, day));
    const hasAppointment = appointmentDays.has(dateKey);
    const isToday = day === today.getDate();
    const isSelected = selectedDateKey === dateKey;
    return <button className={`${isToday ? styles.selectedDay : ""} ${hasAppointment ? styles.appointmentDay : ""} ${isSelected ? styles.activeCalendarDay : ""}`} key={day} onClick={() => onSelectDate?.(dateKey)}>{day}{hasAppointment && <small />}</button>;
  })}</div></div>;
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return <div className={styles.modal} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={styles.modalSheet}><div className={styles.grip} /><h3>{title}</h3><p>{description}</p>{children}</div></div>;
}

function PasswordInput({
  value,
  visible,
  onChange,
  onToggle,
  autoComplete,
  minLength,
}: {
  value: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
  autoComplete: string;
  minLength?: number;
}) {
  return (
    <span className={styles.passwordField}>
      <input
        autoComplete={autoComplete}
        minLength={minLength}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        aria-label={visible ? "Ocultar senha" : "Visualizar senha"}
        aria-pressed={visible}
        className={styles.passwordToggle}
        type="button"
        onClick={onToggle}
      >
        {visible ? "Ocultar" : "Ver"}
      </button>
    </span>
  );
}

const emptyIntake: IntakeData = {
  tutorName: "",
  tutorPhone: "",
  tutorAddress: "",
  tutorProfession: "",
  emergencyName: "",
  emergencyPhone: "",
  petName: "",
  petSex: "",
  petBreed: "",
  petAge: "",
  hasHealthCondition: false,
  healthDetails: "",
  usesMedication: false,
  medicationDetails: "",
  hasAllergy: false,
  allergyDetails: "",
  veterinarian: "",
  observations: "",
};

function ClientIntake({
  email,
  onSubmit,
  onLogout,
}: {
  email: string;
  onSubmit: (data: IntakeData) => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<IntakeData>(emptyIntake);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof IntakeData>(key: K, value: IntakeData[K]) {
    setData((current) => ({ ...current, [key]: value }));
  }

  function nextStep() {
    if (
      (step === 1 && (!data.tutorName || !data.tutorPhone || !data.tutorAddress)) ||
      (step === 2 && (!data.petName || !data.petSex))
    ) {
      setError("Preencha os campos obrigatórios para continuar.");
      return;
    }
    setError("");
    setStep((current) => Math.min(current + 1, 3));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!data.emergencyName || !data.emergencyPhone) {
      setError("Informe um contato para emergências.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit(data);
    } catch {
      setError("Não foi possível salvar a ficha. Revise os dados e tente novamente.");
      setSaving(false);
    }
  }

  return (
    <section className={styles.intake}>
      <header className={styles.intakeHeader}>
        <Image src="/BichanoQueAmoLogo.svg" alt="Bichano que Amo" width={62} height={58} />
        <div>
          <span>Ficha de atendimento</span>
          <h1>{step === 1 ? "Sobre você" : step === 2 ? "Sobre o bichano" : "Saúde e emergência"}</h1>
        </div>
        <button type="button" onClick={onLogout}>Sair</button>
      </header>

      <div className={styles.progress}>
        {[1, 2, 3].map((item) => <span className={item <= step ? styles.progressActive : ""} key={item} />)}
      </div>
      <p className={styles.intakeIntro}>
        Essas informações são necessárias para cuidarmos do seu bichano com segurança.
      </p>

      <form onSubmit={submit}>
        {step === 1 && (
          <div className={styles.formStep}>
            <FormInput label="Nome completo *" value={data.tutorName} onChange={(value) => update("tutorName", value)} />
            <FormInput label="Telefone *" type="tel" value={data.tutorPhone} onChange={(value) => update("tutorPhone", value)} />
            <label className={styles.field}>
              <span>E-mail de acesso</span>
              <input type="email" value={email} disabled />
            </label>
            <FormInput label="Endereço completo *" value={data.tutorAddress} onChange={(value) => update("tutorAddress", value)} />
            <FormInput label="Profissão" value={data.tutorProfession} onChange={(value) => update("tutorProfession", value)} />
          </div>
        )}

        {step === 2 && (
          <div className={styles.formStep}>
            <FormInput label="Nome do bichano *" value={data.petName} onChange={(value) => update("petName", value)} />
            <label className={styles.field}>
              <span>Sexo *</span>
              <select value={data.petSex} onChange={(event) => update("petSex", event.target.value)}>
                <option value="">Selecione</option>
                <option value="female">Fêmea</option>
                <option value="male">Macho</option>
                <option value="unknown">Não informado</option>
              </select>
            </label>
            <div className={styles.twoColumns}>
              <FormInput label="Raça" value={data.petBreed} onChange={(value) => update("petBreed", value)} />
              <FormInput label="Idade" value={data.petAge} onChange={(value) => update("petAge", value)} />
            </div>
            <FormInput label="Contato do veterinário" value={data.veterinarian} onChange={(value) => update("veterinarian", value)} />
          </div>
        )}

        {step === 3 && (
          <div className={styles.formStep}>
            <YesNoField label="Possui algum problema de saúde?" value={data.hasHealthCondition} onChange={(value) => update("hasHealthCondition", value)} />
            {data.hasHealthCondition && <FormInput label="Qual?" value={data.healthDetails} onChange={(value) => update("healthDetails", value)} />}
            <YesNoField label="Faz uso de medicamentos?" value={data.usesMedication} onChange={(value) => update("usesMedication", value)} />
            {data.usesMedication && <FormInput label="Quais e em que horários?" value={data.medicationDetails} onChange={(value) => update("medicationDetails", value)} />}
            <YesNoField label="Possui alguma alergia?" value={data.hasAllergy} onChange={(value) => update("hasAllergy", value)} />
            {data.hasAllergy && <FormInput label="Qual?" value={data.allergyDetails} onChange={(value) => update("allergyDetails", value)} />}
            <div className={styles.formDivider}>Contato em caso de emergência</div>
            <FormInput label="Nome do contato *" value={data.emergencyName} onChange={(value) => update("emergencyName", value)} />
            <FormInput label="Telefone do contato *" type="tel" value={data.emergencyPhone} onChange={(value) => update("emergencyPhone", value)} />
            <label className={styles.field}>
              <span>Observações</span>
              <textarea value={data.observations} onChange={(event) => update("observations", event.target.value)} rows={3} />
            </label>
          </div>
        )}

        {error && <p className={styles.formError}>{error}</p>}
        <div className={styles.formActions}>
          {step > 1 && <button type="button" className={styles.secondaryButton} onClick={() => setStep((current) => current - 1)}>Voltar</button>}
          {step < 3 ? (
            <button type="button" className={styles.primaryButton} onClick={nextStep}>Continuar</button>
          ) : (
            <button className={styles.primaryButton} disabled={saving}>{saving ? "Salvando..." : "Concluir ficha"}</button>
          )}
        </div>
      </form>
    </section>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function YesNoField({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className={styles.yesNoField} role="group" aria-label={label}>
      <span>{label}</span>
      <button type="button" className={value ? styles.choiceActive : ""} onClick={() => onChange(true)}>Sim</button>
      <button type="button" className={!value ? styles.choiceActive : ""} onClick={() => onChange(false)}>Não</button>
    </div>
  );
}
