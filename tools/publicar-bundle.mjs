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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) {
  console.error(
    'Faltam variáveis de ambiente.\n' +
      '  NEXT_PUBLIC_SUPABASE_URL      (a mesma do .env.local)\n' +
      '  SUPABASE_SERVICE_ROLE_KEY     (Supabase → Project Settings → API)\n\n' +
      'A chave de serviço ignora a segurança por linha. Nunca a metas num ficheiro.'
  );
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
console.log(`A enviar para o balde "${BALDE}"…`);
const { error: erroUpload } = await sb.storage
  .from(BALDE)
  .upload(caminho, conteudo, { contentType: 'application/zip', upsert: true });

if (erroUpload) {
  console.error(`Falhou o envio: ${erroUpload.message}`);
  console.error(`\nSe disser que o balde não existe, cria-o em Storage com o nome "${BALDE}" e público.`);
  process.exit(1);
}

const { data: publico } = sb.storage.from(BALDE).getPublicUrl(caminho);

/* ------------------------------------------------------------ registar */

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
  process.exit(1);
}

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
