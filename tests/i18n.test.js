// tests/i18n.test.js — o mecanismo dos idiomas.
//
// O que se protege aqui não são as traduções em si (essas o `check-i18n.mjs`
// compara chave a chave), mas o comportamento à volta delas: o que acontece
// quando falta uma chave, quando o texto tem chavetas, e quando o telemóvel
// está numa língua que não temos.

import test from 'node:test';
import assert from 'node:assert/strict';

import pt from '../src/lib/i18n/pt.js';
import en from '../src/lib/i18n/en.js';
import es from '../src/lib/i18n/es.js';

// O módulo é 'use client' e chama React, mas as funções que interessam aqui
// (`t`, `definirIdioma`) não tocam em nada do DOM. `localStorage` não existe no
// Node — o módulo já apanha isso e continua em memória, que é exactamente o
// caminho que se quer testar.
const { t, definirIdioma, idiomaAtual, localeAtual, IDIOMA_PADRAO } = await import(
  '../src/lib/i18n/index.js'
);

test('começa em português: é o dicionário que está sempre completo', () => {
  assert.equal(idiomaAtual(), IDIOMA_PADRAO);
  assert.equal(IDIOMA_PADRAO, 'pt');
});

test('traduz para o idioma escolhido', () => {
  definirIdioma('en');
  assert.equal(t('comum.cancelar'), 'Cancel');
  definirIdioma('es');
  assert.equal(t('comum.cancelar'), 'Cancelar');
  definirIdioma('pt');
  assert.equal(t('comum.cancelar'), 'Cancelar');
});

test('o locale acompanha o idioma, para as datas saírem certas', () => {
  definirIdioma('en');
  assert.equal(localeAtual(), 'en-GB');
  definirIdioma('es');
  assert.equal(localeAtual(), 'es-ES');
  definirIdioma('pt');
  assert.equal(localeAtual(), 'pt-PT');
});

test('cola os valores nas chavetas', () => {
  definirIdioma('pt');
  assert.equal(t('comum.codigo', { codigo: '23503' }), 'código 23503');
  assert.match(t('definicoes.apagarFalhou', { erro: 'sem rede' }), /sem rede/);
});

test('uma chaveta sem valor fica como está, em vez de virar "undefined"', () => {
  definirIdioma('pt');
  assert.equal(t('comum.codigo', { outra: 1 }), 'código {codigo}');
});

test('chave que não existe em lado nenhum devolve a própria chave', () => {
  definirIdioma('pt');
  assert.equal(t('nao.existe.mesmo'), 'nao.existe.mesmo');
});

test('um idioma que não temos é ignorado, em vez de esvaziar a app', () => {
  definirIdioma('pt');
  definirIdioma('de');
  assert.equal(idiomaAtual(), 'pt');
  assert.equal(t('comum.cancelar'), 'Cancelar');
});

test('as etiquetas dos enums existem para todas as posições e eventos', () => {
  // Se um valor novo entrar no domínio e ninguém traduzir, o ecrã mostra a
  // chave crua. Melhor descobri-lo aqui.
  const posicoes = ['GOALKEEPER', 'FIXO', 'LEFT_WINGER', 'RIGHT_WINGER', 'PIVOT', 'UNIVERSAL'];
  for (const idioma of [pt, en, es]) {
    for (const p of posicoes) {
      assert.ok(idioma[`posicao.${p}`], `falta posicao.${p}`);
      assert.ok(idioma[`posicaoCurta.${p}`], `falta posicaoCurta.${p}`);
    }
  }
});

test('nenhuma tradução ficou por fazer: os três dicionários têm textos diferentes', () => {
  // Um dicionário copiado do português e nunca traduzido passaria em todos os
  // outros testes. Isto apanha-o: pelo menos as posições têm de ser diferentes.
  assert.notEqual(pt['posicao.GOALKEEPER'], en['posicao.GOALKEEPER']);
  assert.notEqual(pt['posicao.GOALKEEPER'], es['posicao.GOALKEEPER']);
  assert.notEqual(en['posicao.FIXO'], es['posicao.FIXO']);
});

/* ------------------------------------------------- o domínio fala por chaves */

