// tools/chave-de-servico.mjs — o cliente com privilégios totais, e as guardas
// que impedem os enganos que já aconteceram.
//
// A `SUPABASE_SERVICE_ROLE_KEY` ignora **toda** a segurança por linha: com ela
// lê-se e apaga-se a base de dados inteira, de qualquer conta. Nunca entra na
// app, nunca entra no repositório, nunca entra numa variável `NEXT_PUBLIC_`.
// Vive na sessão da consola de quem publica, e só enquanto publica:
//
//   $env:SUPABASE_SERVICE_ROLE_KEY = "eyJhbGci…"
//
// Isto estava escrito dentro do `publicar-bundle.mjs`. Saiu para aqui quando
// apareceu um segundo comando a precisar do mesmo: duas cópias das mesmas
// guardas divergem, e são precisamente as guardas que não podem divergir.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

/**
 * Lê o `.env.local` — mas só as variáveis públicas.
 *
 * O ficheiro é lido pelo Next e por mais ninguém: um script solto de Node não
 * sabe que existe. O endereço do Supabase está lá, à frente dos olhos, e sem
 * isto era preciso escrevê-lo outra vez à mão na consola.
 *
 * O `NEXT_PUBLIC_` na condição não é decoração: é a linha que separa o que pode
 * viver num ficheiro do que não pode. Essas variáveis já vão dentro da app.
 */
export function lerEnvLocal(raiz) {
  const caminho = join(raiz, '.env.local');
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, nome, bruto] = m;
    if (!nome.startsWith('NEXT_PUBLIC_')) continue;
    if (process.env[nome]) continue;
    process.env[nome] = bruto.trim().replace(/^['"]|['"]$/g, '');
  }
}

/**
 * O papel que vai escrito no meio do próprio símbolo, em texto simples.
 *
 * As duas chaves do Supabase são visualmente iguais e estão lado a lado no
 * painel. Trocá-las é natural — e o erro que se leva a seguir não ajuda nada: a
 * `anon` obedece à segurança por linha e o que aparece é um "violates row-level
 * security policy" que não faz lembrar nenhuma chave trocada.
 */
function papelDaChave(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role || null;
  } catch {
    return null; // `sb_secret_…` não é um JWT e não tem nada para ler
  }
}

/**
 * Devolve um cliente do Supabase com a chave de serviço, ou termina o processo
 * com uma explicação. Nunca devolve um cliente meio configurado.
 */
export function clienteAdmin(raiz) {
  lerEnvLocal(raiz);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  // Um ficheiro com a chave lá dentro é a única falha aqui que não se desfaz:
  // basta um `git add -f` distraído, ou mandar o ficheiro a alguém.
  if (existsSync(join(raiz, '.env.local'))) {
    const bruto = readFileSync(join(raiz, '.env.local'), 'utf8');
    if (/^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S/m.test(bruto)) {
      falhar(
        'A SUPABASE_SERVICE_ROLE_KEY está escrita no `.env.local`. Tira-a de lá.',
        '',
        'Essa chave ignora toda a segurança por linha. Num ficheiro, mais cedo ou',
        'mais tarde vai parar a sítio nenhum de bom. O sítio dela é a sessão da',
        'consola, e só enquanto a usas:',
        '  $env:SUPABASE_SERVICE_ROLE_KEY = "eyJhbGci…"'
      );
    }
  }

  if (!url || !chave) {
    falhar(
      'Faltam variáveis de ambiente.',
      url ? '' : '  NEXT_PUBLIC_SUPABASE_URL   — não está no ambiente nem no `.env.local`',
      chave ? '' : '  SUPABASE_SERVICE_ROLE_KEY  — tem de ser posta à mão nesta consola',
      '',
      'Em PowerShell, com a chave a sério (não este texto):',
      '  $env:SUPABASE_SERVICE_ROLE_KEY = "eyJhbGci…"',
      '',
      'Vai buscá-la a Supabase → Project Settings → API Keys → `service_role`.'
    );
  }

  if (!/^(eyJ[\w-]*\.[\w-]+\.[\w-]+|sb_secret_[\w-]+)$/.test(chave)) {
    falhar(
      `A SUPABASE_SERVICE_ROLE_KEY não parece uma chave: ${JSON.stringify(chave.slice(0, 24))}…`,
      '',
      'Uma chave a sério começa por "eyJ" (com dois pontos pelo meio) ou por',
      '"sb_secret_". Se copiaste um exemplo de algum lado, é isso.'
    );
  }

  const papel = papelDaChave(chave);
  if (papel && papel !== 'service_role') {
    falhar(
      `Esta chave é a "${papel}", não a "service_role".`,
      '',
      'São parecidas e estão uma por baixo da outra no painel. A que precisas é a',
      'que está marcada como secreta:',
      '  Supabase → Project Settings → API Keys → `service_role` → Reveal',
      papel === 'anon' ? '\n(A `anon` é pública. Não há nada a fazer por a teres usado.)' : ''
    );
  }

  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

function falhar(...linhas) {
  console.error(linhas.filter((l) => l !== '').join('\n'));
  process.exit(1);
}
