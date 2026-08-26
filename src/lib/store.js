import { supabase } from './supabase/client.js';

export const STORE_PRODUCTS = {
  treinador: 'trainer_annual',
  clube: 'club_annual',
};

export const LICENSE_PRICES = {
  treinador: { old: '45€', current: '30€/ano' },
  clube: { old: '129€', current: '100€/ano' },
};

export function planPrice(plan, product) {
  const fallback = LICENSE_PRICES[plan];
  return {
    old: fallback?.old || '',
    current: product?.price ? `${product.price}/ano` : fallback?.current || '',
  };
}

function billingPlugin() {
  const plugin = globalThis?.Capacitor?.Plugins?.FutsalBilling;
  if (!plugin) throw new Error('As compras só estão disponíveis na aplicação instalada.');
  return plugin;
}

export function nativeStoreAvailable() {
  const cap = globalThis?.Capacitor;
  return Boolean(cap?.isNativePlatform?.() || (cap?.getPlatform?.() && cap.getPlatform() !== 'web'));
}

export async function storeProducts() {
  if (!nativeStoreAvailable()) return [];
  const { products = [] } = await billingPlugin().products({ ids: Object.values(STORE_PRODUCTS) });
  return products;
}

async function validatePurchase(purchase) {
  const sb = supabase();
  if (!sb) throw new Error('Servidor indisponível. A compra não foi atribuída.');
  const platform = globalThis.Capacitor?.getPlatform?.();
  const { data, error } = await sb.functions.invoke('verify-store-purchase', {
    body: { platform, ...purchase },
  });
  if (error || !data?.valid) throw new Error(error?.message || data?.error || 'Compra não validada.');
  if (platform === 'ios' && purchase.transactionId) {
    await billingPlugin().finish({ transactionId: purchase.transactionId });
  }
  return data;
}

export async function purchasePlan(plan, userId) {
  const productId = STORE_PRODUCTS[plan];
  if (!productId || !userId) throw new Error('Plano ou conta inválidos.');
  const purchase = await billingPlugin().purchase({ productId, accountId: userId });
  return validatePurchase(purchase);
}

export async function restorePurchases(userId) {
  if (!userId) throw new Error('Conta inválida.');
  const { purchases = [] } = await billingPlugin().restore({ accountId: userId });
  let restored = 0;
  for (const purchase of purchases) {
    await validatePurchase(purchase);
    restored += 1;
  }
  return restored;
}
