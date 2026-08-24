type LicensePlan = "treinador" | "clube";

export interface BillingEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_TREINADOR_ANUAL?: string;
  STRIPE_PRICE_CLUBE_ANUAL?: string;
  STRIPE_SUCCESS_URL?: string;
  STRIPE_CANCEL_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_INVITE_REDIRECT_URL?: string;
}

type StripeEvent = {
  id: string;
  type: string;
  data?: { object?: StripeCheckoutSession };
};

type StripeCheckoutSession = {
  id: string;
  amount_total?: number | null;
  currency?: string | null;
  customer?: string | null;
  customer_email?: string | null;
  customer_details?: {
    email?: string | null;
    name?: string | null;
    tax_ids?: Array<{ value?: string | null }>;
  } | null;
  metadata?: Record<string, string | undefined> | null;
  payment_intent?: string | null;
  payment_status?: string | null;
};

type ProfileRow = { id: string; email: string | null; licenca?: LicensePlan | null };
type InvitedUser = { id?: string; email?: string | null };
type PurchaseRow = {
  stripe_session_id: string;
  email: string;
  account_email?: string | null;
  plan: LicensePlan;
  status: "pending" | "paid" | "unmatched" | "failed";
  license_expires_at?: string | null;
};

const STRIPE_API = "https://api.stripe.com/v1";
const ALLOWED_PLANS = new Set<LicensePlan>(["treinador", "clube"]);

export async function handleStripeCheckout(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method === "OPTIONS") return emptyCors();
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { plan?: string; email?: string; successUrl?: string; cancelUrl?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const plan = normalizarPlano(body.plan);
  if (!plan) return json({ error: "invalid_plan" }, 400);

  const price = plan === "clube" ? env.STRIPE_PRICE_CLUBE_ANUAL : env.STRIPE_PRICE_TREINADOR_ANUAL;
  const secret = env.STRIPE_SECRET_KEY;
  if (!secret || !price) return json({ error: "stripe_not_configured" }, 500);

  const origin = new URL(request.url).origin;
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("line_items[0][price]", price);
  params.set("line_items[0][quantity]", "1");
  params.set(
    "success_url",
    safeReturnUrl(body.successUrl) ||
      env.STRIPE_SUCCESS_URL ||
      `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}#licenses`
  );
  params.set("cancel_url", safeReturnUrl(body.cancelUrl) || env.STRIPE_CANCEL_URL || `${origin}/?checkout=cancel#licenses`);
  params.set("billing_address_collection", "required");
  params.set("customer_creation", "always");
  params.set("tax_id_collection[enabled]", "true");
  params.set("metadata[plan]", plan);
  params.set("metadata[license_end_policy]", "season_june_30");
  params.set("locale", "pt");
  if (body.email && /^\S+@\S+\.\S+$/.test(body.email)) params.set("customer_email", body.email);

  const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return json({ error: "stripe_checkout_failed", details: data }, 502);

  return json({ url: data.url });
}

export async function handleStripeWebhook(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: "webhook_not_configured" }, 500);

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const verified = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!verified) return json({ error: "invalid_signature" }, 400);

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_event_json" }, 400);
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    const session = event.data?.object;
    if (session?.id) await processCheckoutSession(env, session, event.type, rawBody);
  }

  return json({ received: true });
}

