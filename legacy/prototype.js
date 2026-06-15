const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const modal = document.getElementById("bookingModal");
const staffInviteModal = document.getElementById("staffInviteModal");
const toast = document.getElementById("toast");
const loginButton = document.getElementById("loginBtn");
const config = window.BICHANO_CONFIG || {};
const hasSupabaseConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const supabaseClient = hasSupabaseConfig && window.supabase
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

let userRole = "client";
let teamMode = false;
let currentProfile = null;
let toastTimer;

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    toast.textContent = "Solicitação enviada com sucesso.";
  }, 2800);
}

function initials(name) {
  return (name || "Bichano Que Amo")
    .split(" ")
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function configureMode() {
  teamMode = ["admin", "staff"].includes(userRole);
  appView.classList.toggle("admin-mode", userRole === "admin");
  appView.classList.toggle("staff-mode", userRole === "staff");
  const name = currentProfile?.full_name || (userRole === "admin" ? "Equipe" : "Ana");
  document.querySelector(".avatar").textContent = userRole === "admin" ? "BQ" : initials(name);
}

function showPage(page) {
  document.querySelectorAll(".page").forEach(item => item.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(item => item.classList.remove("active"));

  const target = document.getElementById(page + "Page");
  if (target) target.classList.add("active");

  const nav = document.querySelector(`.nav-btn[data-page="${page}"]`);
  if (nav) nav.classList.add("active");

  const firstName = currentProfile?.full_name?.split(" ")[0] || "Ana";
  const titles = {
    home: `Olá, ${firstName}!`,
    adminHome: "Olá, equipe!",
    reservations: "Reservas",
    clients: "Clientes",
    adminPets: "Bichanos",
    staffAccess: "Acesso das babás",
    staffHome: "Minha agenda",
    services: "Nossos cuidados",
    pets: teamMode ? "Bichanos" : "Meus bichanos",
    calendar: "Agenda",
    profile: "Minha conta"
  };
  document.getElementById("topTitle").textContent = titles[page] || "Bichano que Amo";
  document.querySelector(".app-scroll").scrollTop = 0;
}

function enterApp() {
  loginView.classList.remove("active");
  appView.classList.add("active");
  configureMode();
  const startPages = {
    admin: "adminHome",
    staff: "staffHome",
    client: "home"
  };
  showPage(startPages[userRole] || "home");
}

async function loadProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, full_name, role, phone")
    .eq("id", userId)
    .single();

  if (error) throw error;
  currentProfile = data;
  userRole = data.role;
  teamMode = ["admin", "staff"].includes(userRole);
}

async function loadPets() {
  const { data, error } = await supabaseClient
    .from("pets")
    .select("id, name, breed, birth_date, notes, owner:profiles!pets_owner_id_fkey(full_name)")
    .order("name");

  if (error) throw error;
  if (!data?.length) return;

  const petList = document.querySelector("#petsPage .pet-list");
  const addButton = document.getElementById("addPetBtn");
  petList.querySelectorAll(".pet-card").forEach(card => card.remove());

  data.forEach(pet => {
    const detail = [pet.breed || "SRD", teamMode ? pet.owner?.full_name : pet.notes]
      .filter(Boolean)
      .join(" • ");
    addButton.insertAdjacentHTML("beforebegin", `
      <article class="pet-card">
        <div class="pet-photo">🐱</div>
        <div><h4>${escapeHtml(pet.name)}</h4><p>${escapeHtml(detail || "Informações não cadastradas")}</p></div>
        <span class="pet-arrow">›</span>
      </article>
    `);
  });
}

async function loadStaffAppointments() {
  const { data, error } = await supabaseClient
    .from("appointments")
    .select(`
      id,
      starts_at,
      status,
      pet:pets!appointments_pet_id_fkey(
        name,
        owner:profiles!pets_owner_id_fkey(full_name)
      ),
      service:services!appointments_service_id_fkey(name)
    `)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(20);

  if (error) throw error;
  const list = document.getElementById("staffAppointmentsList");
  if (!data?.length) {
    list.innerHTML = '<article class="empty-card" style="padding:18px">Nenhum atendimento atribuído.</article>';
    return;
  }

  list.innerHTML = data.map(appointment => {
    const startsAt = new Date(appointment.starts_at);
    const time = startsAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const status = appointment.status === "confirmed" ? "Confirmada" : "Pendente";
    const statusClass = appointment.status === "confirmed" ? "status" : "status pending";
    return `
      <article class="admin-item">
        <span class="admin-time">${escapeHtml(time)}</span>
        <span class="admin-item-info">
          <strong>${escapeHtml(appointment.pet?.name)} • ${escapeHtml(appointment.service?.name)}</strong>
          <span>${escapeHtml(appointment.pet?.owner?.full_name || "Tutor")}</span>
        </span>
        <span class="${statusClass}">${status}</span>
      </article>
    `;
  }).join("");
}

async function loadStaffAccess() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, full_name, phone, active")
    .eq("role", "staff")
    .order("full_name");

  if (error) throw error;
  const list = document.getElementById("staffAccessList");
  if (!data?.length) {
    list.innerHTML = '<article class="empty-card" style="padding:18px">Nenhuma babá cadastrada.</article>';
    return;
  }

  list.innerHTML = data.map(person => `
    <article class="admin-item">
      <span class="client-initials">${escapeHtml(initials(person.full_name))}</span>
      <span class="admin-item-info">
        <strong>${escapeHtml(person.full_name)}</strong>
        <span>${person.active ? "Acesso ativo" : "Acesso suspenso"}${person.phone ? ` • ${escapeHtml(person.phone)}` : ""}</span>
      </span>
      <span class="access-actions">
        <button
          class="access-btn ${person.active ? "revoke" : ""}"
          data-staff-id="${person.id}"
          data-access-enabled="${person.active ? "false" : "true"}"
        >${person.active ? "Revogar" : "Conceder"}</button>
      </span>
    </article>
  `).join("");
}

