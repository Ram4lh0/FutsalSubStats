// tools/publicar-bundle.mjs — empacota a app e publica-a como atualização ao vivo.
//
//   npm run publicar:pacote -- 1.0.2
//   npm run publicar:pacote -- 1.0.2 --percentagem 10
//   npm run publicar:pacote -- 1.0.2 --minima-nativa 1.1.0 --notas "corrige o 5v4"
//
// O que faz, por ordem:
//
//   1. Confirma que a pasta `out/` existe e é recente (senão publicava-se uma
//      versão antiga sem dar por isso — o erro mais fácil de cometer aqui).
//   2. Faz o zip.
//   3. Calcula o SHA256, que é o que o telemóvel usa para confirmar que o
//      ficheiro chegou inteiro.
//   4. Envia para o Supabase Storage.
//   5. Insere a linha na `app_bundles` — **desligada**.
//
// O último passo é deliberado. Publicar e ativar num só comando é como não ter
// travão nenhum: um engano chega a toda a gente antes de haver tempo de o ver.
// Ativa-se à mão, depois de instalar o pacote no emulador e confirmar que abre.
//
// ## A chave de serviço
//
// Este script precisa da `SUPABASE_SERVICE_ROLE_KEY`, que **ignora toda a
// segurança por linha**. Nunca pode entrar na app, nem no repositório, nem num
// `NEXT_PUBLIC_`. Vive só no ambiente de quem publica:
//
//   $env:SUPABASE_SERVICE_ROLE_KEY = "..."   (PowerShell, só nesta sessão)

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(RAIZ, 'out');
const TMP = join(RAIZ, '.pacotes');
const BALDE = 'pacotes';

/* ------------------------------------------------------------ argumentos */

const args = process.argv.slice(2);
const versao = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));
const opcao = (nome) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : null;
};

if (!versao) {
  console.error(
    'Falta a versão. Exemplo:\n  npm run publicar:pacote -- 1.0.2\n\n' +
      'Opções: --percentagem 10 · --minima-nativa 1.1.0 · --notas "texto"'
  );
  process.exit(1);
}

const percentagem = Number(opcao('percentagem') ?? 100);
const minimaNativa = opcao('minima-nativa');
const notas = opcao('notas');
const plataforma = opcao('plataforma'); // 'ios' | 'android' | nada = as duas

/* ------------------------------------------------------------ verificações */

if (!existsSync(join(OUT, 'index.html'))) {
  console.error('Não há `out/index.html`. Corre `npm run build` primeiro.');
  process.exit(1);
}

// A pasta `out/` é o erro mais fácil: fica lá de um build de há três dias e
// publica-se código antigo sem dar por nada.
const idadeMin = (Date.now() - statSync(join(OUT, 'index.html')).mtimeMs) / 60000;
if (idadeMin > 30) {
  console.error(
    `A pasta \`out/\` tem ${Math.round(idadeMin)} minutos. Corre \`npm run build\` ` +
      'antes de publicar, para não subir uma versão antiga.'
  );
  process.exit(1);
}

/**
 * Lê o `.env.local` — mas só as variáveis públicas.
 *
 * Isto existe porque o `.env.local` é lido pelo Next e por mais ninguém: um
 * script solto de Node não sabe que o ficheiro existe. O endereço do Supabase
 * estava lá, à frente dos olhos, e era preciso escrevê-lo outra vez à mão na
 * consola só para este comando correr.
 *
 * O `NEXT_PUBLIC_` na condição não é decoração. É a linha que separa o que pode
 * viver num ficheiro do que não pode: essas variáveis já vão dentro da app,
 * são públicas por desenho. A chave de serviço nunca entra por aqui, mesmo que
 * alguém a escreva no ficheiro — ver o aviso mais abaixo.
 *
 * O que já estiver no ambiente ganha, para se poder publicar para outro projeto
 * sem mexer no ficheiro.
 */