export async function handleStripeClaim(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method === "OPTIONS") return emptyCors();
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { sessionId?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const sessionId = String(body.sessionId || "").trim();
  const accountEmail = String(body.email || "").trim().toLowerCase();
  if (!/^cs_(test|live)_[A-Za-z0-9_]+$/.test(sessionId)) return json({ error: "invalid_session" }, 400);
  if (!/^\S+@\S+\.\S+$/.test(accountEmail)) return json({ error: "invalid_email" }, 400);

  let purchase = await findPurchaseBySession(env, sessionId);
  if (!purchase || purchase.status === "pending") {
    const session = await retrieveCheckoutSession(env, sessionId);
    if (!session || session.payment_status !== "paid") return json({ error: "payment_not_confirmed" }, 409);
    await processCheckoutSession(env, session, "checkout.session.completed", JSON.stringify({ type: "checkout.session.completed", data: { object: session } }));
    purchase = await findPurchaseBySession(env, sessionId);
  }

  if (!purchase || purchase.status === "failed") return json({ error: "purchase_not_available" }, 404);
  if (purchase.status === "paid" && purchase.account_email && purchase.account_email.toLowerCase() !== accountEmail) {
    return json({ error: "already_claimed" }, 409);
  }

  const expiresAt = purchase.license_expires_at || seasonLicenseEnd().toISOString();
  const account = await ensureAccountForLicenseEmail(env, accountEmail, purchase.plan);
  if (!account) return json({ error: "invite_failed" }, 502);

  await patchProfile(env, account.id, {
    licenca: purchase.plan,
    license_expires_at: expiresAt,
    stripe_last_checkout_session_id: sessionId,
  });
  await markPurchaseClaimed(env, sessionId, accountEmail, account.id, expiresAt);

  return json({
    ok: true,
    invited: account.invited,
    email: accountEmail,
    plan: purchase.plan,
    license_expires_at: expiresAt,
  });
}

async function processCheckoutSession(env: BillingEnv, session: StripeCheckoutSession, eventType: string, raw: string) {
  const plan = normalizarPlano(session.metadata?.plan);
  const email = (session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
  if (!plan || !email) {
    await upsertPurchase(env, session, {
      email: email || "sem-email@stripe.local",
      plan: plan || "treinador",
      status: "failed",
      raw,
    });
    return;
  }

  if (eventType === "checkout.session.async_payment_failed") {
    await upsertPurchase(env, session, { email, plan, status: "failed", raw });
    return;
  }

  if (session.payment_status !== "paid") {
    await upsertPurchase(env, session, { email, plan, status: "pending", raw });
    return;
  }

  const expiresAt = seasonLicenseEnd().toISOString();
  await upsertPurchase(env, session, { email, plan, status: "unmatched", expiresAt, raw });
}

async function findProfileByEmail(env: BillingEnv, email: string): Promise<ProfileRow | null> {
  const base = supabaseBase(env);
  const response = await fetch(`${base}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,email,licenca&limit=1`, {
    headers: supabaseHeaders(env),
  });
  if (!response.ok) throw new Error(`profiles lookup failed: ${response.status}`);
  const rows = (await response.json()) as ProfileRow[];
  return rows[0] || null;
}

async function ensureAccountForLicenseEmail(env: BillingEnv, email: string, plan: LicensePlan) {
  const profile = await findProfileByEmail(env, email);
  if (profile) return { id: profile.id, email: profile.email || email, invited: false };

  const invited = await inviteUserByEmail(env, email, null, plan);
  if (!invited?.id) return null;
  return { id: invited.id, email: invited.email || email, invited: true };
}

async function inviteUserByEmail(env: BillingEnv, email: string, name: string | null, plan: LicensePlan): Promise<InvitedUser | null> {
  const base = supabaseBase(env);
  const url = new URL(`${base}/auth/v1/invite`);
  if (env.SUPABASE_INVITE_REDIRECT_URL) url.searchParams.set("redirect_to", env.SUPABASE_INVITE_REDIRECT_URL);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: supabaseHeaders(env),
    body: JSON.stringify({
      email,
      data: {
        name: name || email,
        licenca: plan,
        origem: "stripe_checkout",
      },
    }),
  });

  if (!response.ok) {
    console.warn(`invite failed for ${email}: ${response.status}`);
    return null;
  }
  return (await response.json()) as InvitedUser;
}

async function retrieveCheckoutSession(env: BillingEnv, sessionId: string): Promise<StripeCheckoutSession | null> {
  if (!env.STRIPE_SECRET_KEY) throw new Error("stripe_not_configured");
  const response = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  if (!response.ok) return null;
  return (await response.json()) as StripeCheckoutSession;
}

