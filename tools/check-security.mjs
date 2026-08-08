// tools/check-security.mjs — auditoria estática do que protege os dados.
//
// Não substitui olhar para o painel do Supabase, mas apanha regressões: uma
// tabela nova sem proteção por linha, uma função privilegiada com o caminho de
// pesquisa aberto, uma chave de servidor que escorregou para dentro do código.
//
// São os três erros que, num projeto pequeno, dão dores de cabeça grandes — e
// nenhum deles se nota a usar a app.
//
//   node tools/check-security.mjs

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const MIGRACOES = join(RAIZ, 'supabase', 'migrations');

const problemas = [];
const avisos = [];

function ler(dir) {
  if (!existsSync(dir)) return '';
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');
}

const sql = ler(MIGRACOES);

/* ------------------------------------- 1. toda a tabela tem de ser protegida */

const tabelas = new Set(
  [...sql.matchAll(/create table (?:if not exists )?([a-z_]+)/g)].map((m) => m[1])
);
const comRls = new Set(
  [...sql.matchAll(/alter table\s+([a-z_]+)\s+enable row level security/g)].map((m) => m[1])
);
const comPolitica = new Set(
  [...sql.matchAll(/create policy [a-z_]+ on ([a-z_]+)/g)].map((m) => m[1])
);

for (const t of tabelas) {
  if (!comRls.has(t)) problemas.push(`tabela "${t}" sem segurança por linha ligada`);
  else if (!comPolitica.has(t)) problemas.push(`tabela "${t}" com segurança ligada mas sem política — ninguém lhe acede`);
}

/* --------------------------- 2. função privilegiada precisa de caminho fixo */

// Cada corpo de função vai do `as $$` até ao `$$ language ...` que o fecha.
//
// As migrações correm por ordem e `create or replace` substitui o que lá estava,
// por isso só a ÚLTIMA definição de cada função conta. Julgar pela primeira
// acusaria funções que uma migração posterior já corrigiu.
const funcoes = new Map();
for (const m of sql.matchAll(
  /create (?:or replace )?function\s+([a-z_]+)\s*\(([^)]*)\)[\s\S]*?\$\$\s*language\s+\w+([^;]*);/g
)) {
  funcoes.set(m[1], m[3]);
}

for (const [nome, cauda] of funcoes) {
  const definer = /security\s+definer/i.test(cauda);
  const temCaminho = /set\s+search_path\s*=/i.test(cauda);
  if (definer && !temCaminho) {
    problemas.push(
      `função "${nome}" corre com privilégios elevados sem search_path fixo — ` +
        'quem controlar o caminho de pesquisa escolhe as tabelas'
    );
  } else if (!definer && !temCaminho) {
    avisos.push(`função "${nome}" sem search_path fixo (não é grave: não é privilegiada)`);
  }
}

/* ------------------------------- 3. a chave de servidor nunca entra no código */

function ficheiros(dir, saida = []) {
  if (!existsSync(dir)) return saida;
  for (const nome of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, nome.name);
    if (nome.isDirectory()) ficheiros(p, saida);
    else if (/\.(jsx?|mjs|json|ya?ml)$/.test(nome.name)) saida.push(p);
  }
  return saida;
}

const PERIGOS = [
  [/service_role/i, 'a chave service_role ignora toda a segurança por linha'],
  [/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/, 'parece uma chave JWT escrita no código'],
  [/dangerouslySetInnerHTML|\.innerHTML\s*=/, 'escrita direta de HTML abre a porta a injeção'],
];

for (const f of [...ficheiros(join(RAIZ, 'src')), ...ficheiros(join(RAIZ, 'tools'))]) {
  if (f.endsWith('check-security.mjs')) continue;
  const conteudo = readFileSync(f, 'utf8');
  for (const [padrao, porque] of PERIGOS) {
    if (padrao.test(conteudo)) problemas.push(`${relative(RAIZ, f)}: ${porque}`);
  }
}

/* ----------------------------------- 4. ficheiros de ambiente fora do git */

const gitignore = existsSync(join(RAIZ, '.gitignore'))
  ? readFileSync(join(RAIZ, '.gitignore'), 'utf8')
  : '';
for (const f of ['.env.local', '.env.vercel']) {
  if (existsSync(join(RAIZ, f)) && !gitignore.includes(f)) {
    problemas.push(`${f} existe mas não está no .gitignore`);
  }
}

/* --------------------------------------------------------------- relatório */

for (const p of problemas) console.log(`  ✗ ${p}`);
for (const a of avisos) console.log(`  · ${a}`);

console.log(
  problemas.length
    ? `\n${problemas.length} problema(s) de segurança.`
    : `Segurança: ${tabelas.size} tabelas protegidas, nenhum segredo no código.`
);
process.exit(problemas.length ? 1 : 0);
