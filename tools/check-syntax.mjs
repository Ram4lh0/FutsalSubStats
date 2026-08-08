// tools/check-syntax.mjs — o ficheiro é sequer JavaScript válido?
//
// O compilador do Next não corre em todo o lado, mas o analisador de sintaxe que
// ele traz lá dentro corre. Não substitui o `npm run build` — não verifica tipos,
// nem imports, nem regras do React — mas apanha a classe de erro mais estúpida e
// mais frequente depois de uma substituição em massa: uma chaveta a menos, um
// atributo mal fechado, um import partido ao meio.
//
//   node tools/check-syntax.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const require = createRequire(join(RAIZ, 'package.json'));

let parser;
try {
  parser = require('next/dist/compiled/babel/parser');
} catch {
  console.log('Analisador não encontrado (falta `npm install`). Verificação saltada.');
  process.exit(0);
}

function ficheiros(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) ficheiros(p, saida);
    else if (/\.(jsx?|mjs)$/.test(nome)) saida.push(p);
  }
  return saida;
}

const alvos = [join(RAIZ, 'src'), join(RAIZ, 'tests'), join(RAIZ, 'tools')].flatMap((d) => {
  try {
    return ficheiros(d);
  } catch {
    return [];
  }
});

let problemas = 0;
for (const f of alvos) {
  try {
    parser.parse(readFileSync(f, 'utf8'), {
      sourceType: 'module',
      plugins: ['jsx'],
    });
  } catch (e) {
    const linha = e.loc ? `:${e.loc.line}:${e.loc.column}` : '';
    console.log(`${relative(RAIZ, f)}${linha}  ${e.message.split('. (')[0]}`);
    problemas++;
  }
}

console.log(
  problemas ? `\n${problemas} ficheiro(s) com sintaxe partida.` : `Sintaxe válida em ${alvos.length} ficheiros.`
);
process.exit(problemas ? 1 : 0);