async function findPurchaseBySession(env: BillingEnv, sessionId: string): Promise<PurchaseRow | null> {
  const base = supabaseBase(env);
  const response = await fetch(
    `${base}/rest/v1/license_purchases?stripe_session_id=eq.${encodeURIComponent(sessionId)}&select=stripe_session_id,email,account_email,plan,status,license_expires_at&limit=1`,
    { headers: supabaseHeaders(env) }
  );
  if (!response.ok) throw new Error(`purchase lookup failed: ${response.status}`);
  const rows = (await response.json()) as PurchaseRow[];
  return rows[0] || null;
}

async function markPurchaseClaimed(env: BillingEnv, sessionId: string, accountEmail: string, profileId: string, expiresAt: string) {
  const base = supabaseBase(env);
  const response = await fetch(`${base}/rest/v1/license_purchases?stripe_session_id=eq.${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: supabaseHeaders(env, { Prefer: "return=minimal" }),
    body: JSON.stringify({
      account_email: accountEmail,
      claimed_profile_id: profileId,
      claimed_at: new Date().toISOString(),
      license_expires_at: expiresAt,
      status: "paid",
    }),
  });
  if (!response.ok) throw new Error(`purchase claim failed: ${response.status}`);
}

async function patchProfile(env: BillingEnv, id: string, payload: Record<string, unknown>) {
  const base = supabaseBase(env);
  const response = await fetch(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: supabaseHeaders(env, { Prefer: "return=minimal" }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`profile update failed: ${response.status}`);
}

async function upsertPurchase(
  env: BillingEnv,
  session: StripeCheckoutSession,
  options: {
    email: string;
    plan: LicensePlan;
    status: "pending" | "paid" | "unmatched" | "failed";
    expiresAt?: string;
    raw: string;
  }
) {
  const existing = await findPurchaseBySession(env, session.id).catch(() => null);
  if (existing?.status === "paid" && options.status !== "failed") return;

  const base = supabaseBase(env);
  const customerTaxId = session.customer_details?.tax_ids?.find((taxId) => taxId?.value)?.value || null;
  const payload = {
    stripe_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent || null,
    stripe_customer_id: session.customer || null,
    email: options.email,
    plan: options.plan,
    status: options.status,
    amount_total: session.amount_total ?? null,
    currency: session.currency || null,
    customer_name: session.customer_details?.name || null,
    customer_tax_id: customerTaxId,
    license_expires_at: options.expiresAt || null,
    raw: JSON.parse(options.raw),
  };

  const response = await fetch(`${base}/rest/v1/license_purchases?on_conflict=stripe_session_id`, {
    method: "POST",
    headers: supabaseHeaders(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`purchase upsert failed: ${response.status}`);
}

function supabaseBase(env: BillingEnv) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("supabase_not_configured");
  return env.SUPABASE_URL.replace(/\/+$/, "");
}

function supabaseHeaders(env: BillingEnv, extra: Record<string, string> = {}) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("supabase_not_configured");
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function normalizarPlano(value: unknown): LicensePlan | null {
  if (value !== "treinador" && value !== "clube") return null;
  return ALLOWED_PLANS.has(value) ? value : null;
}

function safeReturnUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function seasonLicenseEnd(now = new Date()) {
  const year = now.getUTCFullYear();
  let end = new Date(Date.UTC(year, 5, 30, 23, 59, 59, 999));
  if (now.getTime() > end.getTime()) {
    end = new Date(Date.UTC(year + 1, 5, 30, 23, 59, 59, 999));
  }
  return end;
}

async function verifyStripeSignature(body: string, header: string | null, secret: string) {
  if (!header) return false;
  const pieces = header.split(",").map((part) => part.trim().split("="));
  const timestamp = pieces.find(([key]) => key === "t")?.[1];
  const signatures = pieces.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length) return false;

  const signedAt = Number(timestamp) * 1000;
  if (!Number.isFinite(signedAt) || Math.abs(Date.now() - signedAt) > 5 * 60 * 1000) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
  const expected = toHex(new Uint8Array(digest));
  return signatures.some((candidate) => timingSafeEqualHex(candidate, expected));
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string) {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
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
    "Access-Control-Allow-Headers": "Content-Type, Stripe-Signature",
  };
}
