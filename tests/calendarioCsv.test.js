// tests/calendarioCsv.test.js — importar o calendário de jogos de um CSV.

import test from 'node:test';
import assert from 'node:assert/strict';

import { lerCalendarioCsv, lerData, lerHora } from '../src/lib/data/calendarioCsv.js';

const provas = [
  { id: 'k1', name: 'Campeonato Distrital' },
  { id: 'k2', name: 'Taça AF Lisboa' },
];

test('datas e horas escritas à mão ou pelo Excel', () => {
  assert.deepEqual(lerData('14/09/2026'), { a: 2026, m: 9, d: 14 });
  assert.deepEqual(lerData('2026-09-14'), { a: 2026, m: 9, d: 14 });
  assert.deepEqual(lerData('4-9-26'), { a: 2026, m: 9, d: 4 });
  assert.equal(lerData('31/02/2026'), null);
  assert.equal(lerData('amanhã'), null);
  assert.deepEqual(lerHora('21:00'), { h: 21, min: 0 });
  assert.deepEqual(lerHora('18h30'), { h: 18, min: 30 });
  assert.deepEqual(lerHora('9h'), { h: 9, min: 0 });
  assert.equal(lerHora(''), null);
  assert.equal(lerHora('25:00'), undefined);
});

test('lê o calendário com cabeçalho, casa/fora e hora em branco', () => {
  const csv = [
    'Data;Hora;Adversário;Casa/Fora;Competição',
    '14/09/2026;21:00;GD Exemplo;Casa;Campeonato Distrital',
    '21/09/2026;;CD Modelo;Fora;Taça AF Lisboa',
    '28/09/2026;20:00;Académico;;Campeonato Distrital',
  ].join('\n');
  const { jogos, problemas, repetidos } = lerCalendarioCsv(csv, { competicoes: provas });
  assert.equal(problemas.length, 0);
  assert.equal(repetidos, 0);
  assert.equal(jogos.length, 3);
  assert.equal(jogos[0].competitionId, 'k1');
  assert.equal(jogos[1].homeOrAway, 'AWAY');
  assert.equal(new Date(jogos[1].scheduledAt).getHours(), 12);
  assert.equal(jogos[2].homeOrAway, 'HOME');
});

test('a competição tem de estar escrita exatamente igual', () => {
  const csv = [
    '14/09/2026;21:00;A;Casa;campeonato distrital',
    '15/09/2026;21:00;B;Casa;Liga Nacional',
    '16/09/2026;21:00;C;Casa;  Taça AF Lisboa  ',
  ].join('\n');
  const { jogos, problemas } = lerCalendarioCsv(csv, { competicoes: provas });
  assert.equal(jogos.length, 1, 'só os espaços das pontas são perdoados');
  assert.equal(problemas[0].chave, 'calendarioCsv.competicaoQuase');
  assert.equal(problemas[0].valores.certo, 'Campeonato Distrital');
  assert.equal(problemas[1].chave, 'calendarioCsv.competicaoDesconhecida');
});

test('linhas más dizem a linha e o motivo, e não travam as boas', () => {
  const csv = [
    'Data,Hora,Adversário,Casa/Fora,Competição',
    '99/99/2026,21:00,X,Casa,Campeonato Distrital',
    '14/09/2026,21:00,,Casa,Campeonato Distrital',
    '14/09/2026,21:00,Y,Talvez,Campeonato Distrital',
    '14/09/2026,21:00,Z,F,Campeonato Distrital',
  ].join('\n');
  const { jogos, problemas } = lerCalendarioCsv(csv, { competicoes: provas });
  assert.deepEqual(problemas.map((p) => p.linha), [2, 3, 4]);
  assert.equal(jogos.length, 1);
  assert.equal(jogos[0].homeOrAway, 'AWAY');
});

test('importar duas vezes não duplica jogos', () => {
  const existentes = [{ opponentName: 'GD Exemplo', scheduledAt: new Date(2026, 8, 14, 18, 0).getTime() }];
  const csv = [
    '14/09/2026;21:00;gd exemplo;Casa;Campeonato Distrital',
    '21/09/2026;21:00;GD Exemplo;Casa;Campeonato Distrital',
    '21/09/2026;21:00;GD Exemplo;Casa;Campeonato Distrital',
  ].join('\n');
  const { jogos, repetidos } = lerCalendarioCsv(csv, { competicoes: provas, existentes });
  assert.equal(jogos.length, 1);
  assert.equal(repetidos, 2);
});
