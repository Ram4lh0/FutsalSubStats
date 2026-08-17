// tests/painel.test.js — as regras do painel de administração.
//
// O painel corre só em `localhost` e com a chave de serviço, ou seja com poder
// para escrever em qualquer conta. Testam-se as partes que **decidem** alguma
// coisa: quem pode mudar de licença, o que se recusa a convidar, e a guarda que
// impede uma página aberta noutro separador de falar com isto.
//
// O resto — desenhar tabelas — não se testa aqui, porque enganar-se a desenhar
// uma tabela vê-se ao olhar para ela.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  emailValido,
  normalizar,
  podeMudarLicenca,
  estado,
  convidar,
  mudarLicenca,
} from '../tools/painel/api.mjs';
import { hostAceite, chaveDoPedido, chaveCorrecta } from '../tools/painel/guardas.mjs';

/* ------------------------------------------------------------ validações */

test('o email é conferido antes de o convite sair', () => {
  // Depois de sair não se desfaz: fica uma conta órfã em `auth.users`, e o
  // email foi para o sítio errado ou para sítio nenhum.
  assert.equal(emailValido('treinador@clube.pt'), true);
  assert.equal(emailValido('ze.silva+sub15@clube.co.uk'), true);
  assert.equal(emailValido('treinador'), false);
  assert.equal(emailValido('treinador@clube'), false);
  assert.equal(emailValido('com espaço@clube.pt'), false);
  assert.equal(emailValido(''), false);
  assert.equal(emailValido(null), false);
});

test('o email desce a minúsculas', () => {
  // O Supabase guarda-os assim. Sem isto criava-se uma conta que depois este
  // mesmo painel não voltava a encontrar.
  assert.equal(normalizar('  Ze@Clube.PT '), 'ze@clube.pt');
});

/* --------------------------------------------------------------- licenças */

test('subir de treinador para clube é sempre possível', () => {
  const r = podeMudarLicenca({ de: 'treinador', para: 'clube', escaloesActivos: 1 });
  assert.equal(r.ok, true);
});

test('descer para treinador com um escalão só também', () => {
  const r = podeMudarLicenca({ de: 'clube', para: 'treinador', escaloesActivos: 1 });
  assert.equal(r.ok, true);
});

test('mas não com escalões a mais', () => {
  // O limite de um escalão vive num gatilho que só corre ao **criar**. Descer a
  // licença de quem já tem três não apaga nada: fica uma conta num estado que a
  // app nunca produziria, e nada rebenta — que é o que torna isto perigoso.
  const r = podeMudarLicenca({ de: 'clube', para: 'treinador', escaloesActivos: 3 });
  assert.equal(r.ok, false);
  assert.match(r.porque, /3 escalões/);
  assert.match(r.porque, /Arquiva/, 'a recusa tem de dizer o que fazer a seguir');
});

test('e não se muda para a licença que já se tem', () => {
  const r = podeMudarLicenca({ de: 'clube', para: 'clube', escaloesActivos: 0 });
  assert.equal(r.ok, false);
});

test('uma licença inventada é recusada', () => {
  const r = podeMudarLicenca({ de: 'treinador', para: 'vitalicia', escaloesActivos: 0 });
  assert.equal(r.ok, false);
});

/* ---------------------------------------------------- a guarda do servidor */

test('só se aceita o Host desta máquina', () => {
  // Sem isto, alguém aponta um domínio seu para 127.0.0.1 e fala com o painel a
  // partir de uma página que controla — e para o browser a origem é a dele.
  assert.equal(hostAceite('127.0.0.1:4321', 4321), true);
  assert.equal(hostAceite('localhost:4321', 4321), true);
  assert.equal(hostAceite('painel.exemplo.com', 4321), false);
  assert.equal(hostAceite('127.0.0.1:9999', 4321), false);
  assert.equal(hostAceite(undefined, 4321), false);
});

test('a chave lê-se do cabeçalho ou do endereço', () => {
  assert.equal(chaveDoPedido('/api/estado', { 'x-painel': 'abc' }), 'abc');
  assert.equal(chaveDoPedido('/?chave=abc', {}), 'abc');
  assert.equal(chaveDoPedido('/api/estado', {}), null);
});

test('a chave errada não passa, e a certa passa', () => {
  assert.equal(chaveCorrecta('a1b2c3', 'a1b2c3'), true);
  assert.equal(chaveCorrecta('a1b2c4', 'a1b2c3'), false);
  assert.equal(chaveCorrecta('a1b2c', 'a1b2c3'), false, 'nem sequer um prefixo');
  assert.equal(chaveCorrecta(null, 'a1b2c3'), false);
  assert.equal(chaveCorrecta(undefined, 'a1b2c3'), false);
});

