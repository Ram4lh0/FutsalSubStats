import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateStoreConfig, verifyStoreOutput } from '../tools/check-store-config.mjs';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://bkfkpfhcysuyiotwkaty.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

test('release rejects missing, wrong-project and privileged configuration', () => {
  assert.throws(() => validateStoreConfig({}), /NEXT_PUBLIC_SUPABASE_URL/);
  assert.throws(() => validateStoreConfig({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' }), /NEXT_PUBLIC_SUPABASE_URL/);
  assert.throws(() => validateStoreConfig({ ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' }), /public client key/);
  assert.throws(() => validateStoreConfig({ ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test' }), /public client key/);
  assert.equal(validateStoreConfig(env).key, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
});

test('output check rejects an offline export and accepts embedded public configuration', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'futsal-store-config-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const chunks = join(directory, '_next', 'static', 'chunks');
  mkdirSync(chunks, { recursive: true });
  writeFileSync(join(chunks, 'client.js'), 'const url = undefined;');
  const config = validateStoreConfig(env);
  assert.throws(() => verifyStoreOutput(directory, config), /missing/);
  writeFileSync(join(chunks, 'client.js'), `const config = ${JSON.stringify(config)};`);
  assert.doesNotThrow(() => verifyStoreOutput(directory, config));
});
