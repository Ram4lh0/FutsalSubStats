import { PRODUCTS, adminClient, fetchGoogleSubscription, googleStatus, json, saveSubscription } from '../_shared/store.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  try {
    const envelope = await req.json();
    const encoded = envelope.message?.data;
    if (!encoded) return json({ received: true });
    const event = JSON.parse(atob(String(encoded).replace(/-/g, '+').replace(/_/g, '/')));
    const token = event.subscriptionNotification?.purchaseToken;
    if (!token) return json({ received: true });

    const sb = adminClient();
    const { data: known, error } = await sb.from('store_subscriptions')
      .select('user_id').eq('platform', 'android').eq('original_transaction_id', token).maybeSingle();
    if (error) throw error;
    if (!known?.user_id) throw new Error('Unknown Google purchase token');

    const { purchase } = await fetchGoogleSubscription(token);
    const item = purchase.lineItems?.find((entry) => PRODUCTS[entry.productId]);
    if (!item) throw new Error('Unknown Google product');
    await saveSubscription({
      userId: known.user_id, platform: 'android', productId: item.productId,
      originalId: token, latestId: purchase.latestOrderId || token,
      status: googleStatus(purchase), expiresAt: item.expiryTime || null,
      autoRenews: item.autoRenewingPlan?.autoRenewEnabled,
      environment: purchase.testPurchase ? 'Sandbox' : 'Production', raw: purchase,
    });
    return json({ received: true });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Notification failed' }, 400);
  }
});

