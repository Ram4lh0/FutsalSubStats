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

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { clienteAdmin } from './chave-de-servico.mjs';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(RAIZ, 'out');
const TMP = join(RAIZ, '.pacotes');
const BALDE = 'pacotes';
const CAPACITOR = JSON.parse(readFileSync(join(RAIZ, 'capacitor.config.json'), 'utf8'));

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

// As guardas da chave de serviço vivem em `chave-de-servico.mjs`: são as mesmas
// que o `convidar.mjs` precisa, e guardas duplicadas divergem — que é
// exactamente o que não pode acontecer a estas.
const sb = clienteAdmin(RAIZ);

/* ------------------------------------------------------------ empacotar */

mkdirSync(TMP, { recursive: true });
const zip = join(TMP, `bundle-${versao}.zip`);
rmSync(zip, { force: true });

console.log(`A empacotar out/ → ${zip}`);
const argsCapgo = [
  '--yes',
  '@capgo/cli',
  'bundle',
  'zip',
  CAPACITOR.appId,
  '--path',
  OUT,
  '--bundle',
  versao,
  '--name',
  zip,
  '--json',
  '--no-code-check',
];
const saidaCapgo = process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'npx.cmd', ...argsCapgo], {
      cwd: RAIZ,
      encoding: 'utf8',
    })
  : execFileSync('npx', argsCapgo, { cwd: RAIZ, encoding: 'utf8' });

let infoCapgo;
try {
  infoCapgo = JSON.parse(saidaCapgo.slice(saidaCapgo.indexOf('{')));
} catch {
  console.error(saidaCapgo);
  console.error('Não consegui ler a resposta da CLI do Capgo.');
  process.exit(1);
}

const conteudo = readFileSync(zip);
const checksum = infoCapgo.checksum;
const tamanhoMB = (conteudo.length / 1024 / 1024).toFixed(2);
console.log(`  ${tamanhoMB} MB · sha256 ${checksum.slice(0, 16)}…`);

/* ------------------------------------------------------------ enviar */

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
