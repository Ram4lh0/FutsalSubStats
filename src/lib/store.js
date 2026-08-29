import { supabase } from './supabase/client.js';

export const STORE_PRODUCTS = {
  treinador: 'licenca_treinador_anual',
  clube: 'licenca_clube_anual',
};

export const STORE_PRODUCT_ALIASES = {
  treinador: ['licenca_treinador_anual', 'Treinador', 'trainer_annual'],
  clube: ['licenca_clube_anual', 'Clube', 'club_annual'],
};

export const LICENSE_PRICES = {
  treinador: { old: '45€', current: '35€/ano' },
  clube: { old: '145€', current: '119,99€/ano' },
};

const PRODUCT_LOAD_ATTEMPTS = 3;

function uniqueProductIds() {
  return [...new Set(Object.values(STORE_PRODUCT_ALIASES).flat())];
}

export function productIdsForPlan(plan) {
  return STORE_PRODUCT_ALIASES[plan] || (STORE_PRODUCTS[plan] ? [STORE_PRODUCTS[plan]] : []);
}

export function productForPlan(plan, products = []) {
  const ids = productIdsForPlan(plan);
  return ids.map((id) => products.find((product) => product.id === id)).find(Boolean) || null;
}

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadProducts(ids) {
  const { products = [] } = await billingPlugin().products({ ids });
  return products;
}

export async function storeProducts() {
  if (!nativeStoreAvailable()) return [];
  try {
    return await loadProducts(uniqueProductIds());
  } catch {
    return [];
  }
}

async function prepararProduto(plan) {
  if (!nativeStoreAvailable()) return;
  const ids = productIdsForPlan(plan);
  let lastError = null;
  for (let tentativa = 1; tentativa <= PRODUCT_LOAD_ATTEMPTS; tentativa += 1) {
    try {
      const products = await loadProducts(ids);
      const product = productForPlan(plan, products);
      if (product) return product;
    } catch (error) {
      lastError = error;
    }
    if (tentativa < PRODUCT_LOAD_ATTEMPTS) await wait(300 * tentativa);
  }
  const detalhe = lastError?.message ? ` (${lastError.message})` : '';
  throw new Error(
    `A loja não devolveu os produtos ${ids.join(', ')}. Confirma que a subscrição está ativa na loja e que esta conta tem acesso ao teste.${detalhe}`
  );
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
  if (!STORE_PRODUCTS[plan] || !userId) throw new Error('Plano ou conta inválidos.');
  const product = await prepararProduto(plan);
  const productId = product.id;
  let purchase;
  try {
    purchase = await billingPlugin().purchase({ productId, accountId: userId });
  } catch (error) {
    if (!/Product details must be loaded/i.test(error?.message || '')) throw error;
    await prepararProduto(plan);
    purchase = await billingPlugin().purchase({ productId, accountId: userId });
  }
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
