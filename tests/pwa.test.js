// tests/pwa.test.js — a app instalada pelo browser, e a regra que a mantém
// longe do invólucro nativo.
//
// O que aqui se protege não é uma funcionalidade, é uma **separação**. A app
// corre em três sítios e cada um tem o seu dono das versões:
//
//   · no browser  → o service worker guarda os ficheiros
//   · no iOS/Android → os ficheiros vão no APK e as atualizações chegam por
//     pacotes ao vivo (`atualizacoes.js`)
//
// Deixar o service worker correr dentro do invólucro põe dois donos a responder
// à mesma pergunta. O resultado é uma app presa numa versão antiga que nem um
// pacote novo nem uma ida à loja destravam, porque quem serve os pedidos é a
// cache. É um erro que ninguém reproduz em cima da secretária.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const { prepararOffline } = await import('../src/lib/pwa.js');
const { ficheiroDoEcra } = await import('../tools/service-worker.mjs');

/* ------------------------------------------------ o browser fingido */

// O Node traz um `navigator` próprio desde a versão 21, e é só de leitura — uma
// atribuição simples atira "Cannot set property navigator". Daí o
// `defineProperty`, que é a única forma de o substituir por um fingido.
const definirNavigator = (valor) =>
  Object.defineProperty(globalThis, 'navigator', { value: valor, configurable: true, writable: true });

function montarBrowser({ capacitor } = {}) {
  const registados = [];
  const desregistados = [];

  globalThis.Capacitor = capacitor;
  globalThis.document = { readyState: 'complete' };
  globalThis.window = { addEventListener() {} };
  definirNavigator({
    serviceWorker: {
      register(url) {
        registados.push(url);
        return Promise.resolve({});
      },
      getRegistrations() {
        return Promise.resolve([
          {
            unregister() {
              desregistados.push(true);
              return Promise.resolve(true);
            },
          },
        ]);
      },
    },
  });
  return { registados, desregistados };
}

const limpar = () => {
  delete globalThis.Capacitor;
  delete globalThis.document;
  delete globalThis.window;
  definirNavigator(undefined);
};

/* ------------------------------------------------------------ testes */

test('no browser, regista o service worker', () => {
  const { registados } = montarBrowser();
  prepararOffline();
  assert.deepEqual(registados, ['/sw.js']);
  limpar();
});

test('dentro do invólucro nativo, NÃO regista', async () => {
  const { registados, desregistados } = montarBrowser({
    capacitor: { isNativePlatform: () => true },
  });
  prepararOffline();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(registados, [], 'registou um service worker dentro da app nativa');
  // E limpa o que uma versão anterior possa ter deixado registado.
  assert.equal(desregistados.length, 1, 'não desfez os registos antigos');
  limpar();
});

test('reconhece o invólucro pelas três formas que o Capacitor já usou', async () => {
  // `isNativePlatform` é a atual, `getPlatform` a anterior, `isNative` a mais
  // antiga. Uma atualização do Capacitor que troque isto não pode fazer o
  // service worker entrar no telemóvel sem ninguém reparar.
  for (const cap of [
    { isNativePlatform: () => true },
    { getPlatform: () => 'android' },
    { isNative: true },
  ]) {
    const { registados } = montarBrowser({ capacitor: cap });
    prepararOffline();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(registados, [], `deixou passar: ${JSON.stringify(Object.keys(cap))}`);
    limpar();
  }
});

test('sem serviceWorker no browser, não rebenta', () => {
  definirNavigator({});
  globalThis.document = { readyState: 'complete' };
  assert.doesNotThrow(() => prepararOffline());
  limpar();
});

/* --------------------------------------- endereço → ficheiro guardado */

test('os ecrãs traduzem-se para o ficheiro que os serve', () => {
  // A app é exportação estática com `trailingSlash`. Se isto falhar, o efeito é
  // invisível com rede e total sem ela: a página não está na cache e o treinador
  // vê um ecrã vazio no pavilhão.
  assert.equal(ficheiroDoEcra('/'), '/index.html');
  assert.equal(ficheiroDoEcra('/dashboard/'), '/dashboard/index.html');
  assert.equal(ficheiroDoEcra('/match/live/'), '/match/live/index.html');
  // Sem a barra final, que é como alguém escreve à mão.
  assert.equal(ficheiroDoEcra('/match/live'), '/match/live/index.html');
});

test('os ficheiros com extensão ficam como estão', () => {
  for (const f of ['/icon-192.png', '/manifest.webmanifest', '/_next/static/a/b.js']) {
    assert.equal(ficheiroDoEcra(f), f);
  }
});

/* ----------------------------------------------- o gerador em si */

test('o service worker não se guarda a si próprio', () => {
  // Guardado na sua própria cache, um service worker com defeito nunca mais
  // conseguiria ser substituído: serviria para sempre a versão avariada.
  const gerador = readFileSync(join(RAIZ, 'tools', 'service-worker.mjs'), 'utf8');
  assert.match(gerador, /filter\(\(u\) => u !== '\/sw\.js'\)/);
});

test('o service worker é registado a partir do arranque da app', () => {
  const providers = readFileSync(join(RAIZ, 'src', 'app', 'providers.jsx'), 'utf8');
  assert.match(providers, /prepararOffline\(\)/, 'ninguém chama o prepararOffline');
});

test('o `build` gera o service worker', () => {
  // Sem isto, publica-se uma versão nova e quem tem a app instalada fica com a
  // anterior guardada para sempre — o nome da cache é que a faz mudar.
  const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.build, /service-worker\.mjs/);
});
