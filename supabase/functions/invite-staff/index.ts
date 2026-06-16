import { createClient } from "npm:@supabase/supabase-js@2";

const baseHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
};

function responseHeaders(request: Request) {
  const origin = request.headers.get("Origin");

  return origin
    ? { ...baseHeaders, "Access-Control-Allow-Origin": origin }
    : baseHeaders;
}

function jsonResponse(request: Request, body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request),
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Método não permitido" }, 405);
  }

  const declaredLength = Number(request.headers.get("Content-Length") || "0");
  if (declaredLength > 10_000) {
    return jsonResponse(request, { error: "Requisição muito grande" }, 413);
  }

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) {
      throw new Error("Sessão não encontrada");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Configuração da Edge Function incompleta");
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const accessToken = authorization.replace(/^Bearer\s+/i, "");

    const { data: userData, error: userError } = await adminClient.auth.getUser(accessToken);
    if (userError || !userData.user) {
      throw new Error(`Sessão inválida: ${userError?.message || "usuário não encontrado"}`);
    }

    if (Deno.env.get("REQUIRE_STAFF_MFA") === "true") {
      const { data: assurance, error: assuranceError } =
        await userClient.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
      if (assuranceError || assurance?.currentLevel !== "aal2") {
        throw new Error("Verificação em duas etapas obrigatória");
      }
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("email, role, active")
      .eq("id", userData.user.id)
      .single();

    if (profileError || profile?.role !== "admin" || !profile.active) {
      const currentEmail = profile?.email || userData.user.email || "e-mail não identificado";
      const currentRole = profile?.role || "sem perfil";
      const currentStatus = profile?.active ? "ativo" : "inativo";
      throw new Error(`Sessão atual: ${currentEmail} (${currentRole}, ${currentStatus}). Entre com uma conta administradora ativa para enviar convites`);
    }

    const { email, fullName } = await request.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedName = String(fullName || "").trim();
    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

    if (!emailIsValid || normalizedName.length < 2 || normalizedName.length > 120) {
      return jsonResponse(request, { error: "Nome ou e-mail inválido" }, 422);
    }

    const { data: inviteRecord, error: recordError } = await adminClient
      .from("staff_invites")
      .insert({
        email: normalizedEmail,
        full_name: normalizedName,
        invited_by: userData.user.id,
      })
      .select("id")
      .single();

    if (recordError || !inviteRecord) {
      throw recordError || new Error("Não foi possível registrar o convite");
    }

    const { data: invited, error: inviteError } = await adminClient.auth.admin
      .inviteUserByEmail(normalizedEmail, {
        data: { full_name: normalizedName },
      });

    if (inviteError || !invited.user) {
      await adminClient
        .from("staff_invites")
        .delete()
        .eq("id", inviteRecord.id);
      throw inviteError || new Error("Não foi possível criar o convite");
    }

    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .upsert({
        id: invited.user.id,
        full_name: normalizedName,
        role: "staff",
        active: true,
      });

    if (profileUpdateError) {
      await adminClient.auth.admin.deleteUser(invited.user.id);
      await adminClient.from("staff_invites").delete().eq("id", inviteRecord.id);
      throw profileUpdateError;
    }

    return jsonResponse(request, { success: true }, 200);
  } catch (error) {
    console.error("invite-staff failed", error);
    const message = error instanceof Error ? error.message : "";
    const isAuthenticationError = message.includes("Sessão");
    const isMfaError = message.includes("duas etapas");
    const isAuthorizationError = message.includes("conta administradora ativa");
    const normalizedMessage = message.toLowerCase();
    const isExistingUser =
      normalizedMessage.includes("already") ||
      normalizedMessage.includes("registered") ||
      normalizedMessage.includes("exists");
    const isRateLimited =
      normalizedMessage.includes("rate limit") ||
      normalizedMessage.includes("too many requests");

    return jsonResponse(
      request,
      {
        error: isAuthenticationError
          ? message
          : isMfaError
            ? "A verificação em duas etapas está obrigatória para enviar convites."
            : isAuthorizationError
              ? message
            : isExistingUser
              ? "Este e-mail já possui cadastro ou convite."
              : isRateLimited
                ? "Muitos convites foram enviados. Aguarde alguns minutos e tente novamente."
                : message || "Não foi possível enviar o convite",
      },
      isAuthenticationError
        ? 401
        : isMfaError || isAuthorizationError
          ? 403
          : isRateLimited
            ? 429
            : message.includes("Configuração")
              ? 500
              : 400,
    );
  }
});
