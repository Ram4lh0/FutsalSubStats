export interface ClubStaffEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_INVITE_REDIRECT_URL?: string;
}

type AuthUser = { id: string; email?: string | null };
type ProfileRow = { id: string; email: string | null; licenca?: string | null; license_expires_at?: string | null };
type ClubMemberRow = {
  club_id: string;
  user_id: string;
  apagar_conta_ao_remover?: boolean | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handleClubStaffInvite(request: Request, env: ClubStaffEnv): Promise<Response> {
  if (request.method === "OPTIONS") return emptyCors();
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { clubId?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const clubId = String(body.clubId || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!UUID_RE.test(clubId)) {
    return json({ error: "invalid_club" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "invalid_email" }, 400);

  const userToken = bearerToken(request.headers.get("authorization"));
  if (!userToken) return json({ error: "missing_session" }, 401);

  const actor = await userFromToken(env, userToken);
  if (!actor?.id) return json({ error: "invalid_session" }, 401);

  const ownsClub = await userOwnsClub(env, actor.id, clubId);
  if (!ownsClub) return json({ error: "not_club_owner" }, 403);

  const account = await inviteOrFindCoach(env, email, clubId);
  if (!account?.id) return json({ error: "invite_failed" }, 502);

  await ensureCoachProfile(env, account.id, email);
  await associateCoach(env, clubId, account.id, {
    actorId: actor.id,
    deleteAccountOnRemoval: account.newAccount,
  });

  return json({
    ok: true,
    email,
    userId: account.id,
    newAccount: account.newAccount,
  });
}

export async function handleClubStaffRemove(request: Request, env: ClubStaffEnv): Promise<Response> {
  if (request.method === "OPTIONS") return emptyCors();
  if (request.method !== "DELETE" && request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { clubId?: string; userId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const clubId = String(body.clubId || "").trim();
  const userId = String(body.userId || "").trim();
  if (!UUID_RE.test(clubId)) return json({ error: "invalid_club" }, 400);
  if (!UUID_RE.test(userId)) return json({ error: "invalid_user" }, 400);

  const userToken = bearerToken(request.headers.get("authorization"));
  if (!userToken) return json({ error: "missing_session" }, 401);

  const actor = await userFromToken(env, userToken);
  if (!actor?.id) return json({ error: "invalid_session" }, 401);
  if (actor.id === userId) return json({ error: "cannot_remove_self" }, 400);

  const ownsClub = await userOwnsClub(env, actor.id, clubId);
  if (!ownsClub) return json({ error: "not_club_owner" }, 403);

  const member = await findClubMember(env, clubId, userId);
  if (!member) return json({ error: "member_not_found" }, 404);

  await removeTeamAccessForClub(env, clubId, userId);
  await deleteClubMember(env, clubId, userId);

  let deletedAccount = false;
  if (member.apagar_conta_ao_remover) {
    deletedAccount = await deleteInvitedAccountIfUnused(env, userId);
  }

  return json({ ok: true, userId, deletedAccount });
}

async function userFromToken(env: ClubStaffEnv, token: string): Promise<AuthUser | null> {
  const base = supabaseBase(env);
  const response = await fetch(`${base}/auth/v1/user`, {
    headers: {
      apikey: serviceKey(env),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  return (await response.json()) as AuthUser;
}

async function findProfileById(env: ClubStaffEnv, id: string): Promise<ProfileRow | null> {
  const rows = await restSelect<ProfileRow>(
    env,
    `profiles?id=eq.${encodeURIComponent(id)}&select=id,email,licenca,license_expires_at&limit=1`
  );
  return rows[0] || null;
}

async function findProfileByEmail(env: ClubStaffEnv, email: string): Promise<ProfileRow | null> {
  const rows = await restSelect<ProfileRow>(
    env,
    `profiles?email=eq.${encodeURIComponent(email)}&select=id,email,licenca&limit=1`
  );
  return rows[0] || null;
}

async function userOwnsClub(env: ClubStaffEnv, userId: string, clubId: string) {
  const rows = await restSelect<{ id: string }>(
    env,
    `clubs?id=eq.${encodeURIComponent(clubId)}&owner_id=eq.${encodeURIComponent(userId)}&archived_at=is.null&select=id&limit=1`
  );
  return rows.length > 0;
}

async function inviteOrFindCoach(env: ClubStaffEnv, email: string, clubId: string) {
  const existingProfile = await findProfileByEmail(env, email);
  if (existingProfile?.id) return { id: existingProfile.id, newAccount: false };

  const base = supabaseBase(env);
  const url = new URL(`${base}/auth/v1/invite`);
  if (env.SUPABASE_INVITE_REDIRECT_URL) url.searchParams.set("redirect_to", env.SUPABASE_INVITE_REDIRECT_URL);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: supabaseHeaders(env),
    body: JSON.stringify({
      email,
      data: {
        name: email,
        licenca: "treinador",
        origem: "equipa_tecnica",
        club_id: clubId,
      },
    }),
  });

  if (response.ok) {
    const data = (await response.json()) as { id?: string; user?: { id?: string } };
    const id = data.user?.id || data.id;
    return id ? { id, newAccount: true } : null;
  }

  const details = await response.text().catch(() => "");
  if (!/already been registered|already exists|email_exists|user_already_exists/i.test(details)) return null;

  const profile = await findProfileByEmail(env, email);
  return profile?.id ? { id: profile.id, newAccount: false } : null;
}

async function ensureCoachProfile(env: ClubStaffEnv, userId: string, email: string) {
  const existing = await findProfileById(env, userId);
  if (existing) {
    if (existing.email) return;
    const patch = await fetch(`${supabaseBase(env)}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: supabaseHeaders(env, { Prefer: "return=minimal" }),
      body: JSON.stringify({ email }),
    });
    if (!patch.ok) throw new Error(`profile_patch_failed:${patch.status}`);
    return;
  }

  const base = supabaseBase(env);
  const response = await fetch(`${base}/rest/v1/profiles`, {
    method: "POST",
    headers: supabaseHeaders(env, { Prefer: "return=minimal" }),
    body: JSON.stringify({ id: userId, email, licenca: "treinador" }),
  });
  if (!response.ok) throw new Error(`profile_insert_failed:${response.status}`);
}

async function associateCoach(
  env: ClubStaffEnv,
  clubId: string,
  userId: string,
  options: { actorId: string; deleteAccountOnRemoval: boolean }
) {
  const base = supabaseBase(env);
  const payload = {
    club_id: clubId,
    user_id: userId,
    criado_por: options.actorId,
    criado_por_convite: true,
    apagar_conta_ao_remover: options.deleteAccountOnRemoval,
  };
  const response = await fetch(`${base}/rest/v1/club_members?on_conflict=club_id,user_id`, {
    method: "POST",
    headers: supabaseHeaders(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(payload),
  });
  if (response.ok) return;

  const details = await response.text().catch(() => "");
  if (!/criado_por|criado_por_convite|apagar_conta_ao_remover|schema cache|column/i.test(details)) {
    throw new Error(`club_member_upsert_failed:${response.status}`);
  }

  // Permite publicar o Worker antes de correr a migração. Sem as colunas novas,
  // a associação continua a funcionar; só a remoção automática da conta fica
  // inativa até a migração existir.
  const fallback = await fetch(`${base}/rest/v1/club_members?on_conflict=club_id,user_id`, {
    method: "POST",
    headers: supabaseHeaders(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ club_id: clubId, user_id: userId }),
  });
  if (!fallback.ok) throw new Error(`club_member_upsert_failed:${fallback.status}`);
}

async function findClubMember(env: ClubStaffEnv, clubId: string, userId: string): Promise<ClubMemberRow | null> {
  const path = `club_members?club_id=eq.${encodeURIComponent(clubId)}&user_id=eq.${encodeURIComponent(userId)}&select=club_id,user_id,apagar_conta_ao_remover&limit=1`;
  try {
    const rows = await restSelect<ClubMemberRow>(env, path);
    return rows[0] || null;
  } catch (error) {
    const message = String(error);
    if (!/apagar_conta_ao_remover|schema cache|column/i.test(message)) throw error;
    const rows = await restSelect<ClubMemberRow>(
      env,
      `club_members?club_id=eq.${encodeURIComponent(clubId)}&user_id=eq.${encodeURIComponent(userId)}&select=club_id,user_id&limit=1`
    );
    return rows[0] || null;
  }
}

async function removeTeamAccessForClub(env: ClubStaffEnv, clubId: string, userId: string) {
  const teams = await restSelect<{ id: string }>(
    env,
    `teams?club_id=eq.${encodeURIComponent(clubId)}&select=id`
  );
  const ids = teams.map((team) => team.id).filter(Boolean);
  if (!ids.length) return;
  await restDelete(
    env,
    `team_access?user_id=eq.${encodeURIComponent(userId)}&team_id=in.(${ids.map(encodeURIComponent).join(",")})`
  );
}

async function deleteClubMember(env: ClubStaffEnv, clubId: string, userId: string) {
  await restDelete(
    env,
    `club_members?club_id=eq.${encodeURIComponent(clubId)}&user_id=eq.${encodeURIComponent(userId)}`
  );
}

async function deleteInvitedAccountIfUnused(env: ClubStaffEnv, userId: string) {
  const profile = await findProfileById(env, userId);
  if (!profile) return false;
  if (hasActiveLicense(profile) || (await hasClaimedPurchase(env, userId, profile.email || ""))) return false;
  if (await ownsAnyClub(env, userId)) return false;
  if (await hasAnyClubMembership(env, userId)) return false;
  if (await hasAnyTeamAccess(env, userId)) return false;

  const deleted = await deleteAuthUser(env, userId);
  if (deleted) return true;

  await restDelete(env, `profiles?id=eq.${encodeURIComponent(userId)}`).catch(() => undefined);
  return false;
}

function hasActiveLicense(profile: ProfileRow) {
  if (!profile.license_expires_at) return false;
  return Date.parse(profile.license_expires_at) > Date.now();
}

async function hasClaimedPurchase(env: ClubStaffEnv, userId: string, email: string) {
  const byProfile = await restSelect<{ stripe_session_id: string }>(
    env,
    `license_purchases?claimed_profile_id=eq.${encodeURIComponent(userId)}&status=eq.paid&select=stripe_session_id&limit=1`
  ).catch(() => []);
  if (byProfile.length) return true;
  if (!email) return false;
  const byEmail = await restSelect<{ stripe_session_id: string }>(
    env,
    `license_purchases?or=(account_email.eq.${encodeURIComponent(email)},email.eq.${encodeURIComponent(email)})&status=eq.paid&select=stripe_session_id&limit=1`
  ).catch(() => []);
  return byEmail.length > 0;
}

async function ownsAnyClub(env: ClubStaffEnv, userId: string) {
  const rows = await restSelect<{ id: string }>(
    env,
    `clubs?owner_id=eq.${encodeURIComponent(userId)}&archived_at=is.null&select=id&limit=1`
  );
  return rows.length > 0;
}

async function hasAnyClubMembership(env: ClubStaffEnv, userId: string) {
  const rows = await restSelect<{ club_id: string }>(
    env,
    `club_members?user_id=eq.${encodeURIComponent(userId)}&select=club_id&limit=1`
  );
  return rows.length > 0;
}

async function hasAnyTeamAccess(env: ClubStaffEnv, userId: string) {
  const rows = await restSelect<{ team_id: string }>(
    env,
    `team_access?user_id=eq.${encodeURIComponent(userId)}&select=team_id&limit=1`
  );
  return rows.length > 0;
}

async function deleteAuthUser(env: ClubStaffEnv, userId: string) {
  const base = supabaseBase(env);
  for (const segment of ["admin/users", "admin/user"]) {
    const response = await fetch(`${base}/auth/v1/${segment}/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: supabaseHeaders(env),
      body: JSON.stringify({ should_soft_delete: false }),
    });
    if (response.ok) return true;
    if (response.status !== 404) return false;
  }
  return false;
}

async function restSelect<T>(env: ClubStaffEnv, path: string): Promise<T[]> {
  const base = supabaseBase(env);
  const response = await fetch(`${base}/rest/v1/${path}`, { headers: supabaseHeaders(env) });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`supabase_select_failed:${response.status}:${details}`);
  }
  return (await response.json()) as T[];
}

async function restDelete(env: ClubStaffEnv, path: string) {
  const base = supabaseBase(env);
  const response = await fetch(`${base}/rest/v1/${path}`, {
    method: "DELETE",
    headers: supabaseHeaders(env, { Prefer: "return=minimal" }),
  });
  if (!response.ok) throw new Error(`supabase_delete_failed:${response.status}`);
}

function bearerToken(header: string | null) {
  const match = (header || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function supabaseBase(env: ClubStaffEnv) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("supabase_not_configured");
  return env.SUPABASE_URL.replace(/\/+$/, "");
}

function serviceKey(env: ClubStaffEnv) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("supabase_not_configured");
  return env.SUPABASE_SERVICE_ROLE_KEY;
}

function supabaseHeaders(env: ClubStaffEnv, extra: Record<string, string> = {}) {
  return {
    apikey: serviceKey(env),
    Authorization: `Bearer ${serviceKey(env)}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(),
    },
  });
}

function emptyCors() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
