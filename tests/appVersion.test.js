import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANDROID_APP_ID,
  compararVersoes,
  dadosAndroidDoManifesto,
  eAndroidNativo,
  existeVersaoNova,
  urlsManifestoVersao,
} from '../src/lib/appVersion.js';

test('compara versões numéricas como versões, não como texto', () => {
  assert.equal(compararVersoes('1.10', '1.2'), 1);
  assert.equal(compararVersoes('1.1', '1.1.0'), 0);
  assert.equal(compararVersoes('1.1', '1.2'), -1);
  assert.equal(compararVersoes('2', '1.9.9'), 1);
});

test('só avisa quando a versão publicada é maior', () => {
  assert.equal(existeVersaoNova('1.1', '1.2'), true);
  assert.equal(existeVersaoNova('1.2', '1.2'), false);
  assert.equal(existeVersaoNova('1.3', '1.2'), false);
});

test('reconhece apenas o Android dentro do invólucro nativo', () => {
  assert.equal(eAndroidNativo({ getPlatform: () => 'android', isNativePlatform: () => true }), true);
  assert.equal(eAndroidNativo({ getPlatform: () => 'ios', isNativePlatform: () => true }), false);
  assert.equal(eAndroidNativo({ getPlatform: () => 'web', isNativePlatform: () => false }), false);
});

test('lê os dados Android do manifesto com valores por defeito', () => {
  const dados = dadosAndroidDoManifesto({ android: { latestVersion: '2.0' } });
  assert.equal(dados.appId, ANDROID_APP_ID);
  assert.equal(dados.latestVersion, '2.0');
  assert.match(dados.playStoreUrl, /play\.google\.com/);
});

test('tenta primeiro o manifesto configurado e evita duplicados', () => {
  const urls = urlsManifestoVersao({
    origem: 'https://futsalstats.vercel.app',
    configurado: 'https://exemplo.test/app-version.json',
  });
  assert.equal(urls[0], 'https://exemplo.test/app-version.json');
  assert.equal(new Set(urls).size, urls.length);
});
