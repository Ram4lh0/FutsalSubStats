// tools/check-imports.mjs — cada `import` aponta para algo que existe?
//
// Verifica duas coisas em todos os ficheiros de src/:
//   1. o caminho importado resolve para um ficheiro real (inclui o atalho @/);
//   2. cada nome importado à chaveta é mesmo exportado pelo módulo de destino.
//
// Não substitui o compilador, mas apanha o que mais dói depois de mexer em
// muitos ficheiros de uma vez: renomear algo e deixar um sítio para trás.
//
//   node tools/check-imports.mjs

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(RAIZ, 'src');

function ficheiros(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) ficheiros(p, saida);
    else if (/\.jsx?$/.test(nome)) saida.push(p);
  }
  return saida;
}

/** Resolve como o bundler: com e sem extensão, e o index da pasta. */
function resolver(base, especificador) {
  const alvo = especificador.startsWith('@/')
    ? join(SRC, especificador.slice(2))
    : resolve(base, especificador);
  const tentativas = [alvo, `${alvo}.js`, `${alvo}.jsx`, join(alvo, 'index.js'), join(alvo, 'index.jsx')];
  return tentativas.find((p) => existsSync(p) && statSync(p).isFile()) || null;
}

function exportacoes(src) {
  const nomes = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([\w$]+)/g))
    nomes.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g))
    for (const parte of m[1].split(',')) {
      const t = parte.trim();
      if (!t) continue;
      nomes.add((t.split(/\s+as\s+/)[1] || t).trim());
    }
  if (/export\s+default/.test(src)) nomes.add('default');
  if (/export\s*\*/.test(src)) nomes.add('*'); // reexporta tudo: não dá para verificar
  return nomes;
}

let problemas = 0;
const cache = new Map();
const lerExports = (p) => {
  if (!cache.has(p)) cache.set(p, exportacoes(readFileSync(p, 'utf8')));
  return cache.get(p);
};

for (const f of ficheiros(SRC)) {
  const src = readFileSync(f, 'utf8');
  const re = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const [, clausula, especificador] = m;
    if (!especificador.startsWith('.') && !especificador.startsWith('@/')) continue;
    const linha = src.slice(0, m.index).split('\n').length;
    const destino = resolver(dirname(f), especificador);
    if (!destino) {
      console.log(`${relative(RAIZ, f)}:${linha}  caminho não existe: ${especificador}`);
      problemas++;
      continue;
    }
    const disponiveis = lerExports(destino);
    if (disponiveis.has('*')) continue;
    const chavetas = clausula.match(/\{([^}]*)\}/);
    if (!chavetas) continue;
    for (const parte of chavetas[1].split(',')) {
      const t = parte.trim();
      if (!t) continue;
      const nome = t.split(/\s+as\s+/)[0].trim();
      if (!disponiveis.has(nome)) {
        console.log(
          `${relative(RAIZ, f)}:${linha}  ${especificador} não exporta "${nome}"`
        );
        problemas++;
      }
    }
  }
}

/* ------------------------------------------ o alias `@/` fora do Next.js */

// O `@/` é uma invenção do `jsconfig.json`: o Next resolve-o, o Node não.
//
// Isso nunca importou enquanto o domínio e a camada de dados só usavam caminhos
// relativos. Ao traduzir a app, um `import { t } from '@/lib/i18n/index.js'`
// entrou no `repository.js` — e a suite inteira deixou de arrancar com
// "Cannot find package '@/lib'". O build continuava a passar, porque o Next
// resolve na mesma; só os testes é que caíam.
//
// A regra: os `.js` de `src/domain/` e `src/lib/` só usam caminhos relativos.
// São os que os testes carregam.
//
// Os `.jsx` ficam de fora de propósito, mesmo estando nas mesmas pastas: o Node
// não sabe ler JSX, por isso um teste nunca os importa e o alias não faz mal
// nenhum ali. As páginas e os componentes também não entram — nada em `app/` ou
// `components/` chega ao Node.
const SEM_ALIAS = ['src/domain', 'src/lib'];

for (const f of ficheiros(join(RAIZ, 'src'))) {
  const rel = relative(RAIZ, f).replace(/\\/g, '/');
  if (!rel.endsWith('.js')) continue;
  if (!SEM_ALIAS.some((dir) => rel.startsWith(dir))) continue;
  const src = readFileSync(f, 'utf8');
  const re = /^\s*import[^'"]*['"](@\/[^'"]+)['"]/gm;
  let m;
  while ((m = re.exec(src))) {
    const linha = src.slice(0, m.index).split('\n').length;
    console.log(
      `${rel}:${linha}  usa o alias "${m[1]}" — o Node dos testes não o resolve, ` +
        `use um caminho relativo`
    );
    problemas++;
  }
}

console.log(problemas ? `\n${problemas} problema(s).` : 'Todos os imports resolvem.');
process.exit(problemas ? 1 : 0);
