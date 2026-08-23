// tests/emails.test.js — os emails do Supabase e o ecrã que os recebe.
//
// Estes emails são o único código do projeto que corre fora dele: quem os
// interpreta é o servidor do Supabase, e quem os lê é um cliente de email. Não
// há build que os verifique, não há erro em lado nenhum se estiverem mal — sai
// uma mensagem estragada e só se descobre depois de entregue.
//
// Por isso o que aqui se protege não é o desenho, é o contrato:
//
//   · as variáveis do Supabase estão escritas como o Supabase as lê;
//   · o link do convite aponta para uma página que existe;
//   · o `tipo` que o email manda é um dos que a página aceita.
//
// Esse último é o que mais vale: são dois ficheiros distantes que têm de
// concordar, e nada além disto os obriga.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const EMAILS = join(RAIZ, 'supabase', 'emails');

const ficheiros = readdirSync(EMAILS).filter(
  (n) => n.endsWith('.html') && n !== 'pre-visualizar.html'
);
const ler = (n) => readFileSync(join(EMAILS, n), 'utf8');

test('estão lá os seis', () => {
  assert.equal(ficheiros.length, 6, `encontrados: ${ficheiros.join(', ')}`);
});

test('as variáveis estão escritas como o Supabase as lê', () => {
  // `{{.Email}}` ou `{{ .email }}` não dão erro nenhum: passam por texto e saem
  // impressos no email, à frente da pessoa. Só se descobre depois de enviado.
  const conhecidas = ['ConfirmationURL', 'Token', 'TokenHash', 'SiteURL', 'Email', 'NewEmail'];
  for (const n of ficheiros) {
    for (const m of ler(n).matchAll(/\{\{([^}]*)\}\}/g)) {
      assert.match(m[1], /^ \.[A-Za-z]+ $/, `${n}: {{${m[1]}}} — falta o ponto ou os espaços`);
      assert.ok(conhecidas.includes(m[1].trim().slice(1)), `${n}: {{${m[1]}}} desconhecida`);
    }
  }
});

// Os dois emails que chegam a quem ainda não conhece a app não levam código: o
// botão fica sozinho em destaque, e o aviso do fim diz o que fazer se o link
// falhar. Nos outros quatro o código fica, porque aí quem lê já usa a app — e a
// reautenticação nem sequer tem link.
const SEM_CODIGO = new Set(['2-convite.html', '5-recuperar-palavra-passe.html']);

test('o convite e a recuperação não têm código nenhum', () => {
  for (const n of SEM_CODIGO) {
    assert.doesNotMatch(ler(n), /\{\{ \.Token \}\}/, `${n} ainda tem o código`);
  }
});

test('os outros levam o código, que é a saída para um link já gasto', () => {
  // Os filtros de segurança de algumas empresas abrem os links das mensagens
  // antes de as entregar, e como estes links só servem uma vez, chegam gastos.
  // O código não se gasta a ser lido, e o ecrã `/password/` aceita-o.
  for (const n of ficheiros) {
    if (SEM_CODIGO.has(n)) continue;
    assert.match(ler(n), /\{\{ \.Token \}\}/, `${n} não tem o código`);
  }
});

test('quem não tem código tem um botão, senão ficava sem saída nenhuma', () => {
  for (const n of SEM_CODIGO) {
    assert.match(ler(n), /TokenHash/, `${n} não tem link nenhum`);
  }
});

test('a reautenticação não promete um botão que não existe', () => {
  // O Supabase não gera `ConfirmationURL` nenhum para este email — só o código.
  // Um botão aqui apontaria para lado nenhum.
  const html = ler('6-reautenticacao.html');
  assert.doesNotMatch(html, /ConfirmationURL/);
});

test('o convite e a recuperação levam ao ecrã da palavra-passe', () => {
  const alvos = {
    '2-convite.html': 'invite',
    '5-recuperar-palavra-passe.html': 'recovery',
  };
  for (const [ficheiro, tipo] of Object.entries(alvos)) {
    const html = ler(ficheiro);
    assert.match(
      html,
      new RegExp(`\\{\\{ \\.SiteURL \\}\\}/password/\\?th=\\{\\{ \\.TokenHash \\}\\}&amp;tipo=${tipo}`),
      `${ficheiro}: o botão não aponta para /password/ com tipo=${tipo}`
    );
    // Nunca o `ConfirmationURL`: o cliente do Supabase desta app é criado com
    // `detectSessionInUrl: false`, e uma sessão que chegue no fim do endereço é
    // ignorada. O link abria a app e não acontecia nada.
    assert.doesNotMatch(html, /ConfirmationURL/, `${ficheiro} ainda usa ConfirmationURL`);
  }
});

