// tools/check-undefined.mjs — nomes usados sem estarem declarados.
//
// A falha que este verificador nasceu para apanhar: uma substituição em massa
// tirou `useSearchParams` de um import, mas o ficheiro continuou a chamá-lo. O
// compilador não se queixa — para ele é uma variável global qualquer, que só
// não existe quando o browser lá chega. Resultado: ecrã em branco.
//
// Percorre a árvore com o analisador do Next, junta tudo o que está declarado
// (imports, variáveis, funções, parâmetros, capturas de erro) e aponta o que
// sobrar e não for global conhecida.
//
//   node tools/check-undefined.mjs

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

// O que existe sem ninguém declarar.
const GLOBAIS = new Set([
  'window', 'document', 'navigator', 'console', 'localStorage', 'sessionStorage',
  'indexedDB', 'IDBKeyRange', 'crypto', 'fetch', 'URL', 'URLSearchParams', 'Blob',
  'File', 'FileReader', 'FormData', 'Headers', 'Request', 'Response', 'AbortController',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'cancelAnimationFrame', 'queueMicrotask', 'structuredClone', 'Event', 'CustomEvent',
  'Audio', 'AudioContext', 'webkitAudioContext', 'performance', 'process', 'globalThis',
  'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'RegExp',
  'Error', 'TypeError', 'RangeError', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Symbol', 'Proxy', 'Reflect', 'BigInt', 'Intl', 'TextEncoder', 'TextDecoder',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'undefined', 'NaN', 'Infinity',
  'React', 'JSX', 'HTMLElement', 'Node', 'CSS', 'matchMedia', 'alert', 'confirm',
  'prompt', 'atob', 'btoa', 'Uint8Array', 'ArrayBuffer', 'DataView', 'require',
  'module', 'exports', '__dirname', '__filename', 'arguments', 'this',
]);

function ficheiros(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) ficheiros(p, saida);
    else if (/\.(jsx?|mjs)$/.test(nome)) saida.push(p);
  }
  return saida;
}

/** Anda pela árvore sem depender do @babel/traverse. */
function percorrer(no, visita, pai = null) {
  if (!no || typeof no !== 'object') return;
  if (Array.isArray(no)) {
    for (const x of no) percorrer(x, visita, pai);
    return;
  }
  if (typeof no.type !== 'string') return;
  visita(no, pai);
  for (const chave of Object.keys(no)) {
    if (chave === 'loc' || chave === 'leadingComments' || chave === 'trailingComments') continue;
    percorrer(no[chave], visita, no);
  }
}

/** Todos os nomes que um padrão de destructuring introduz. */
function nomesDe(no, saida = []) {
  if (!no) return saida;
  switch (no.type) {
    case 'Identifier': saida.push(no.name); break;
    case 'ObjectPattern': no.properties.forEach((p) =>
      nomesDe(p.type === 'RestElement' ? p.argument : p.value, saida)); break;
    case 'ArrayPattern': no.elements.forEach((e) => nomesDe(e, saida)); break;
    case 'AssignmentPattern': nomesDe(no.left, saida); break;
    case 'RestElement': nomesDe(no.argument, saida); break;
  }
  return saida;
}

let problemas = 0;
const alvos = [join(RAIZ, 'src')].flatMap((d) => ficheiros(d));

for (const f of alvos) {
  const codigo = readFileSync(f, 'utf8');
  let arvore;
  try {
    arvore = parser.parse(codigo, { sourceType: 'module', plugins: ['jsx'] });
  } catch {
    continue; // a sintaxe é problema do check-syntax
  }

  const declarados = new Set();
  const usados = new Map(); // nome -> linha

  percorrer(arvore.program, (no, pai) => {
    switch (no.type) {
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
      case 'ImportSpecifier':
        declarados.add(no.local.name); break;
      case 'VariableDeclarator':
        nomesDe(no.id).forEach((n) => declarados.add(n)); break;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
      case 'ObjectMethod':
      case 'ClassMethod':
        if (no.id) declarados.add(no.id.name);
        no.params.forEach((p) => nomesDe(p).forEach((n) => declarados.add(n)));
        break;
      case 'ClassDeclaration':
        if (no.id) declarados.add(no.id.name); break;
      case 'CatchClause':
        if (no.param) nomesDe(no.param).forEach((n) => declarados.add(n)); break;
      case 'LabeledStatement':
        declarados.add(no.label.name); break;
      case 'Identifier': {
        if (!pai) return;
        // Nomes que não são referências a variáveis: o que vem depois de um
        // ponto, as chaves de um objeto, os atributos de JSX.
        if (
          (pai.type === 'MemberExpression' || pai.type === 'OptionalMemberExpression') &&
          pai.property === no &&
          !pai.computed
        )
          return;
        if (
          (pai.type === 'ObjectProperty' || pai.type === 'ObjectMethod') &&
          pai.key === no &&
          !pai.computed &&
          !pai.shorthand
        )
          return;
        if (pai.type === 'JSXAttribute' || pai.type === 'JSXIdentifier') return;
        if (pai.type === 'ObjectMethod' || pai.type === 'ClassMethod') return;
        if (pai.type === 'ImportSpecifier' || pai.type === 'ImportDefaultSpecifier') return;
        if (pai.type === 'ExportSpecifier') return;
        if (!usados.has(no.name)) usados.set(no.name, no.loc?.start.line ?? 0);
        break;
      }
    }
  });

  for (const [nome, linha] of usados) {
    if (declarados.has(nome) || GLOBAIS.has(nome)) continue;
    console.log(`${relative(RAIZ, f)}:${linha}  "${nome}" é usado mas não está declarado nem importado`);
    problemas++;
  }
}

console.log(problemas ? `\n${problemas} problema(s).` : 'Nenhum nome usado sem estar declarado.');
process.exit(problemas ? 1 : 0);
