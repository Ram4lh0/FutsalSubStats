import { PRODUCTS, decodeJwsPayload, fetchAppleTransaction, json, saveSubscription } from '../_shared/store.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  try {
    const { signedPayload } = await req.json();
    const notification = decodeJwsPayload<any>(signedPayload);
    if (notification.notificationType === 'TEST') return json({ received: true });
    const signedTransaction = notification.data?.signedTransactionInfo;
    if (!signedTransaction) return json({ received: true });
    const hinted = decodeJwsPayload<any>(signedTransaction);
    const transaction = await fetchAppleTransaction(String(hinted.transactionId));
    if (!transaction.appAccountToken || !PRODUCTS[transaction.productId]) throw new Error('Unlinked Apple transaction');
    const expiresAt = transaction.expiresDate ? new Date(transaction.expiresDate).toISOString() : null;
    const active = !transaction.revocationDate && (!expiresAt || new Date(expiresAt) > new Date());
    await saveSubscription({
      userId: transaction.appAccountToken, platform: 'ios', productId: transaction.productId,
      originalId: transaction.originalTransactionId, latestId: transaction.transactionId,
      status: transaction.revocationDate ? 'revoked' : active ? 'active' : 'expired',
      expiresAt, environment: transaction.environment, raw: { notification, transaction },
    });
    return json({ received: true });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Notification failed' }, 400);
  }
});