test('o `tipo` que o email manda é um dos que a página aceita', () => {
  // Os dois ficheiros vivem longe um do outro e têm de concordar. Mudar a lista
  // de um lado sem mexer no outro parte o convite em silêncio.
  const pagina = readFileSync(join(RAIZ, 'src', 'app', 'password', 'page.jsx'), 'utf8');
  const declarados = pagina.match(/const TIPOS = \[([^\]]*)\]/);
  assert.ok(declarados, 'a página deixou de declarar TIPOS');
  const aceites = declarados[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));

  const usados = new Set();
  for (const n of ficheiros) {
    for (const m of ler(n).matchAll(/tipo=([a-z_]+)/g)) usados.add(m[1]);
  }
  assert.ok(usados.size, 'nenhum email aponta para a página');
  for (const tipo of usados) {
    assert.ok(aceites.includes(tipo), `os emails mandam "${tipo}" e a página só aceita ${aceites}`);
  }
});

test('a página da palavra-passe não fica atrás do Guard', () => {
  // Quem chega pelo convite ainda não tem sessão — é esta página que lha vai
  // dar. Envolvê-la em `Pagina` (que traz o `Guard`) atira-o para a entrada
  // antes de o símbolo ser lido, e o convite deixa de servir para nada.
  const pagina = readFileSync(join(RAIZ, 'src', 'app', 'password', 'page.jsx'), 'utf8');
  assert.doesNotMatch(pagina, /from '@\/components\/Pagina\.jsx'/);
  assert.doesNotMatch(pagina, /from '@\/components\/Guard\.jsx'/);
  // Mas o `<Suspense>` tem de lá estar: `useSearchParams` obriga.
  assert.match(pagina, /<Suspense/);
});

test('quem tem sessão mas não tem palavra-passe tem sempre uma saída', () => {
  // O buraco que este teste tapa: a página decidia se pedia a palavra-passe
  // atual olhando **só** para o endereço. Quem chegasse com sessão iniciada e
  // sem palavra-passe nenhuma — por link mágico, ou por um convite que não
  // passasse por aqui — via um campo que lhe exigia uma que nunca existiu, e
  // ficava fechado por fora de dentro da própria conta.
  const pagina = readFileSync(join(RAIZ, 'src', 'app', 'password', 'page.jsx'), 'utf8');
  assert.match(pagina, /pass\.naoSei/, 'desapareceu o "não sei a palavra-passe atual"');
  assert.match(pagina, /pedirRecuperacao\(user\?\.email/, 'o botão deixou de pedir o email');

  // E tem de estar no mesmo sítio que o campo, não escondido atrás de uma
  // tentativa falhada: quem nunca teve palavra-passe não tem sequer o que errar.
  const bloco = pagina.slice(pagina.indexOf("autoComplete=\"current-password\""));
  const ate = bloco.indexOf('</>');
  assert.ok(ate > 0 && bloco.slice(0, ate).includes('pass.naoSei'), 'a saída saiu de ao pé do campo');
});

test('a palavra-passe atual é confirmada antes de ser mudada', () => {
  // O `updateUser` do Supabase não a pede: basta ter sessão, e a sessão vive
  // meses dentro do telemóvel. Sem esta confirmação, um aparelho destrancado
  // esquecido em cima de um banco era uma conta perdida.
  const pagina = readFileSync(join(RAIZ, 'src', 'app', 'password', 'page.jsx'), 'utf8');
  const i = pagina.indexOf('confirmarPalavraPasse(user?.email');
  const j = pagina.indexOf('definirPalavraPasse(nova)');
  assert.ok(i > 0, 'deixou de confirmar a palavra-passe atual');
  assert.ok(j > i, 'a nova é escrita antes de a atual ser confirmada');
});
