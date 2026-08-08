// tools/check-routes.mjs — nenhum endereço escrito à mão.
//
// Desde que os ids saíram do caminho e passaram a parâmetros, um endereço
// escrito à mão (`/clubs/${id}`) leva a uma página que já não existe. E como
// tudo é navegação do lado do cliente, isso não rebenta: dá um ecrã em branco,
// que é pior.
//
// Todos os endereços têm de sair de `src/lib/routes.js`. Este verificador anda
// pelo código à procura de quem se tenha esquecido.
//
//   node tools/check-routes.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC = join(RAIZ, 'src');

// Caminhos que já não existem como páginas.
const PROIBIDOS = [
  /['"`]\/clubs\/\$\{/,
  /['"`]\/clubs\/[a-z]/i,
  /['"`]\/matches\//,
  /['"`]\/teams\//,
  /\$\{base\}\//,
];

// Um atributo JSX com uma expressão precisa de chavetas. `backTo=rotas.x()` é
// erro de compilação, e foi exatamente o que a substituição em massa deixou
// para trás quando trocou um texto entre aspas por uma chamada.
const SEM_CHAVETAS = /=(rotas\.|comOrigem\()/;

// Os únicos endereços que podem aparecer escritos: os que não têm ids.
const PERMITIDOS = new Set(['/clubs/new']);

function ficheiros(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) ficheiros(p, saida);
    else if (/\.jsx?$/.test(nome)) saida.push(p);
  }
  return saida;
}

let problemas = 0;
for (const f of ficheiros(SRC)) {
  if (f.endsWith(join('lib', 'routes.js'))) continue;
  const linhas = readFileSync(f, 'utf8').split('\n');
  linhas.forEach((linha, i) => {
    if (linha.trimStart().startsWith('//') || linha.trimStart().startsWith('*')) return;

    if (SEM_CHAVETAS.test(linha)) {
      console.log(
        `${relative(RAIZ, f)}:${i + 1}  faltam chavetas no atributo\n    ${linha.trim()}`
      );
      problemas++;
    }

    for (const padrao of PROIBIDOS) {
      const m = linha.match(padrao);
      if (!m) continue;
      if ([...PERMITIDOS].some((ok) => linha.includes(ok))) continue;
      console.log(
        `${relative(RAIZ, f)}:${i + 1}  endereço escrito à mão — use rotas.* de lib/routes.js\n    ${linha.trim()}`
      );
      problemas++;
      break;
    }
  });
}

/* ------------------------------------------------ a regra da moldura */
//
// O Next recusa-se a compilar se alguém ler a barra de endereço fora de uma
// fronteira de suspense. Como `useRouteParams` a lê, a regra é: quem o chama
// não pode ser o componente que a página exporta — tem de ser um de dentro,
// desenhado por `<Pagina>`.
//
// Esta é a falha mais provável de quem acrescentar uma página nova, e o erro do
// compilador não é nada evidente. Mais vale apanhá-la aqui.

const paginas = ficheiros(join(SRC, 'app')).filter((f) => /page\.jsx?$/.test(f));
for (const f of paginas) {
  const src = readFileSync(f, 'utf8');
  if (!src.includes('useRouteParams()')) continue;

  const nome = relative(RAIZ, f);
  if (!src.includes('<Pagina>')) {
    console.log(`${nome}  lê ids mas não está dentro de <Pagina> — falta a fronteira de suspense`);
    problemas++;
    continue;
  }

  // O componente exportado tem de delegar, não ler.
  const exportado = src.match(/export default function \w+\(\) \{([\s\S]*?)\n\}/);
  if (exportado && exportado[1].includes('useRouteParams()')) {
    console.log(
      `${nome}  lê ids no componente exportado — passe o corpo para uma função interna`
    );
    problemas++;
  }
}

console.log(problemas ? `\n${problemas} problema(s).` : 'Endereços e molduras em ordem.');
process.exit(problemas ? 1 : 0);
