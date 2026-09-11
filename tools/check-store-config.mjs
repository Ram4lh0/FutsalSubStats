import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import nextEnv from '@next/env';

export function validateStoreConfig(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (url !== 'https://bkfkpfhcysuyiotwkaty.supabase.co') {
    throw new Error('Release requires NEXT_PUBLIC_SUPABASE_URL for Futsal Subs & Stats.');
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key || '')) {
    throw new Error('Release requires NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (public client key).');
  }
  return { url, key };
}

export function verifyStoreOutput(directory, config) {
  const chunks = join(directory, '_next', 'static', 'chunks');
  const files = readdirSync(chunks, { recursive: true }).filter((file) => file.endsWith('.js'));
  // The client needs both values in its compiled module, not just in CI variables.
  const configured = files.some((file) => {
    const source = readFileSync(join(chunks, file), 'utf8');
    return source.includes(config.url) && source.includes(config.key);
  });
  if (!configured) throw new Error('Exported JavaScript is missing the Supabase client configuration.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    nextEnv.loadEnvConfig(process.cwd(), false);
    const config = validateStoreConfig(process.env);
    const outputIndex = process.argv.indexOf('--output');
    if (outputIndex >= 0) {
      const output = process.argv[outputIndex + 1];
      if (!output) throw new Error('--output requires a directory.');
      verifyStoreOutput(output, config);
    }
    console.log(outputIndex >= 0 ? 'Supabase configuration verified in exported JavaScript.' : 'Supabase release configuration is present.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
