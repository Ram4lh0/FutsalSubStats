import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const PACKAGE_ID = 'com.futsalsubstats.app';
export const PRODUCTS: Record<string, 'treinador' | 'clube'> = {
  trainer_annual: 'treinador',
  club_annual: 'clube',
};

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase service credentials are missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function base64Url(value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function decodeJwsPayload<T = Record<string, unknown>>(jws: string): T {
  const middle = jws.split('.')[1];
  if (!middle) throw new Error('Invalid signed payload');
  const normalized = middle.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(atob(padded)) as T;
}

function pemBytes(pem: string) {
  const raw = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  return Uint8Array.from(atob(raw), (char) => char.charCodeAt(0));
}

async function signedJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  key: CryptoKey,
  algorithm: AlgorithmIdentifier | RsaPssParams | EcdsaParams,
) {
  const input = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = new Uint8Array(await crypto.subtle.sign(algorithm, key, new TextEncoder().encode(input)));
  return `${input}.${base64Url(signature)}`;
}

async function appleToken() {
  const issuer = Deno.env.get('APPLE_ISSUER_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const privateKey = Deno.env.get('APPLE_PRIVATE_KEY');
  if (!issuer || !keyId || !privateKey) throw new Error('Apple server credentials are missing');
  const now = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return signedJwt(
    { alg: 'ES256', kid: keyId, typ: 'JWT' },
    { iss: issuer, iat: now, exp: now + 300, aud: 'appstoreconnect-v1', bid: PACKAGE_ID },
    key,
    { name: 'ECDSA', hash: 'SHA-256' },
  );
}

export interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  bundleId: string;
  appAccountToken?: string;
  expiresDate?: number;
  revocationDate?: number;
  offerType?: number;
  offerDiscountType?: string;
  environment?: string;
}

export async function fetchAppleTransaction(transactionId: string) {
  const token = await appleToken();
  for (const base of ['https://api.storekit.apple.com', 'https://api.storekit-sandbox.apple.com']) {
    const response = await fetch(`${base}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const body = await response.json();
      return decodeJwsPayload<AppleTransaction>(body.signedTransactionInfo);
    }
    if (response.status !== 404) throw new Error(`Apple verification failed (${response.status})`);
  }
  throw new Error('Apple transaction not found');
}

async function googleAccessToken() {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('Google service account is missing');
  const account = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    'pkcs8', pemBytes(account.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const assertion = await signedJwt(
    { alg: 'RS256', typ: 'JWT' },
    { iss: account.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 },
    key,
    'RSASSA-PKCS1-v1_5',
  );
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error(`Google authentication failed (${response.status})`);
  return (await response.json()).access_token as string;
}

export interface GoogleSubscription {
  subscriptionState: string;
  acknowledgementState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  testPurchase?: Record<string, never>;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{ productId: string; expiryTime?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean } }>;
}

export async function fetchGoogleSubscription(purchaseToken: string) {
  const access = await googleAccessToken();
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_ID}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers: { authorization: `Bearer ${access}` } },
  );
  if (!response.ok) throw new Error(`Google verification failed (${response.status})`);
  return { purchase: await response.json() as GoogleSubscription, access };
}

export async function acknowledgeGoogle(productId: string, purchaseToken: string, access: string) {
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_ID}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    { method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' }, body: '{}' },
  );
  if (!response.ok && response.status !== 409) throw new Error(`Google acknowledgement failed (${response.status})`);
}

export async function sha256(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function saveSubscription(input: {
  userId: string;
  platform: 'ios' | 'android';
  productId: string;
  originalId: string;
  latestId?: string;
  status: string;
  expiresAt?: string | null;
  autoRenews?: boolean | null;
  environment?: string | null;
  raw: unknown;
}) {
  if (!PRODUCTS[input.productId]) throw new Error('Unknown store product');
  const sb = adminClient();
  const { error } = await sb.from('store_subscriptions').upsert({
    user_id: input.userId,
    platform: input.platform,
    product_id: input.productId,
    original_transaction_id: input.originalId,
    latest_transaction_id: input.latestId || input.originalId,
    status: input.status,
    expires_at: input.expiresAt || null,
    auto_renews: input.autoRenews ?? null,
    environment: input.environment || null,
    raw: input.raw,
  }, { onConflict: 'platform,original_transaction_id' });
  if (error) throw error;
  const { error: recomputeError } = await sb.rpc('recompute_store_entitlement', { p_user: input.userId });
  if (recomputeError) throw recomputeError;
}

export function googleStatus(purchase: GoogleSubscription) {
  const map: Record<string, string> = {
    SUBSCRIPTION_STATE_PENDING: 'pending',
    SUBSCRIPTION_STATE_ACTIVE: 'active',
    SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'grace',
    SUBSCRIPTION_STATE_CANCELED: 'active',
    SUBSCRIPTION_STATE_EXPIRED: 'expired',
    SUBSCRIPTION_STATE_ON_HOLD: 'expired',
    SUBSCRIPTION_STATE_PAUSED: 'expired',
  };
  return map[purchase.subscriptionState] || 'expired';
}