async function loadRoleData() {
  if (userRole === "admin") {
    await Promise.all([loadPets(), loadStaffAccess()]);
    return;
  }
  if (userRole === "staff") {
    await loadStaffAppointments();
    return;
  }
  await loadPets();
}

async function handleLogin() {
  if (!supabaseClient) {
    enterApp();
    showToast("Modo demonstrativo: conecte o Supabase para usar dados reais.");
    return;
  }

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  loginButton.disabled = true;
  loginButton.textContent = "Entrando...";

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await loadProfile(data.user.id);
    await loadRoleData();
    enterApp();
  } catch (error) {
    showToast(error.message === "Invalid login credentials"
      ? "E-mail ou senha inválidos."
      : "Não foi possível entrar. Tente novamente.");
  } finally {
    loginButton.disabled = false;
    loginButton.innerHTML = "Entrar <span>→</span>";
  }
}

async function createBooking() {
  if (!supabaseClient) {
    modal.classList.remove("open");
    showToast("Solicitação simulada no modo demonstrativo.");
    return;
  }

  const petName = document.getElementById("bookingPet").value;
  const serviceName = document.getElementById("bookingService").value;
  const date = document.getElementById("bookingDate").value;
  const visitsPerDay = document.getElementById("bookingVisitsPerDay")?.value === "2" ? 2 : 1;
  const visitTimes = visitsPerDay === 2 ? ["09:00", "17:00"] : ["12:00"];

  try {
    const [{ data: pet }, { data: service }] = await Promise.all([
      supabaseClient.from("pets").select("id").eq("name", petName).single(),
      supabaseClient.from("services").select("id").eq("name", serviceName).single()
    ]);
    if (!pet || !service) throw new Error("Cadastro relacionado não encontrado");

    const appointments = visitTimes.map(time => {
      const startsAt = new Date(`${date}T${time}:00-03:00`);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      return {
        pet_id: pet.id,
        service_id: service.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "requested"
      };
    });
    const { error } = await supabaseClient.from("appointments").insert(appointments);
    if (error) throw error;

    modal.classList.remove("open");
    showToast("Agendamento solicitado com sucesso.");
  } catch (error) {
    showToast("Não foi possível criar o agendamento.");
  }
}

loginButton.addEventListener("click", handleLogin);

document.getElementById("roleBtn").addEventListener("click", event => {
  if (supabaseClient) {
    showToast("No modo conectado, o perfil é definido pelo seu usuário.");
    return;
  }
  userRole = userRole === "admin" ? "client" : "admin";
  teamMode = userRole === "admin";
  document.getElementById("email").value = userRole === "admin" ? "contato@bichano.com" : "ana@email.com";
  event.currentTarget.textContent = userRole === "admin" ? "Trocar para cliente" : "Trocar para equipe";
  event.currentTarget.parentElement.firstChild.textContent = userRole === "admin"
    ? "Visualizando como equipe. "
    : "Visualizando como cliente. ";
});

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

