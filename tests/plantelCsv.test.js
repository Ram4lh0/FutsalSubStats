// tests/plantelCsv.test.js — o plantel que vai e volta numa folha de cálculo.
//
// O que se protege aqui é a promessa do ecrã: "exporta, corrige no Excel, e
// volta a importar". Se a ida e a volta divergirem, o treinador só descobre
// depois de perder o plantel — por isso a primeira coisa que se testa é o
// percurso completo, e só depois cada avaria à parte.

import test from 'node:test';
import assert from 'node:assert/strict';

const { plantelCsv, plantelExemploCsv, lerPlantelCsv } = await import(
  '../src/lib/data/plantelCsv.js'
);
const { definirIdioma } = await import('../src/lib/i18n/index.js');

const PLANTEL = [
  { shirtNumber: 1, name: 'Rui Almeida', preferredPosition: 'GOALKEEPER', strongFoot: 'RIGHT', isActive: true },
  { shirtNumber: 7, name: 'Miguel Faria', preferredPosition: 'LEFT_WINGER', strongFoot: 'LEFT', isActive: true },
  { shirtNumber: 12, name: 'Hugo Barros', preferredPosition: 'PIVOT', strongFoot: 'BOTH', isActive: false },
];

test('o que sai é o que entra: ida e volta sem perder nada', async () => {
  definirIdioma('pt');
  const { jogadores, problemas } = await lerPlantelCsv(plantelCsv(PLANTEL));
  assert.deepEqual(problemas, []);
  assert.deepEqual(jogadores, PLANTEL);
});

test('um ficheiro exportado noutra língua volta a entrar', async () => {
  // O caso real: um treinador espanhol exporta "Portero" e um inglês "Goalkeeper".
  // Se a leitura só percebesse a língua escolhida no momento, nenhum dos dois
  // conseguia reimportar o que a própria app lhe deu.
  definirIdioma('es');
  const emEspanhol = plantelCsv(PLANTEL);
  definirIdioma('en');
  const emIngles = plantelCsv(PLANTEL);

  definirIdioma('pt');
  assert.deepEqual((await lerPlantelCsv(emEspanhol)).jogadores, PLANTEL);
  assert.deepEqual((await lerPlantelCsv(emIngles)).jogadores, PLANTEL);
});

test('o ficheiro de exemplo é ele próprio importável', async () => {
  definirIdioma('pt');
  const { jogadores, problemas } = await lerPlantelCsv(plantelExemploCsv());
  assert.deepEqual(problemas, []);
  assert.equal(jogadores.length, 7);
  // Traz um inativo de propósito, para a coluna se explicar sozinha.
  assert.ok(jogadores.some((j) => !j.isActive));
});

test('só o número e o nome são obrigatórios', async () => {
  definirIdioma('pt');
  const { jogadores, problemas } = await lerPlantelCsv('Nº;Nome;Posição;Pé;Estado\n9;Pedro Lima;;;');
  assert.deepEqual(problemas, []);
  assert.deepEqual(jogadores, [
    {
      shirtNumber: 9,
      name: 'Pedro Lima',
      preferredPosition: 'UNIVERSAL',
      strongFoot: 'UNKNOWN',
      isActive: true,
    },
  ]);
});

test('sem cabeçalho também se lê, pela ordem das colunas', async () => {
  definirIdioma('pt');
  const { jogadores } = await lerPlantelCsv('4;Tiago Nunes;Fixo;Direito;Ativo');
  assert.equal(jogadores.length, 1);
  assert.equal(jogadores[0].preferredPosition, 'FIXO');
});

test('vírgula em vez de ponto e vírgula: o Excel inglês também serve', async () => {
  definirIdioma('pt');
  const { jogadores } = await lerPlantelCsv('Nº,Nome,Posição,Pé,Estado\n5,Nuno Teixeira,Fixo,,');
  assert.equal(jogadores.length, 1);
  assert.equal(jogadores[0].name, 'Nuno Teixeira');
});

test('um nome com ponto e vírgula entre aspas não é partido ao meio', async () => {
  definirIdioma('pt');
  const { jogadores } = await lerPlantelCsv('Nº;Nome;Posição;Pé;Estado\n8;"Sousa; Jr.";Pivot;;');
  assert.equal(jogadores[0].name, 'Sousa; Jr.');
});

test('acentos e maiúsculas não impedem o reconhecimento', async () => {
  definirIdioma('pt');
  const { jogadores, problemas } = await lerPlantelCsv(
    'Nº;Nome;Posição;Pé;Estado\n1;Rui;GUARDA-REDES;direito;ativo\n2;Ana;guarda redes;;'
  );
  assert.equal(jogadores[0].preferredPosition, 'GOALKEEPER');
  // "guarda redes" sem hífen não é nenhuma das traduções: é recusado com o
  // número da linha, em vez de virar Universal em silêncio.
  assert.equal(problemas.length, 1);
  assert.equal(problemas[0].linha, 3);
  assert.equal(problemas[0].chave, 'plantelCsv.posicaoDesconhecida');
});

test('as linhas más ficam de fora sem levar as boas à frente', async () => {
  definirIdioma('pt');
  const { jogadores, problemas } = await lerPlantelCsv(
    [
      'Nº;Nome;Posição;Pé;Estado',
      '1;Rui Almeida;Guarda-redes;Direito;Ativo',
      '999;Fora de escala;;;',
      ';Sem número;;;',
      '4;;;;',
      '1;Número repetido;;;',
      '10;João Marques;Universal;;',
    ].join('\n')
  );
  assert.deepEqual(
    jogadores.map((j) => j.name),
    ['Rui Almeida', 'João Marques']
  );
  assert.deepEqual(
    problemas.map((p) => [p.linha, p.chave]),
    [
      [3, 'plantelCsv.numeroInvalido'],
      [4, 'plantelCsv.numeroInvalido'],
      [5, 'plantelCsv.semNome'],
      [6, 'plantelCsv.numeroRepetido'],
    ]
  );
});

test('o número repetido diz em que linha já tinha aparecido', async () => {
  definirIdioma('pt');
  const { problemas } = await lerPlantelCsv(
    'Nº;Nome;Posição;Pé;Estado\n7;Primeiro;;;\n7;Segundo;;;'
  );
  assert.deepEqual(problemas[0].valores, { n: 7, linha: 2 });
});

test('um ficheiro vazio diz que está vazio, em vez de rebentar', async () => {
  definirIdioma('pt');
  const { jogadores, problemas } = await lerPlantelCsv('');
  assert.deepEqual(jogadores, []);
  assert.equal(problemas[0].chave, 'plantelCsv.vazio');
});

test('o número zero é válido — há guarda-redes com o 0', async () => {
  definirIdioma('pt');
  const { jogadores, problemas } = await lerPlantelCsv('0;Zero;Guarda-redes;;');
  assert.deepEqual(problemas, []);
  assert.equal(jogadores[0].shirtNumber, 0);
});
