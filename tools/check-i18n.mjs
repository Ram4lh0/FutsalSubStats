// tools/check-i18n.mjs — os três dicionários têm de dizer as mesmas coisas.
//
// O que apanha, e porquê vale a pena:
//
//   1. Chaves a faltar. Traduzir é sempre feito a três ficheiros de distância e
//      esquecer um é o erro mais fácil do mundo. Em produção não rebenta nada —
//      o `t()` cai no português — e é justamente por isso que passa despercebido
//      até alguém mandar uma captura com metade do ecrã na língua errada.
//
//   2. Chaves a mais. Uma chave que só existe em espanhol é quase sempre um erro
//      de escrita numa das outras duas.
//
//   3. Chavetas trocadas. Se o português diz {n} e o inglês diz {count}, o valor
//      nunca é colado e o utilizador lê "{count} clubs" tal e qual. É o género
//      de coisa que ninguém repara a rever traduções e toda a gente repara no
//      telemóvel.
//
//   4. Chaves declaradas mas nunca usadas em `src/`. Não é erro, é arrumação:
//      avisa sem fazer falhar.
//
// Corre no `npm run check`, antes dos testes.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = 'pt';
const IDIOMAS = ['pt', 'en', 'es'];
const PASTA = new URL('../src/lib/i18n/', import.meta.url);

const dicionarios = {};
for (const codigo of IDIOMAS) {
  const mod = await import(new URL(`${codigo}.js`, PASTA).href);
  dicionarios[codigo] = mod.default;
}

let erros = 0;
const avisos = [];

/** As chavetas de um texto, ordenadas — {n} e {erro} viram "erro,n". */
function chavetas(texto) {
  return [...String(texto).matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');
}

const chavesBase = Object.keys(dicionarios[BASE]);

for (const codigo of IDIOMAS) {
  if (codigo === BASE) continue;
  const atual = dicionarios[codigo];

  for (const chave of chavesBase) {
    if (!(chave in atual)) {
      console.error(`✗ ${codigo}.js: falta a chave "${chave}"`);
      erros += 1;
      continue;
    }
    const esperado = chavetas(dicionarios[BASE][chave]);
    const obtido = chavetas(atual[chave]);
    if (esperado !== obtido) {
      console.error(
        `✗ ${codigo}.js: "${chave}" usa {${obtido || 'nada'}} e o português usa {${esperado || 'nada'}}`
      );
      erros += 1;
    }
  }

  for (const chave of Object.keys(atual)) {
    if (!(chave in dicionarios[BASE])) {
      console.error(`✗ ${codigo}.js: a chave "${chave}" não existe em ${BASE}.js`);
      erros += 1;
    }
  }
}

/* ----------------------------------------------- chaves nunca usadas */

function ficheiros(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) ficheiros(caminho, saida);
    else if (/\.(js|jsx)$/.test(nome) && !caminho.includes(`i18n${'/'}`)) saida.push(caminho);
  }
  return saida;
}

const fonte = ficheiros(new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

for (const chave of chavesBase) {
  // As etiquetas dos enums são construídas com crase — `posicao.${p}` — por isso
  // procura-se pelo prefixo antes do ponto quando a chave inteira não aparece.
  const prefixo = chave.split('.')[0];
  if (!fonte.includes(chave) && !fonte.includes(`${prefixo}.\${`)) {
    avisos.push(chave);
  }
}

if (avisos.length) {
  console.warn(`\n⚠ ${avisos.length} chave(s) declaradas e nunca usadas em src/:`);
  for (const a of avisos) console.warn(`   ${a}`);
}

if (erros) {
  console.error(`\n${erros} problema(s) nos dicionários.`);
  process.exit(1);
}

console.log(
  `✓ i18n: ${chavesBase.length} chaves × ${IDIOMAS.length} idiomas, todas presentes e com as mesmas chavetas.`
);
