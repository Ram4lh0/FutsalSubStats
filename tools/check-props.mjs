// tools/check-props.mjs — o compilador não corre aqui, este guarda-portão corre.
//
// Apanha a classe de erro que rebentou no browser: passar uma propriedade a um
// componente do próprio ficheiro e esquecer de a receber na assinatura — ou o
// contrário, receber uma que ninguém passa.
//
// Não é um analisador de JavaScript a sério: é leitura de texto com regras
// apertadas. Prefere calar-se a inventar erros.
//
//   node tools/check-props.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function ficheiros(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) ficheiros(p, saida);
    else if (/\.jsx?$/.test(nome)) saida.push(p);
  }
  return saida;
}

/** Componentes declarados no ficheiro e as propriedades que recebem. */
function declaracoes(src) {
  const mapa = new Map();
  const re = /function\s+([A-Z][A-Za-z0-9_]*)\s*\(\s*(\{[\s\S]*?\})?\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const [, nome, destruct] = m;
    const props = new Set();
    let rest = false;
    if (destruct) {
      // Só o primeiro nível interessa; valores por omissão e aninhamentos ficam de fora.
      const corpo = destruct.slice(1, -1);
      let nivel = 0;
      let atual = '';
      const pedacos = [];
      for (const ch of corpo) {
        if ('{[('.includes(ch)) nivel++;
        if ('}])'.includes(ch)) nivel--;
        if (ch === ',' && nivel === 0) {
          pedacos.push(atual);
          atual = '';
        } else atual += ch;
      }
      pedacos.push(atual);
      for (const p of pedacos) {
        const t = p.trim();
        if (!t) continue;
        if (t.startsWith('...')) {
          rest = true;
          continue;
        }
        const chave = t.split(/[:=]/)[0].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(chave)) props.add(chave);
      }
    }
    mapa.set(nome, { props, rest, temDestruct: Boolean(destruct) });
  }
  return mapa;
}

/** Propriedades passadas em cada `<Componente ... />` do ficheiro. */
function utilizacoes(src, conhecidos) {
  const usos = [];
  const re = /<([A-Z][A-Za-z0-9_]*)([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(src))) {
    const [, nome, atributos] = m;
    if (!conhecidos.has(nome)) continue;
    const props = new Set();
    const reAttr = /(?:^|\s)([a-zA-Z][\w]*)\s*=/g;
    let a;
    while ((a = reAttr.exec(atributos))) props.add(a[1]);
    if (/\{\s*\.\.\./.test(atributos)) props.add('__spread__');
    usos.push({ nome, props, linha: src.slice(0, m.index).split('\n').length });
  }
  return usos;
}

let problemas = 0;
for (const f of ficheiros(join(RAIZ, 'src'))) {
  const src = readFileSync(f, 'utf8');
  const decl = declaracoes(src);
  if (!decl.size) continue;
  for (const uso of utilizacoes(src, decl)) {
    const d = decl.get(uso.nome);
    if (uso.props.has('__spread__')) continue;
    if (!d.temDestruct && uso.props.size) {
      // Componente sem propriedades a receber propriedades: suspeito, mas legal.
      continue;
    }
    for (const p of uso.props) {
      if (p === 'key' || p === 'ref' || p === 'children') continue;
      if (!d.props.has(p) && !d.rest) {
        console.log(
          `${relative(RAIZ, f)}:${uso.linha}  <${uso.nome} ${p}={…}> — ${uso.nome} não recebe "${p}"`
        );
        problemas++;
      }
    }
  }
}

console.log(problemas ? `\n${problemas} problema(s).` : 'Propriedades certas em todos os componentes.');
process.exit(problemas ? 1 : 0);