document.querySelectorAll("[data-open-modal]").forEach(button => {
  button.addEventListener("click", () => modal.classList.add("open"));
});

modal.addEventListener("click", event => {
  if (event.target === modal) modal.classList.remove("open");
});

staffInviteModal.addEventListener("click", event => {
  if (event.target === staffInviteModal) staffInviteModal.classList.remove("open");
});

document.getElementById("confirmBooking").addEventListener("click", createBooking);
document.getElementById("addPetBtn").addEventListener("click", () => {
  showToast("O cadastro de bichano será conectado na próxima etapa.");
});
document.getElementById("addClientBtn").addEventListener("click", () => {
  showToast("O cadastro de cliente será conectado na próxima etapa.");
});
document.getElementById("payNowBtn").addEventListener("click", () => {
  showToast("O pagamento online será conectado ao gateway escolhido.");
});
document.getElementById("viewPaymentsBtn").addEventListener("click", () => {
  showToast("A tela financeira será conectada na próxima etapa.");
});

document.getElementById("staffAccessList").addEventListener("click", async event => {
  const button = event.target.closest("[data-staff-id]");
  if (!button || !supabaseClient) return;

  button.disabled = true;
  try {
    const { error } = await supabaseClient.rpc("set_staff_access", {
      target_user_id: button.dataset.staffId,
      access_enabled: button.dataset.accessEnabled === "true"
    });
    if (error) throw error;
    await loadStaffAccess();
    showToast("Acesso atualizado com sucesso.");
  } catch {
    button.disabled = false;
    showToast("Não foi possível atualizar o acesso.");
  }
});

document.querySelectorAll("[data-demo-access]").forEach(button => {
  button.addEventListener("click", () => {
    const granting = button.textContent.trim() === "Conceder";
    button.textContent = granting ? "Revogar" : "Conceder";
    button.classList.toggle("revoke", granting);
    showToast(granting ? "Acesso demonstrativo concedido." : "Acesso demonstrativo revogado.");
  });
});

document.getElementById("inviteStaffBtn").addEventListener("click", () => {
  staffInviteModal.classList.add("open");
});

document.getElementById("sendStaffInviteBtn").addEventListener("click", async event => {
  const fullName = document.getElementById("staffInviteName").value.trim();
  const email = document.getElementById("staffInviteEmail").value.trim();

  if (!fullName || !email) {
    showToast("Preencha o nome e o e-mail da babá.");
    return;
  }

  if (!supabaseClient) {
    staffInviteModal.classList.remove("open");
    showToast("Convite demonstrativo enviado.");
    return;
  }

  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Enviando...";

  try {
    const { error } = await supabaseClient.functions.invoke("invite-staff", {
      body: { fullName, email }
    });
    if (error) throw error;

    staffInviteModal.classList.remove("open");
    document.getElementById("staffInviteName").value = "";
    document.getElementById("staffInviteEmail").value = "";
    await loadStaffAccess();
    showToast("Convite enviado com sucesso.");
  } catch {
    showToast("Não foi possível enviar o convite.");
  } finally {
    button.disabled = false;
    button.textContent = "Enviar convite";
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentProfile = null;
  userRole = "client";
  teamMode = false;
  appView.classList.remove("active");
  loginView.classList.add("active");
});

const calendarGrid = document.getElementById("calendarGrid");
["D", "S", "T", "Q", "Q", "S", "S"].forEach(day => {
  calendarGrid.insertAdjacentHTML("beforeend", `<span class="week">${day}</span>`);
});

const days = [31, ...Array.from({ length: 30 }, (_, index) => index + 1), 1, 2, 3, 4];
days.forEach((day, index) => {
  const outside = index === 0 || index > 30;
  const classes = [
    "day",
    outside ? "muted" : "",
    [5, 9, 16, 22, 28].includes(day) && !outside ? "has-event" : "",
    day === 16 && !outside ? "selected" : ""
  ].filter(Boolean).join(" ");
  calendarGrid.insertAdjacentHTML("beforeend", `<button class="${classes}">${day}</button>`);
});

if (supabaseClient) {
  supabaseClient.auth.getSession().then(async ({ data }) => {
    if (!data.session) return;
    try {
      await loadProfile(data.session.user.id);
      await loadRoleData();
      enterApp();
    } catch {
      await supabaseClient.auth.signOut();
    }
  });
}
