import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  nativeStoreAvailable, productIdsForPlan, productForPlan, purchasePlan, storeProducts,
} from '../src/lib/store.js';

afterEach(() => { delete globalThis.Capacitor; });

function native(platform = 'ios', plugin) {
  globalThis.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => platform,
    Plugins: plugin ? { FutsalBilling: plugin } : {},
  };
}

test('native iOS without billing is not misdiagnosed as a PWA or missing products', async () => {
  native();
  assert.equal(nativeStoreAvailable(), true);
  await assert.rejects(purchasePlan('clube', 'account'), {
    code: 'BILLING_PLUGIN_MISSING',
    message: 'As compras não estão disponíveis nesta versão. Atualiza a aplicação pela loja.',
  });
});

test('web purchases fail clearly before trying to use an undefined product', async () => {
  assert.equal(nativeStoreAvailable(), false);
  assert.deepEqual(await storeProducts(), []);
  await assert.rejects(purchasePlan('clube', 'account'), { code: 'NATIVE_APP_REQUIRED' });
});

test('a standalone PWA remains web even when Capacitor web helpers exist', async () => {
  globalThis.Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };
  assert.equal(nativeStoreAvailable(), false);
  await assert.rejects(purchasePlan('clube', 'account'), { code: 'NATIVE_APP_REQUIRED' });
});

test('iOS requests exactly the approved Apple product identifiers', async () => {
  const requests = [];
  const products = [{ id: 'Treinador' }, { id: 'Clube' }];
  native('ios', { products: async ({ ids }) => { requests.push(ids); return { products }; } });
  assert.deepEqual(await storeProducts(), products);
  assert.deepEqual(requests, [['Treinador', 'Clube']]);
  assert.deepEqual(productIdsForPlan('clube'), ['Clube']);
  assert.deepEqual(productIdsForPlan('treinador'), ['Treinador']);
  assert.deepEqual(productIdsForPlan('invalid'), []);
  assert.equal(productForPlan('clube', products), products[1]);
});

test('Android retains its existing product aliases', () => {
  native('android');
  assert.deepEqual(productIdsForPlan('clube'), ['licenca_clube_anual', 'Clube', 'club_annual']);
  assert.equal(productForPlan('clube', [{ id: 'club_annual' }]).id, 'club_annual');
});

test('purchase uses the returned Apple product and passes the account to native StoreKit', async () => {
  const calls = [];
  const cancelled = Object.assign(new Error('Purchase cancelled'), { code: 'USER_CANCELED' });
  native('ios', {
    products: async ({ ids }) => { calls.push(ids); return { products: [{ id: 'Clube' }] }; },
    purchase: async (options) => { calls.push(options); throw cancelled; },
  });
  await assert.rejects(purchasePlan('clube', 'user-uuid'), (error) => error === cancelled);
  assert.deepEqual(calls, [['Clube'], { productId: 'Clube', accountId: 'user-uuid' }]);
});

test('empty Apple catalog is distinct from a missing native plugin', async () => {
  let attempts = 0;
  native('ios', { products: async () => { attempts++; return { products: [] }; } });
  await assert.rejects(purchasePlan('clube', 'account'), { code: 'PRODUCTS_NOT_FOUND' });
  assert.equal(attempts, 3);
});

test('StoreKit request failures are distinct from an empty catalog', async () => {
  native('ios', { products: async () => { throw new Error('offline'); } });
  await assert.rejects(purchasePlan('clube', 'account'), { code: 'PRODUCTS_LOAD_FAILED' });
});

test('a transient StoreKit error can recover on retry', async () => {
  let attempts = 0;
  const pending = Object.assign(new Error('Purchase is pending'), { code: 'PENDING' });
  native('ios', {
    products: async () => {
      if (++attempts === 1) throw new Error('offline');
      return { products: [{ id: 'Clube' }] };
    },
    purchase: async () => { throw pending; },
  });
  await assert.rejects(purchasePlan('clube', 'account'), (error) => error === pending);
  assert.equal(attempts, 2);
});

test('both iOS entry points use the bridge that registers the billing instance', () => {
  const swift = readFileSync(new URL('../ios/App/App/SceneDelegate.swift', import.meta.url), 'utf8');
  const storyboard = readFileSync(new URL('../ios/App/App/Base.lproj/Main.storyboard', import.meta.url), 'utf8');
  assert.match(swift, /registerPluginInstance\(FutsalBillingPlugin\(\)\)/);
  assert.doesNotMatch(swift, /registerPluginType\(FutsalBillingPlugin/);
  assert.match(swift, /rootViewController = FutsalBridgeViewController\(\)/);
  assert.match(storyboard, /customClass="FutsalBridgeViewController" customModule="App"/);
  assert.match(swift, /\.appAccountToken\(accountId\)/);
});