function lerEnvLocal() {
  const caminho = join(RAIZ, '.env.local');
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

lerEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Um ficheiro com a chave de serviço lá dentro é a única falha aqui que não se
// desfaz: basta um `git add -f` distraído, ou mandar o ficheiro a alguém, e a
// chave que ignora toda a segurança por linha anda a passear. Por isso o script
// pára — não avisa e continua.
if (existsSync(join(RAIZ, '.env.local'))) {
  const bruto = readFileSync(join(RAIZ, '.env.local'), 'utf8');
  if (/^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S/m.test(bruto)) {
    console.error(
      'A SUPABASE_SERVICE_ROLE_KEY está escrita no `.env.local`. Tira-a de lá.\n\n' +
        'Essa chave ignora toda a segurança por linha: com ela lê-se e apaga-se\n' +
        'a base de dados inteira, de qualquer conta. Num ficheiro, mais cedo ou\n' +
        'mais tarde vai parar a sítio nenhum de bom.\n\n' +
        'O sítio dela é a sessão da consola, e só enquanto publicas:\n' +
        '  $env:SUPABASE_SERVICE_ROLE_KEY = "eyJhbGci…"'
    );
    process.exit(1);
  }
}

if (!url || !chave) {
  console.error(
    'Faltam variáveis de ambiente.\n' +
      (url ? '' : '  NEXT_PUBLIC_SUPABASE_URL   — não está no ambiente nem no `.env.local`\n') +
      (chave ? '' : '  SUPABASE_SERVICE_ROLE_KEY  — tem de ser posta à mão nesta consola\n') +
      '\nEm PowerShell, com a chave a sério (não este texto):\n' +
      '  $env:SUPABASE_SERVICE_ROLE_KEY = "eyJhbGci…"\n\n' +
      'Vai buscá-la a Supabase → Project Settings → API Keys → `service_role`.\n' +
      'Dura só esta janela do PowerShell. Fechas, e desaparece — que é o que se quer.'
  );
  process.exit(1);
}

// Uma chave a sério é um JWT (três partes separadas por pontos) ou uma
// `sb_secret_…`. Isto apanha o engano mais provável: copiar o exemplo em vez do
// valor. Já aconteceu com o `--project-ref <o-teu-ref>`.
if (!/^(eyJ[\w-]*\.[\w-]+\.[\w-]+|sb_secret_[\w-]+)$/.test(chave.trim())) {
  console.error(
    `A SUPABASE_SERVICE_ROLE_KEY não parece uma chave: ${JSON.stringify(chave.slice(0, 24))}…\n\n` +
      'Uma chave a sério começa por "eyJ" (e tem dois pontos pelo meio) ou por\n' +
      '"sb_secret_". Se copiaste o exemplo de algum lado, é isso — cola o valor\n' +
      'que está em Supabase → Project Settings → API Keys → `service_role`.'
  );
  process.exit(1);
}

/**
 * As duas chaves do Supabase são visualmente iguais e estão lado a lado no
 * painel. Trocá-las é a coisa mais natural do mundo — e o erro que se leva a
 * seguir não ajuda nada: a `anon` obedece à segurança por linha, a `app_bundles`
 * está fechada a toda a gente, e o que aparece é um "new row violates row-level
 * security policy" que não faz lembrar nenhuma chave trocada.
 *
 * O papel de cada uma vai escrito no meio do próprio símbolo, em texto simples.
 * Não é segredo nenhum e não é preciso assinatura para o ler — só se está a
 * confirmar que a chave diz ser o que devia.
 */
function papelDaChave(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role || null;
  } catch {
    return null; // `sb_secret_…` não é um JWT e não tem nada para ler
  }
}

const papel = papelDaChave(chave.trim());
if (papel && papel !== 'service_role') {
  console.error(
    `Esta chave é a "${papel}", não a "service_role".\n\n` +
      'São parecidas e estão uma por baixo da outra no painel. A que precisas é a\n' +
      'que está marcada como secreta:\n\n' +
      '  Supabase → Project Settings → API Keys → `service_role` → Reveal\n\n' +
      'A `anon` obedece à segurança por linha, e a tabela `app_bundles` está\n' +
      'fechada a toda a gente — com ela, o registo do pacote seria recusado.'
  );
  // A `anon` é pública por desenho: já vai dentro da app, no telemóvel de quem
  // a instalar. Não há nada a revogar por ela ter passado por aqui.
  if (papel === 'anon') console.error('\n(A chave `anon` é pública. Não há nada a fazer por a teres usado.)');
  process.exit(1);
}

/* ------------------------------------------------------------ empacotar */

mkdirSync(TMP, { recursive: true });
const zip = join(TMP, `bundle-${versao}.zip`);
rmSync(zip, { force: true });

console.log(`A empacotar out/ → ${zip}`);
if (process.platform === 'win32') {
  execFileSync(
    'powershell',
    ['-NoProfile', '-Command', `Compress-Archive -Path "${OUT}\\*" -DestinationPath "${zip}" -Force`],
    { stdio: 'inherit' }
  );
} else {
  execFileSync('zip', ['-r', '-q', zip, '.'], { cwd: OUT, stdio: 'inherit' });
}

