// tests/routes.test.js — os endereços da app.
//
// Todos os endereços saem do `lib/routes.js` e nenhum é escrito à mão noutro
// sítio; o `tools/check-routes.mjs` trata dessa parte. O que se testa aqui é o
// que esse verificador não vê: as funções que decidem alguma coisa.

import test from 'node:test';
import assert from 'node:assert/strict';

import { rotas, comOrigem, abaActiva, noJogoAoVivo } from '../src/lib/routes.js';

test('os ids viajam na barra de endereço, e não no caminho', () => {
  // É o que permite a exportação estática: um ficheiro por endereço conhecido
  // na altura de compilar. Um id não se conhece nessa altura.
  assert.equal(rotas.escalao('c1', 't1'), '/team?c=c1&t=t1');
  assert.equal(rotas.jogoAoVivo('m1'), '/match/live?m=m1');
  assert.equal(rotas.competicaoEditar('c1', 't1', 'k1'), '/team/competitions/edit?c=c1&t=t1&k=k1');
  assert.equal(rotas.dashboard(), '/dashboard');
});

test('a origem viaja codificada, para o botão atrás voltar ao sítio certo', () => {
  const destino = comOrigem(rotas.escalaoEditar('c1', 't1'), { atras: rotas.clube('c1') });
  assert.match(destino, /back=%2Fclub%3Fc%3Dc1/);
  assert.ok(destino.startsWith('/team/edit?c=c1&t=t1&'));
});

/* --------------------------------------------------- a aba que fica acesa */

// O bug: nenhuma aba acendia, em ecrã nenhum e em qualquer licença. Os dois
// lados da comparação nunca têm a mesma forma — o `usePathname` traz a barra no
// fim e não traz os ids, as rotas trazem os ids e não trazem a barra — e um
// `===` entre eles é sempre falso.

test('a aba do ecrã em que estamos fica acesa', () => {
  const abas = [
    rotas.plantel('c1', 't1'),
    rotas.jogos('c1', 't1'),
    rotas.competicoes('c1', 't1'),
    rotas.escalao('c1', 't1'),
  ];

  assert.equal(abaActiva('/team/roster/', abas), 0);
  assert.equal(abaActiva('/team/matches/', abas), 1);
  assert.equal(abaActiva('/team/competitions/', abas), 2);
  assert.equal(abaActiva('/team/', abas), 3, 'as estatísticas vivem na raiz do escalão');
});

test('e continua acesa nas páginas penduradas nela', () => {
  const abas = [
    rotas.plantel('c1', 't1'),
    rotas.jogos('c1', 't1'),
    rotas.competicoes('c1', 't1'),
    rotas.escalao('c1', 't1'),
  ];

  // `/team` é prefixo de tudo. Se ganhasse o primeiro em vez do mais comprido,
  // as Estatísticas ficavam acesas em todos os ecrãs do escalão.
  assert.equal(abaActiva('/team/matches/new/', abas), 1);
  assert.equal(abaActiva('/team/competitions/new/', abas), 2);
  assert.equal(abaActiva('/team/competitions/edit/', abas), 2);
  assert.equal(abaActiva('/team/players/new/', abas), 3, 'sem aba própria, fica a do escalão');
});

test('sem barra no fim e com ids dá o mesmo', () => {
  const abas = [rotas.plantel('c1', 't1'), rotas.escalao('c1', 't1')];
  assert.equal(abaActiva('/team/roster', abas), 0);
  assert.equal(abaActiva('/team/roster/?c=c1&t=t1', abas), 0);
});

test('um caminho de fora não acende nada', () => {
  const abas = [rotas.plantel('c1', 't1'), rotas.jogos('c1', 't1')];
  assert.equal(abaActiva('/dashboard/', abas), -1);
  // `/teamXYZ` não é `/team`: a barra na comparação é o que separa os dois.
  assert.equal(abaActiva('/teamXYZ/', [rotas.escalao('c1', 't1')]), -1);
});

/* ------------------------------------------------- o ecrã do jogo ao vivo */

// A mesma armadilha das abas, e com consequências maiores: além de encolher o
// cabeçalho, esta resposta é o que trava a sincronização periódica enquanto o
// jogo decorre. O teste que aqui estava era `/\/live$/`, que com a barra final
// do `trailingSlash` nunca dava verdade.

test('reconhece o jogo ao vivo com e sem barra no fim', () => {
  assert.equal(noJogoAoVivo('/match/live/'), true);
  assert.equal(noJogoAoVivo('/match/live'), true);
});

test('e não confunde com os ecrãs vizinhos do jogo', () => {
  assert.equal(noJogoAoVivo('/match/setup/'), false);
  assert.equal(noJogoAoVivo('/match/summary/'), false);
  assert.equal(noJogoAoVivo('/match/events/'), false);
  assert.equal(noJogoAoVivo('/dashboard/'), false);
  assert.equal(noJogoAoVivo(''), false);
  assert.equal(noJogoAoVivo(null), false);
});

test('o endereço do jogo ao vivo é mesmo esse', () => {
  // Se a rota mudar, este teste falha e obriga a olhar para o `noJogoAoVivo` —
  // que de outra forma passava a responder sempre false, em silêncio.
  assert.equal(noJogoAoVivo(rotas.jogoAoVivo('m1').split('?')[0]), true);
});