/* ----------------------------------------------------- um Supabase de mentira */

/**
 * O mínimo do cliente que a `api.mjs` usa: `from(...).select(...)` com filtros
 * encadeados, `update`, `upsert`, e o `auth.admin.inviteUserByEmail`.
 */
function supabaseFalso(tabelas) {
  const chamadas = { convites: [], updates: [] };

  const consulta = (nome) => {
    let linhas = [...(tabelas[nome] || [])];
    const res = {
      select(_cols, opcoes) {
        if (opcoes?.head) res.count = linhas.length;
        return res;
      },
      eq(coluna, valor) {
        linhas = linhas.filter((l) => l[coluna] === valor);
        res.count = linhas.length;
        return res;
      },
      is(coluna, valor) {
        linhas = linhas.filter((l) => (l[coluna] ?? null) === valor);
        res.count = linhas.length;
        return res;
      },
      order: () => res,
      maybeSingle: () => Promise.resolve({ data: linhas[0] || null, error: null }),
      update(patch) {
        chamadas.updates.push({ tabela: nome, patch });
        return {
          eq(coluna, valor) {
            for (const l of tabelas[nome]) if (l[coluna] === valor) Object.assign(l, patch);
            return Promise.resolve({ error: null });
          },
        };
      },
      upsert(linha) {
        tabelas[nome].push(linha);
        return Promise.resolve({ error: null });
      },
      then: (resolver) => resolver({ data: linhas, error: null, count: linhas.length }),
    };
    return res;
  };

  return {
    chamadas,
    from: consulta,
    auth: {
      admin: {
        inviteUserByEmail(email) {
          chamadas.convites.push(email);
          if (tabelas.profiles.some((p) => p.email === email)) {
            return Promise.resolve({ data: null, error: new Error('email_exists') });
          }
          const user = { id: `id-${email}` };
          tabelas.profiles.push({ id: user.id, email, licenca: 'treinador' });
          return Promise.resolve({ data: { user }, error: null });
        },
      },
    },
  };
}

const cenario = () => ({
  profiles: [
    { id: 'u-gerente', email: 'gerente@clube.pt', licenca: 'clube', created_at: '2026-01-01' },
    { id: 'u-ana', email: 'ana@clube.pt', licenca: 'treinador', created_at: '2026-02-01' },
  ],
  clubs: [{ id: 'c-a', name: 'Clube A', owner_id: 'u-gerente', archived_at: null }],
  teams: [
    { id: 't-1', name: 'A1', club_id: 'c-a', archived_at: null },
    { id: 't-2', name: 'A2', club_id: 'c-a', archived_at: null },
    { id: 't-velho', name: 'A0', club_id: 'c-a', archived_at: '2026-01-01' },
  ],
  club_members: [{ club_id: 'c-a', user_id: 'u-ana' }],
  team_access: [{ team_id: 't-1', user_id: 'u-ana', nivel: 'editar' }],
  matches: [
    { id: 'm1', team_id: 't-1', club_id: 'c-a', scheduled_at: null, status: 'FINISHED' },
    { id: 'm2', team_id: 't-1', club_id: 'c-a', scheduled_at: null, status: 'FINISHED' },
    { id: 'm3', team_id: 't-2', club_id: 'c-a', scheduled_at: null, status: 'DRAFT' },
  ],
});

/* ---------------------------------------------------------------- leitura */

test('o estado conta o que interessa e não conta o que está arquivado', async () => {
  const e = await estado(supabaseFalso(cenario()));

  assert.equal(e.resumo.contas, 2);
  assert.equal(e.resumo.clubes, 1);
  assert.equal(e.resumo.escaloes, 2, 'o escalão arquivado não conta');
  assert.equal(e.resumo.jogos, 3);
  assert.equal(e.resumo.comLicencaClube, 1);
  assert.equal(e.resumo.semClube, 0, 'a ana está associada, não está sem clube');
});

test('os jogos contam para quem é dono do escalão, não para quem o vê', async () => {
  // A ana tem `editar` no A1 e os jogos do A1 são do clube do gerente. Se
  // contassem para ela, o painel dizia que dois clientes tinham feito o mesmo
  // jogo — e o número deixava de servir para saber quem usa a app.
  const e = await estado(supabaseFalso(cenario()));
  const gerente = e.contas.find((c) => c.email === 'gerente@clube.pt');
  const ana = e.contas.find((c) => c.email === 'ana@clube.pt');

  assert.equal(gerente.jogos, 3);
  assert.equal(ana.jogos, 0);
  assert.deepEqual(ana.partilhados.map((p) => `${p.nome}:${p.nivel}`), ['A1:editar']);
  assert.deepEqual(ana.associadoA.map((c) => c.nome), ['Clube A']);
  assert.equal(ana.clube, null);
});

