// tests/nome-da-app.test.js — o nome da app está escrito em oito sítios.
//
// Não há forma de os juntar num só. Cada plataforma quer o nome no formato dela,
// num ficheiro dela, e três deles nem sequer são JavaScript: um `strings.xml` do
// Android, um `Info.plist` do iOS, um `manifest.webmanifest` do browser.
//
// Isso torna a mudança de nome uma operação de oito passos onde é normal ficar
// um para trás — e o que fica para trás não rebenta nada. Dá uma app que se
// chama uma coisa na barra de topo e outra por baixo do ícone, e só se descobre
// quando alguém manda uma captura.
//
// Este teste é o que substitui a lembrança.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ler = (...p) => readFileSync(join(RAIZ, ...p), 'utf8');

// A fonte da verdade é o dicionário português: é o nome que a app mostra na
// barra de topo, e o único que um utilizador vê a toda a hora.
const pt = (await import('../src/lib/i18n/pt.js')).default;
const en = (await import('../src/lib/i18n/en.js')).default;
const es = (await import('../src/lib/i18n/es.js')).default;
const NOME = pt['barra.marca'];

test('o nome não ficou vazio nem com espaços a mais', () => {
  assert.ok(NOME && NOME === NOME.trim(), `"barra.marca" está estranho: ${JSON.stringify(NOME)}`);
});

test('é o mesmo nos três idiomas', () => {
  // Uma marca não se traduz. Se alguém a traduzir, os treinadores espanhóis
  // passam a falar de outra app quando a recomendam.
  assert.equal(en['barra.marca'], NOME, 'en.js tem outro nome');
  assert.equal(es['barra.marca'], NOME, 'es.js tem outro nome');
});

test('é o mesmo na moldura do site', () => {
  const layout = ler('src', 'app', 'layout.js');
  const encontrados = [...layout.matchAll(/(?:title|applicationName):\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(encontrados.length >= 3, 'o layout deixou de declarar o nome');
  for (const n of encontrados) assert.equal(n, NOME);
});

test('é o mesmo no manifesto do browser', () => {
  const manifesto = JSON.parse(ler('public', 'manifest.webmanifest'));
  assert.equal(manifesto.name, NOME);
  // O `short_name` é o que cabe por baixo do ícone e **não** tem de ser igual —
  // o lançador corta o que passar de uns doze caracteres. Só tem de existir.
  assert.ok(manifesto.short_name, 'falta o short_name');
});

test('é o mesmo por baixo do ícone no Android', () => {
  const strings = ler('android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');
  for (const chave of ['app_name', 'title_activity_main']) {
    const m = strings.match(new RegExp(`<string name="${chave}">([^<]*)</string>`));
    assert.ok(m, `falta a string "${chave}"`);
    assert.equal(m[1], NOME, `strings.xml: "${chave}" está diferente`);
  }
});

test('é o mesmo por baixo do ícone no iOS', () => {
  const plist = ler('ios', 'App', 'App', 'Info.plist');
  const m = plist.match(/<key>CFBundleDisplayName<\/key>\s*<string>([^<]*)<\/string>/);
  assert.ok(m, 'falta o CFBundleDisplayName');
  assert.equal(m[1].trim(), NOME);
});

test('é o mesmo no Capacitor', () => {
  const cfg = JSON.parse(ler('capacitor.config.json'));
  assert.equal(cfg.appName, NOME);
});

/* ------------------------------------------------- o identificador */

// O outro nome da app: o que as lojas usam para a reconhecer. Ao contrário do
// que se vê na barra de topo, este **nunca mais muda** depois do primeiro envio
// — e está escrito em seis sítios, dois deles fora do JavaScript.
//
// O mais traiçoeiro é o Java: o pacote declarado dentro do `MainActivity.java`
// tem de coincidir com a pasta onde o ficheiro está. Se um mudar e o outro não,
// o Gradle recusa a compilação com um erro que fala de pacotes e não de pastas,
// e perde-se meia hora a perceber que era só um ficheiro no sítio errado.

const ID = JSON.parse(ler('capacitor.config.json')).appId;

test('o identificador tem a forma que as lojas exigem', () => {
  // Pelo menos dois pontos, letras minúsculas, sem hífens nem sublinhados: é o
  // que a Apple e a Google aceitam, e também o que o Java permite num pacote.
  assert.match(ID, /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/, `identificador estranho: ${ID}`);
});

test('o identificador é o mesmo no Android', () => {
  const gradle = ler('android', 'app', 'build.gradle');
  assert.match(gradle, new RegExp(`namespace = "${ID}"`), 'o namespace está diferente');
  assert.match(gradle, new RegExp(`applicationId "${ID}"`), 'o applicationId está diferente');

  const strings = ler('android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');
  for (const chave of ['package_name', 'custom_url_scheme']) {
    const m = strings.match(new RegExp(`<string name="${chave}">([^<]*)</string>`));
    assert.equal(m?.[1], ID, `strings.xml: "${chave}" está diferente`);
  }
});

test('o pacote do MainActivity condiz com a pasta onde ele está', () => {
  const caminho = join(RAIZ, 'android', 'app', 'src', 'main', 'java', ...ID.split('.'), 'MainActivity.java');
  assert.ok(existsSync(caminho), `o MainActivity.java não está em java/${ID.split('.').join('/')}/`);
  assert.match(readFileSync(caminho, 'utf8'), new RegExp(`^package ${ID.replace(/\./g, '\\.')};`, 'm'));
});

test('o identificador é o mesmo no iOS e no Codemagic', () => {
  const pbx = ler('ios', 'App', 'App.xcodeproj', 'project.pbxproj');
  const ids = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(ids.length >= 2, 'o projeto do Xcode deixou de declarar o bundle id');
  for (const i of ids) assert.equal(i, ID);

  // O Codemagic assina com base neste valor. Errado, o build corre e a Apple
  // recusa o envio no fim — depois de vinte minutos de compilação.
  const ci = ler('codemagic.yaml');
  assert.ok(ci.includes(ID), 'o codemagic.yaml tem outro identificador');
});

test('é o mesmo nos emails do Supabase', () => {
  // Estes são gerados; se alguém mudar o nome e não correr `npm run emails`,
  // os treinadores recebem um convite de uma app que já não se chama assim.
  const gerador = ler('tools', 'emails.mjs');
  const m = gerador.match(/const MARCA = '([^']+)'/);
  assert.ok(m, 'o gerador deixou de declarar a marca');
  assert.equal(m[1], NOME);
  assert.match(ler('supabase', 'emails', '2-convite.html'), new RegExp(NOME));
});
