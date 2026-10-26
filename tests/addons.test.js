// tests/addons.test.js — add-ons por escalão (domain/addons.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ADDONS,
  GRUPOS,
  addonsAtivos,
  catalogoDeAddons,
  problemasDoCatalogo,
  validarListaDeAddons,
} from '../src/domain/addons.js';
import { teamStatConfigMapper } from '../src/lib/data/mappers.js';

/** Um catálogo de mentira, para não depender do que estiver no verdadeiro. */
const CATALOGO = {
  'mapa-baliza': { grupo: 'resumo', nome: 'Zona da baliza', depende: ['remate'] },
  'calor-baliza': { grupo: 'dashboard', nome: 'Calor da baliza', depende: ['mapa-baliza'] },
  'vista-nova': { grupo: 'dashboard', nome: 'Vista nova' },
  'para-todos': { grupo: 'jogo', nome: 'Para todos', paraTodos: true },
  'retirado': { grupo: 'jogo', nome: 'Retirado', disponivel: false },
};

test('o catálogo verdadeiro não tem problemas', () => {
  assert.deepEqual(problemasDoCatalogo(ADDONS), []);
});

test('o catálogo apanha ids repetidos, grupos e dependências que não existem', () => {
  const problemas = problemasDoCatalogo({
    remate: { grupo: 'jogo', nome: 'Repetido' },
    'sem-grupo': { grupo: 'nada', nome: 'X' },
    'dep-falsa': { grupo: 'jogo', nome: 'Y', depende: ['inventado'] },
    'grupo-registos': { grupo: 'registos', nome: 'Z' },
  });
  assert.equal(problemas.length, 4, problemas.join('\n'));
});

test('sem config, só os que são para todos', () => {
  assert.deepEqual([...addonsAtivos(null, CATALOGO)], ['para-todos']);
});

test('os registos ligados contam como add-ons activos', () => {
  const ativos = addonsAtivos({ registos: ['remate', 'canto'] }, CATALOGO);
  assert.ok(ativos.has('remate'));
  assert.ok(ativos.has('canto'));
});

test('um add-on só fica activo com as dependências ligadas, mesmo em cadeia', () => {
  const sem = addonsAtivos({ registos: [], addons: ['mapa-baliza', 'calor-baliza'] }, CATALOGO);
  assert.equal(sem.has('mapa-baliza'), false, 'falta o remate');
  assert.equal(sem.has('calor-baliza'), false, 'falta o mapa-baliza');

  const com = addonsAtivos({ registos: ['remate'], addons: ['calor-baliza', 'mapa-baliza'] }, CATALOGO);
  assert.ok(com.has('mapa-baliza'));
  assert.ok(com.has('calor-baliza'), 'a ordem na config não importa');
});

test('um add-on retirado ou desconhecido não fica activo', () => {
  const ativos = addonsAtivos({ addons: ['retirado', 'inventado', 'vista-nova'] }, CATALOGO);
  assert.equal(ativos.has('retirado'), false);
  assert.equal(ativos.has('inventado'), false);
  assert.ok(ativos.has('vista-nova'));
});

test('um ciclo de dependências nunca fica activo', () => {
  const ciclo = {
    a: { grupo: 'jogo', nome: 'A', depende: ['b'] },
    b: { grupo: 'jogo', nome: 'B', depende: ['a'] },
  };
  assert.equal(addonsAtivos({ addons: ['a', 'b'] }, ciclo).size, 0);
});

test('validar: pela ordem do catálogo, sem repetidos, e recusa o que não existe', () => {
  assert.deepEqual(
    validarListaDeAddons(['vista-nova', 'mapa-baliza', 'vista-nova'], CATALOGO),
    { addons: ['mapa-baliza', 'vista-nova'] }
  );
  assert.match(validarListaDeAddons(['retirado'], CATALOGO).erro, /retirado/);
  assert.match(validarListaDeAddons(['remate'], CATALOGO).erro, /remate/, 'os registos têm a sua coluna');
  assert.match(validarListaDeAddons('vista-nova', CATALOGO).erro, /array/);
});

test('o catálogo do painel põe os registos primeiro, no seu grupo', () => {
  const itens = catalogoDeAddons(CATALOGO);
  assert.deepEqual(
    itens.filter((i) => i.campo === 'registos').map((i) => i.id),
    ['remate', 'defesa_gr', 'recuperacao', 'fora', 'canto', 'acao', 'remate_adv']
  );
  assert.ok(itens.filter((i) => i.campo === 'registos').every((i) => i.grupo === 'registos'));
  assert.deepEqual(
    itens.filter((i) => i.campo === 'addons').map((i) => i.id),
    ['mapa-baliza', 'calor-baliza', 'vista-nova', 'para-todos'],
    'o retirado não aparece'
  );
  const grupos = new Set(GRUPOS.map((g) => g.id));
  assert.ok(itens.every((i) => grupos.has(i.grupo)));
});

test('a config lê-se com ou sem a coluna addons no servidor', () => {
  const com = teamStatConfigMapper.fromRow({ team_id: 't', registos: ['remate'], addons: ['vista-nova'] });
  assert.deepEqual(com.addons, ['vista-nova']);
  const sem = teamStatConfigMapper.fromRow({ team_id: 't', registos: ['remate'] });
  assert.deepEqual(sem.addons, []);
});
