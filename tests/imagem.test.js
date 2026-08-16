// tests/imagem.test.js — as contas de preparar um emblema.
//
// O recorte e o desenho precisam de um browser e ficam de fora. O que se testa
// aqui é o que decide **quanto ocupa** a imagem que vai ser guardada — e isso
// não precisa de canvas nenhum.
//
// Porque é que isto importa: a imagem é guardada dentro da linha do clube, e
// sobe e desce em cada sincronização. Um limite mal medido não parte nada
// visível; faz a app arrastar-se num pavilhão com meia barra de rede, que é o
// pior sítio para descobrir.

import test from 'node:test';
import assert from 'node:assert/strict';

const { recorteCentral, tamanhoEmBytes, LADO, MAX_BYTES, QUALIDADES, TIPOS } =
  await import('../src/lib/imagem.js');

test('o recorte é sempre um quadrado, centrado', () => {
  // Paisagem: corta dos lados.
  assert.deepEqual(recorteCentral(4000, 3000), { x: 500, y: 0, lado: 3000 });
  // Retrato: corta de cima e de baixo.
  assert.deepEqual(recorteCentral(1080, 1920), { x: 0, y: 420, lado: 1080 });
  // Já quadrada: não corta nada.
  assert.deepEqual(recorteCentral(512, 512), { x: 0, y: 0, lado: 512 });
});

test('uma dimensão ímpar não faz o recorte sair do sítio', () => {
  const r = recorteCentral(101, 50);
  assert.equal(r.lado, 50);
  assert.ok(r.x >= 0 && r.x + r.lado <= 101, 'o recorte saiu da imagem');
  assert.equal(r.y, 0);
});

test('o tamanho é medido em bytes, não em letras', () => {
  // Um `data:` URL é ~33% maior do que a imagem que representa. Medir o
  // comprimento do texto dava um limite 33% mais apertado do que o pretendido —
  // e a imagem sairia pior sem razão nenhuma.
  const tresBytes = 'data:image/webp;base64,' + Buffer.from([1, 2, 3]).toString('base64');
  assert.equal(tamanhoEmBytes(tresBytes), 3);

  const umByte = 'data:image/webp;base64,' + Buffer.from([9]).toString('base64');
  assert.equal(tamanhoEmBytes(umByte), 1, 'o enchimento `==` não conta');

  const doisBytes = 'data:image/webp;base64,' + Buffer.from([9, 9]).toString('base64');
  assert.equal(tamanhoEmBytes(doisBytes), 2, 'o enchimento `=` não conta');
});

test('o que não é um data URL vale zero', () => {
  assert.equal(tamanhoEmBytes(''), 0);
  assert.equal(tamanhoEmBytes(null), 0);
  assert.equal(tamanhoEmBytes('https://exemplo.pt/logo.png'), 0);
});

test('os limites continuam sensatos', () => {
  // Não é um teste de comportamento: é um alarme. Se alguém subir estes valores
  // sem pensar, a linha do clube passa a arrastar meio megabyte em cada
  // sincronização e ninguém liga uma coisa à outra.
  assert.ok(LADO <= 512, 'um emblema não precisa de mais do que 512 px');
  assert.ok(MAX_BYTES <= 64 * 1024, 'acima de 64 KB isto deixa de caber numa linha sem custar');
  assert.ok(QUALIDADES.length >= 3, 'poucos degraus e as fotografias não chegam a caber');
  assert.deepEqual([...QUALIDADES].sort((a, b) => b - a), QUALIDADES, 'tem de descer, não subir');
});

test('só entram formatos que os browsers sabem desenhar', () => {
  assert.ok(TIPOS.includes('image/png') && TIPOS.includes('image/jpeg'));
  // O HEIC do iPhone não está na lista de propósito: o `createImageBitmap` não o
  // lê. O iOS converte para JPEG quando se escolhe pela galeria, e o que passar
  // à frente disso é recusado com uma frase em vez de rebentar.
  assert.ok(!TIPOS.includes('image/heic'));
});