test('o dono do clube não aparece como associado a si próprio', async () => {
  const dados = cenario();
  dados.club_members.push({ club_id: 'c-a', user_id: 'u-gerente' });
  const e = await estado(supabaseFalso(dados));
  const gerente = e.contas.find((c) => c.email === 'gerente@clube.pt');

  assert.deepEqual(gerente.associadoA, []);
  assert.equal(gerente.clube.nome, 'Clube A');
});

/* ---------------------------------------------------------------- escrita */

test('convidar cria a conta já com a licença escolhida', async () => {
  const dados = cenario();
  const sb = supabaseFalso(dados);
  const r = await convidar(sb, { email: '  Novo@Clube.PT ', licenca: 'clube' });

  assert.equal(r.email, 'novo@clube.pt', 'o email não foi normalizado');
  assert.equal(r.novaConta, true);
  assert.deepEqual(sb.chamadas.convites, ['novo@clube.pt']);
  assert.equal(dados.profiles.find((p) => p.email === 'novo@clube.pt').licenca, 'clube');
});

test('convidar quem já existe não repete o convite mas actualiza a licença', async () => {
  const dados = cenario();
  const sb = supabaseFalso(dados);
  const r = await convidar(sb, { email: 'ana@clube.pt', licenca: 'clube' });

  assert.equal(r.novaConta, false);
  assert.match(r.mensagem, /já tinha conta/);
  assert.equal(dados.profiles.find((p) => p.email === 'ana@clube.pt').licenca, 'clube');
});

test('convidar com um email torto não chega a chamar o Supabase', async () => {
  const sb = supabaseFalso(cenario());
  await assert.rejects(() => convidar(sb, { email: 'isto-não-é-email', licenca: 'clube' }));
  assert.deepEqual(sb.chamadas.convites, [], 'o convite chegou a sair');
});

test('convidar com uma licença inventada também não', async () => {
  const sb = supabaseFalso(cenario());
  await assert.rejects(() => convidar(sb, { email: 'ok@clube.pt', licenca: 'vitalicia' }));
  assert.deepEqual(sb.chamadas.convites, []);
});

test('convidar com clube associa à parte', async () => {
  const dados = cenario();
  const sb = supabaseFalso(dados);
  await convidar(sb, { email: 'rui@clube.pt', licenca: 'treinador', clubeId: 'c-a' });

  assert.ok(
    dados.club_members.some((m) => m.club_id === 'c-a' && m.user_id === 'id-rui@clube.pt'),
    'não ficou associado ao clube'
  );
});

test('uma licença de clube não se associa ao clube de outra pessoa', async () => {
  // Quem tem licença de clube cria o seu na app. Associá-lo ao de outro dava-lhe
  // um clube que não é dele, e continuava a poder criar o seu — dois na lista,
  // que é o que a app foi feita para não ter.
  const sb = supabaseFalso(cenario());
  await assert.rejects(
    () => convidar(sb, { email: 'gerente2@clube.pt', licenca: 'clube', clubeId: 'c-a' }),
    /própria|próprio/
  );
  assert.deepEqual(sb.chamadas.convites, [], 'o convite saiu antes de a recusa acontecer');
});

test('mudar a licença do gerente para treinador é recusado — tem dois escalões', async () => {
  const dados = cenario();
  const sb = supabaseFalso(dados);

  await assert.rejects(
    () => mudarLicenca(sb, { userId: 'u-gerente', licenca: 'treinador' }),
    /2 escalões/
  );
  assert.equal(dados.profiles.find((p) => p.id === 'u-gerente').licenca, 'clube', 'mudou à mesma');
});

test('mas a ana sobe a clube sem problema', async () => {
  const dados = cenario();
  const r = await mudarLicenca(supabaseFalso(dados), { userId: 'u-ana', licenca: 'clube' });

  assert.equal(r.licenca, 'clube');
  assert.equal(dados.profiles.find((p) => p.id === 'u-ana').licenca, 'clube');
});

test('uma conta que não existe dá uma mensagem clara', async () => {
  await assert.rejects(
    () => mudarLicenca(supabaseFalso(cenario()), { userId: 'u-ninguem', licenca: 'clube' }),
    /Não há conta nenhuma/
  );
});
