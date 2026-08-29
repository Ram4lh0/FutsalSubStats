import {
  APPLE_BUNDLE_ID, PRODUCTS, acknowledgeGoogle, adminClient, fetchAppleTransaction,
  fetchGoogleSubscription, googleStatus, json, preflight, saveSubscription, sha256,
} from '../_shared/store.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  try {
    const authorization = req.headers.get('authorization') || '';
    const sb = adminClient();
    const { data: { user }, error } = await sb.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (error || !user) return json({ error: 'Authentication required' }, 401);

    const body = await req.json();
    if (body.platform === 'ios') {
      const transaction = await fetchAppleTransaction(String(body.transactionId || ''));
      if (transaction.bundleId !== APPLE_BUNDLE_ID || !PRODUCTS[transaction.productId]) throw new Error('Apple product does not belong to this app');
      if (transaction.appAccountToken?.toLowerCase() !== user.id.toLowerCase()) throw new Error('Apple purchase belongs to another account');
      const expiresAt = transaction.expiresDate ? new Date(transaction.expiresDate).toISOString() : null;
      const active = !transaction.revocationDate && (!expiresAt || new Date(expiresAt) > new Date());
      const trial = transaction.offerDiscountType === 'FREE_TRIAL';
      await saveSubscription({
        userId: user.id, platform: 'ios', productId: transaction.productId,
        originalId: transaction.originalTransactionId, latestId: transaction.transactionId,
        status: transaction.revocationDate ? 'revoked' : active ? (trial ? 'trial' : 'active') : 'expired',
        expiresAt, environment: transaction.environment, raw: transaction,
      });
      return json({ valid: active, plan: PRODUCTS[transaction.productId], expiresAt });
    }

    if (body.platform === 'android') {
      const token = String(body.purchaseToken || '');
      const { purchase, access } = await fetchGoogleSubscription(token);
      const item = purchase.lineItems?.find((entry) => PRODUCTS[entry.productId]);
      if (!item) throw new Error('Google product does not belong to this app');
      const expected = await sha256(user.id);
      if (purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId !== expected) throw new Error('Google purchase belongs to another account');
      const status = googleStatus(purchase);
      await saveSubscription({
        userId: user.id, platform: 'android', productId: item.productId,
        originalId: token, latestId: purchase.latestOrderId || token, status,
        expiresAt: item.expiryTime || null, autoRenews: item.autoRenewingPlan?.autoRenewEnabled,
        environment: purchase.testPurchase ? 'Sandbox' : 'Production', raw: purchase,
      });
      if (purchase.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') {
        await acknowledgeGoogle(item.productId, token, access);
      }
      return json({ valid: ['trial', 'active', 'grace'].includes(status), plan: PRODUCTS[item.productId], expiresAt: item.expiryTime });
    }

    return json({ error: 'Unsupported platform' }, 400);
  } catch (error) {
    console.error(error);
    return json({
      valid: false,
      error: error instanceof Error ? error.message : 'Purchase validation failed',
    });
  }
});
