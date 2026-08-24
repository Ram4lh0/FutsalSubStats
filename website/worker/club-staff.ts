export interface ClubStaffEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_INVITE_REDIRECT_URL?: string;
}

type AuthUser = { id: string; email?: string | null };
type ProfileRow = { id: string; email: string | null; licenca?: string | null };

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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clubId)) {
    return json({ error: "invalid_club" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "invalid_email" }, 400);

  const userToken = bearerToken(request.headers.get("authorization"));
  if (!userToken) return json({ error: "missing_session" }, 401);

  const actor = await userFromToken(env, userToken);
  if (!actor?.id) return json({ error: "invalid_session" }, 401);

  const actorProfile = await findProfileById(env, actor.id);
  if (actorProfile?.licenca !== "clube") return json({ error: "club_license_required" }, 403);

  const ownsClub = await userOwnsClub(env, actor.id, clubId);
  if (!ownsClub) return json({ error: "not_club_owner" }, 403);

  const account = await inviteOrFindCoach(env, email, clubId);
  if (!account?.id) return json({ error: "invite_failed" }, 502);

  await ensureCoachProfile(env, account.id, email);
  await associateCoach(env, clubId, account.id);

  return json({
    ok: true,
    email,
    userId: account.id,
    newAccount: account.newAccount,
  });
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
    `profiles?id=eq.${encodeURIComponent(id)}&select=id,email,licenca&limit=1`
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

async function associateCoach(env: ClubStaffEnv, clubId: string, userId: string) {
  const base = supabaseBase(env);
  const response = await fetch(`${base}/rest/v1/club_members?on_conflict=club_id,user_id`, {
    method: "POST",
    headers: supabaseHeaders(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ club_id: clubId, user_id: userId }),
  });
  if (!response.ok) throw new Error(`club_member_upsert_failed:${response.status}`);
}

async function restSelect<T>(env: ClubStaffEnv, path: string): Promise<T[]> {
  const base = supabaseBase(env);
  const response = await fetch(`${base}/rest/v1/${path}`, { headers: supabaseHeaders(env) });
  if (!response.ok) throw new Error(`supabase_select_failed:${response.status}`);
  return (await response.json()) as T[];
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
