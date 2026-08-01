// lib/supabase/client.js
// Um único cliente para toda a app, criado no browser.
//
// A app é offline-first: o Supabase é o destino da sincronização, não a fonte de
// verdade durante o jogo. Por isso não há cliente de servidor nem render no
// servidor — tudo o que conta acontece no dispositivo do treinador.

import { createClient } from '@supabase/supabase-js';

let client = null;

/**
 * Limpa o valor que vem das variáveis de ambiente.
 *
 * Ao colar um valor no painel da Vercel é fácil trazer aspas, espaços ou uma
 * quebra de linha atrás. Uma aspa a mais no endereço bastava para o
 * `createClient` rebentar e levar a app inteira com ele.
 */
function limpo(valor) {
  return String(valor || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function urlValido(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function supabase() {
  if (client) return client;

  const url = limpo(process.env.NEXT_PUBLIC_SUPABASE_URL);
  // O painel do Supabase já chama "publishable key" ao que antes era a "anon
  // key". São a mesma coisa para o que a app precisa; aceitam-se os dois nomes
  // para o ficheiro copiado do painel funcionar tal como vem.
  const key = limpo(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Sem configuração a app continua a funcionar, só que guardada apenas no
  // dispositivo. É o que permite usá-la num pavilhão antes de haver conta.
  if (!url || !key) return null;

  // Configuração errada não pode deitar a app abaixo: um jogo a decorrer vale
  // mais que a sincronização. Avisa-se na consola e continua-se sem servidor.
  if (!urlValido(url)) {
    console.error(
      `NEXT_PUBLIC_SUPABASE_URL não é um endereço válido: ${JSON.stringify(url)}. ` +
        'Deve ser algo como https://abcdefgh.supabase.co — a app continua a guardar tudo neste dispositivo.'
    );
    return null;
  }

  try {
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'futsal.auth',
      },
    });
  } catch (err) {
    console.error('Não foi possível ligar ao Supabase:', err?.message || err);
    return null;
  }
  return client;
}

/** Há Supabase configurado e utilizável? Decide se se mostra o ecrã de entrada. */
export function hasRemote() {
  const url = limpo(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = limpo(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  return Boolean(url && key && urlValido(url));
}