// Estes protegem a fronteira que a tradução criou: o domínio devolve `{ chave }`
// e nunca uma frase; quem mostra é que traduz. Se alguém voltar a escrever
// português dentro de `validation.js`, cai aqui.

const V = await import('../src/domain/validation.js');
const { mensagemErro } = await import('../src/lib/format.js');

test('a validação devolve chaves, não frases', () => {
  const erro = V.validateClub({ name: '' });
  assert.equal(typeof erro, 'object');
  assert.equal(erro.chave, 'validacao.clubeSemNome');
  assert.equal(V.validateClub({ name: 'CD Exemplo' }), null);
});

test('a chave leva consigo os valores que a frase precisa', () => {
  const erro = V.validatePlayer(
    { name: 'Novo', shirtNumber: 7 },
    [{ id: 'p1', name: 'Rui', shirtNumber: 7, isActive: true }],
    null
  );
  assert.deepEqual(erro, { chave: 'validacao.numeroOcupado', valores: { n: 7, nome: 'Rui' } });
});

test('mensagemErro transforma a chave na frase do idioma escolhido', () => {
  const erro = V.validateClub({ name: '' });

  definirIdioma('pt');
  assert.equal(mensagemErro(erro), 'O nome do clube é obrigatório.');
  definirIdioma('en');
  assert.equal(mensagemErro(erro), 'The club name is required.');
  definirIdioma('es');
  assert.equal(mensagemErro(erro), 'El nombre del club es obligatorio.');
  definirIdioma('pt');
});

test('mensagemErro aceita null, para quem não quer testar antes', () => {
  assert.equal(mensagemErro(null), '');
  assert.equal(mensagemErro(V.validateClub({ name: 'CD Exemplo' })), '');
});

test('as etiquetas de formato seguem o idioma', async () => {
  const { positionLabel, statusLabel, homeAwayLabel } = await import('../src/lib/format.js');

  definirIdioma('pt');
  assert.equal(positionLabel('FIXO'), 'Fixo');
  assert.equal(statusLabel('HALFTIME'), 'Intervalo');
  assert.equal(homeAwayLabel('AWAY'), 'Fora');

  definirIdioma('es');
  assert.equal(positionLabel('FIXO'), 'Cierre');
  assert.equal(statusLabel('HALFTIME'), 'Descanso');
  assert.equal(homeAwayLabel('AWAY'), 'Fuera');

  definirIdioma('pt');
});

/* --------------------------------------------------- o registo por convite */

// A regra que estes protegem: fechar o registo só na interface não fecha nada.
// A fechadura é o Supabase; isto é a cortesia à volta dela.

const { registoAberto } = await import('../src/lib/registo.js');

test('por omissão o registo está aberto', () => {
  delete process.env.NEXT_PUBLIC_REGISTO_ABERTO;
  assert.equal(registoAberto(), true);
  process.env.NEXT_PUBLIC_REGISTO_ABERTO = '';
  assert.equal(registoAberto(), true, 'vazio conta como não configurado');
});

test('o registo público já não pode ser fechado por um build antigo', () => {
  for (const v of ['0', 'false', 'FALSE', 'nao', 'não']) {
    process.env.NEXT_PUBLIC_REGISTO_ABERTO = v;
    assert.equal(registoAberto(), true, `"${v}" não devia fechar`);
  }
  delete process.env.NEXT_PUBLIC_REGISTO_ABERTO;
});

/* ------------------------------------------------- atualizações ao vivo */

// A chamada que diz "esta versão arranca". Se falhar ou atirar, o invólucro
// nativo dá o pacote como avariado e reverte — por isso o que se protege aqui é
// que ela nunca rebente, mesmo sem plugin nenhum (que é o caso no browser e nos
// testes).

const { marcarArranqueBemSucedido } = await import('../src/lib/atualizacoes.js');

test('marcar o arranque nunca atira, mesmo sem o plugin nativo', async () => {
  await assert.doesNotReject(() => marcarArranqueBemSucedido());
});

test('chamar duas vezes é seguro', async () => {
  await assert.doesNotReject(() => marcarArranqueBemSucedido());
  await assert.doesNotReject(() => marcarArranqueBemSucedido());
});
