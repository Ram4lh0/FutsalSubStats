// tools/service-worker.mjs — escreve o `out/sw.js` depois do `next build`.
//
//   node tools/service-worker.mjs        (corre sozinho no `npm run build`)
//
// ## O que isto resolve
//
// A app já guarda os **dados** no aparelho — é o IndexedDB, e é o que faz um
// jogo inteiro decorrer sem rede. O que não estava guardado era o **código**:
// aberta pelo browser, ela ia buscar o HTML e o JavaScript ao servidor de cada
// vez. Num pavilhão sem sinal, o treinador carregava no ícone e não abria nada.
//
// Dentro do invólucro do Capacitor o problema nunca existiu, porque os ficheiros
// vão dentro do APK. Existe só para quem instala pelo browser — e é essa a via
// que dispensa as lojas.
//
// ## Porquê guardar tudo, e não só o que for sendo visitado
//
// A forma preguiçosa é guardar cada ficheiro à medida que é pedido. Falha
// exactamente no caso que interessa: o treinador instala a app em casa, abre o
// painel, vê que está tudo bem — e no pavilhão, sem rede, carrega em "iniciar
// jogo" e vai a um ecrã que nunca foi visitado e portanto não está guardado.
//
// São 2,4 MB. Guarda-se tudo, de uma vez, na instalação.
//
// ## A versão
//
// O nome da cache leva um resumo do conteúdo de todos os ficheiros. Build novo,
// nome novo, cache nova — e a antiga é apagada ao activar. É isto que faz uma
// correção chegar a quem já tem a app instalada.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = join(RAIZ, 'out');

/**
 * O endereço de um ecrã, traduzido para o ficheiro que o serve.
 *
 * A app é exportação estática com `trailingSlash`, por isso `/match/live/` vive
 * em `/match/live/index.html`. E os identificadores viajam em parâmetros —
 * `?m=a3f9…` — que não fazem parte do ficheiro e ficam de fora: quem chama passa
 * só o caminho. Sem isto, cada jogo era um endereço diferente e nenhum estaria
 * guardado.
 *
 * Está aqui fora, e não escrita dentro do texto do service worker, para poder
 * ser testada. É a peça com mais casos de bordo de todo o ficheiro, e a única
 * cujo erro se manifesta apenas offline — ou seja, no pavilhão, no sábado.
 */
export function ficheiroDoEcra(caminho) {
  if (caminho.endsWith('/')) return `${caminho}index.html`;
  if (/\.[a-z0-9]+$/i.test(caminho)) return caminho;
  return `${caminho}/index.html`;
}

function ficheiros(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) ficheiros(p, saida);
    else saida.push(p);
  }
  return saida;
}

// A geração corre só quando este ficheiro é chamado pela linha de comandos. Os
// testes importam-no para exercitar a `ficheiroDoEcra`, e importar não pode
// obrigar a ter uma pasta `out/` construída ao lado.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(sep).join('/'))) {
  gerar();
}

function gerar() {
const todos = ficheiros(OUT)
  .map((p) => '/' + relative(OUT, p).split(sep).join('/'))
  // O próprio service worker não se guarda a si mesmo: o browser tem de o poder
  // ir buscar novo para reparar que mudou.
  .filter((u) => u !== '/sw.js')
  .sort();

const resumo = createHash('sha256');
for (const url of todos) {
  resumo.update(url);
  resumo.update(readFileSync(join(OUT, url.slice(1))));
}
const versao = resumo.digest('hex').slice(0, 12);

const sw = `// sw.js — GERADO por tools/service-worker.mjs. Não editar à mão.
//
// Versão: ${versao}
// Ficheiros: ${todos.length}

const VERSAO = ${JSON.stringify(versao)};
const CACHE = 'futsal-' + VERSAO;
const FICHEIROS = ${JSON.stringify(todos)};

// Quanto tempo se espera pela rede antes de servir o que está guardado.
//
// Um pavilhão não tem "com rede" e "sem rede": tem uma barra de sinal que vai e
// vem. Sem este limite, o pedido fica pendurado à espera de uma resposta que
// nunca chega e a app parece bloqueada — que é pior do que estar offline.
const ESPERA_MS = 3000;

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Em lotes: um \`addAll\` com 185 pedidos de uma vez falha inteiro se um
      // único deles falhar, e perde-se a instalação toda por causa de um ficheiro.
      for (let i = 0; i < FICHEIROS.length; i += 20) {
        await cache.addAll(FICHEIROS.slice(i, i + 20)).catch(() => {});
      }
      // Não esperar que todos os separadores fechem para a versão nova entrar.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nome of await caches.keys()) {
        if (nome.startsWith('futsal-') && nome !== CACHE) await caches.delete(nome);
      }
      await self.clients.claim();
    })()
  );
});

// Vem de tools/service-worker.mjs, onde é testada. Recebe só o caminho: os
// parâmetros — \`?m=a3f9…\` — não fazem parte do ficheiro e ficam de fora.
${ficheiroDoEcra.toString()}

async function comLimiteDeTempo(pedido) {
  const controlador = new AbortController();
  const relogio = setTimeout(() => controlador.abort(), ESPERA_MS);
  try {
    return await fetch(pedido, { signal: controlador.signal });
  } finally {
    clearTimeout(relogio);
  }
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;

  // Só leituras nossas. Tudo o que vai para o Supabase — sessões, sincronização,
  // eventos do jogo — passa ao lado disto e nunca é guardado. Uma resposta da
  // API servida da cache seria dados errados no ecrã, que é muito pior do que
  // um erro de rede.
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  // Abrir um ecrã: tenta a rede primeiro, para quem tem ligação ver sempre a
  // versão mais recente. Sem resposta a tempo, serve o que está guardado.
  if (pedido.mode === 'navigate') {
    evento.respondWith(
      (async () => {
        try {
          const resposta = await comLimiteDeTempo(pedido);
          if (resposta && resposta.ok) return resposta;
        } catch {
          /* sem rede, ou demorou de mais */
        }
        const cache = await caches.open(CACHE);
        return (
          (await cache.match(ficheiroDoEcra(url.pathname))) ||
          (await cache.match('/index.html')) ||
          Response.error()
        );
      })()
    );
    return;
  }

  // Tudo o resto — JavaScript, CSS, ícones — tem o resumo no nome do ficheiro.
  // Se o nome é o mesmo, o conteúdo é o mesmo: serve-se da cache sem perguntar
  // nada a ninguém, o que também torna a abertura instantânea com rede.
  evento.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const guardado = await cache.match(pedido);
      if (guardado) return guardado;
      try {
        const resposta = await fetch(pedido);
        if (resposta && resposta.ok) cache.put(pedido, resposta.clone());
        return resposta;
      } catch {
        return Response.error();
      }
    })()
  );
});
`;

writeFileSync(join(OUT, 'sw.js'), sw, 'utf8');

const kb = (Buffer.byteLength(sw) / 1024).toFixed(1);
console.log(`✓ out/sw.js — versão ${versao}, ${todos.length} ficheiros guardados (${kb} KB de código)`);
}