const conteudo = readFileSync(zip);
const checksum = createHash('sha256').update(conteudo).digest('hex');
const tamanhoMB = (conteudo.length / 1024 / 1024).toFixed(2);
console.log(`  ${tamanhoMB} MB · sha256 ${checksum.slice(0, 16)}…`);

/* ------------------------------------------------------------ enviar */

const sb = createClient(url, chave, { auth: { persistSession: false } });

const caminho = `bundle-${versao}.zip`;

const enviar = () =>
  sb.storage.from(BALDE).upload(caminho, conteudo, {
    contentType: 'application/zip',
    upsert: true,
  });

console.log(`A enviar para o balde "${BALDE}"…`);
let { error: erroUpload } = await enviar();

/**
 * O balde não existe? Cria-se e tenta-se outra vez.
 *
 * Era um passo à mão no painel, e um passo à mão com uma opção que é fácil
 * deixar em branco: **o balde tem de ser público**. Num balde privado o envio
 * corre bem, o `getPublicUrl` devolve um endereço com bom aspeto, e depois
 * nenhum telemóvel consegue descarregar o pacote — e essa falha acontece longe
 * daqui, sem nada que a ligue a uma caixa por marcar.
 *
 * Público não é descuido: lá dentro está a app compilada, que é o mesmo que
 * qualquer pessoa recebe ao instalá-la. O que protege a atualização não é o
 * segredo do endereço, é o `checksum` — se o ficheiro chegar diferente do que
 * foi publicado, o telemóvel recusa-o.
 */
if (erroUpload && /bucket not found/i.test(erroUpload.message)) {
  console.log(`  o balde "${BALDE}" não existia — a criá-lo (público)…`);
  const { error: erroBalde } = await sb.storage.createBucket(BALDE, { public: true });
  if (erroBalde) {
    console.error(`Não foi possível criar o balde: ${erroBalde.message}`);
    process.exitCode = 1;
  } else {
    ({ error: erroUpload } = await enviar());
  }
}

if (erroUpload) {
  console.error(`Falhou o envio: ${erroUpload.message}`);
  process.exitCode = 1;
}

/* ------------------------------------------------------------ registar */

// A partir daqui usa-se `process.exitCode` e não `process.exit()`.
//
// O `process.exit()` corta o processo a meio, e o cliente do Supabase ainda tem
// ligações abertas quando isso acontece — no Windows, o Node responde a isso com
// um "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" que parece uma
// avaria grave e não é nada: é só a saída a atropelar o que estava por fechar.
// Marcar o código de saída e deixar o programa acabar sozinho dá o mesmo
// resultado, sem o susto.
if (!process.exitCode) {
  const { data: publico } = sb.storage.from(BALDE).getPublicUrl(caminho);

  const { error: erroInsert } = await sb.from('app_bundles').upsert(
    {
      versao,
      plataforma: plataforma || null,
      url: publico.publicUrl,
      checksum,
      minima_nativa: minimaNativa,
      percentagem,
      notas,
      ativo: false, // ← de propósito. Ver o cabeçalho.
    },
    { onConflict: 'versao,plataforma' }
  );

  if (erroInsert) {
    console.error(`Falhou o registo: ${erroInsert.message}`);
    if (/ON CONFLICT specification/i.test(erroInsert.message)) {
      console.error(
        '\nFalta o índice único que o `upsert` precisa. Corre a migração\n' +
          '`supabase/migrations/0009_app_bundles_conflito.sql` no SQL Editor e\n' +
          'tenta outra vez — o ficheiro já foi enviado, só falta registá-lo.'
      );
    }
    // A recusa mais provável, e a que menos se explica a si própria.
    if (/row-level security/i.test(erroInsert.message)) {
      console.error(
        '\nIsto é a segurança por linha a recusar. A `app_bundles` está fechada a\n' +
          'toda a gente de propósito — só a chave `service_role` lá entra. Confirma\n' +
          'que foi essa que puseste no ambiente.'
      );
    }
    process.exitCode = 1;
  } else {
    console.log(`
✓ Pacote ${versao} publicado — e DESLIGADO.

  ${publico.publicUrl}

Antes de o ligares:
  1. Instala-o num aparelho de teste e confirma que a app abre.
  2. Só depois, no SQL Editor:

     update app_bundles set ativo = true where versao = '${versao}';

Para travar um pacote que corra mal:

     update app_bundles set ativo = false where versao = '${versao}';

  Os telemóveis voltam ao anterior na verificação seguinte.
`);
  }
}
