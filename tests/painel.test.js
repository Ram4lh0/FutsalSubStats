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
  jogosPorConta,
  convidar,
  mudarLicenca,
  removerLicenca,
  associarClube,
  desassociarClube,
  feedbacks,
} from '../tools/painel/api.mjs';
import { hostAceite, chaveDoPedido, chaveCorrecta } from '../tools/painel/guardas.mjs';
import {
  catalogoDoPainel,
  catalogoCompleto,
  definirRegistos,
  registosDoClube,
  registosDoEscalao,
} from '../tools/painel/registos.mjs';

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
      in(coluna, valores) {
        linhas = linhas.filter((l) => valores.includes(l[coluna]));
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
      upsert(linha, opcoes) {
        // Como no Postgres: com `onConflict`, a linha com a mesma chave é
        // substituída em vez de repetida.
        const chaves = opcoes?.onConflict ? opcoes.onConflict.split(',') : null;
        const i = chaves
          ? tabelas[nome].findIndex((l) => chaves.every((k) => l[k] === linha[k]))
          : -1;
        if (i >= 0) tabelas[nome][i] = { ...tabelas[nome][i], ...linha };
        else tabelas[nome].push(linha);
        return Promise.resolve({ error: null });
      },
      delete() {
        const filtros = [];
        return {
          eq(coluna, valor) {
            filtros.push((l) => l[coluna] === valor);
            for (let i = tabelas[nome].length - 1; i >= 0; i -= 1) {
              if (filtros.every((f) => f(tabelas[nome][i]))) tabelas[nome].splice(i, 1);
            }
            return this;
          },
          in(coluna, valores) {
            filtros.push((l) => valores.includes(l[coluna]));
            for (let i = tabelas[nome].length - 1; i >= 0; i -= 1) {
              if (filtros.every((f) => f(tabelas[nome][i]))) tabelas[nome].splice(i, 1);
            }
            return Promise.resolve({ error: null });
          },
          then: (resolver) => resolver({ error: null }),
        };
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

test('os add-ons são do escalão: quem tem acesso a ele herda os mesmos', async () => {
  const dados = cenario();
  dados.team_stat_config = [{ team_id: 't-1', registos: ['remate', 'recuperacao'] }];
  const e = await estado(supabaseFalso(dados));
  const gerente = e.contas.find((c) => c.email === 'gerente@clube.pt');
  const ana = e.contas.find((c) => c.email === 'ana@clube.pt');

  assert.deepEqual(
    gerente.escaloesComRegistos.map((x) => `${x.nome}:${x.registos.join('+')}`),
    ['A1:remate+recuperacao', 'A2:']
  );
  assert.deepEqual(ana.escaloesComRegistos, [], 'a ana não é dona de escalões');
  assert.deepEqual(ana.partilhados[0].registos, ['remate', 'recuperacao']);
});

test('sem a tabela dos add-ons o painel abre na mesma', async () => {
  const sb = supabaseFalso(cenario());
  const from = sb.from;
  sb.from = (nome) => {
    if (nome !== 'team_stat_config') return from(nome);
    const falha = { select: () => falha, then: (ok) => ok({ data: null, error: new Error('não existe') }) };
    return falha;
  };
  const e = await estado(sb);
  assert.equal(e.resumo.contas, 2);
  assert.deepEqual(e.contas.find((c) => c.email === 'gerente@clube.pt').escaloesComRegistos[0].registos, []);
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

test('o painel admin pode criar uma licença de clube já associada a outro clube', async () => {
  const sb = supabaseFalso(cenario());
  const r = await convidar(sb, { email: 'gerente2@clube.pt', licenca: 'clube', clubeId: 'c-a' });
  assert.equal(r.licenca, 'clube');
  assert.ok(sb.chamadas.convites.includes('gerente2@clube.pt'));
});

test('convidar também deixa a conta com license_status activo', async () => {
  const dados = cenario();
  const sb = supabaseFalso(dados);
  await convidar(sb, { email: 'nova@clube.pt', licenca: 'treinador' });

  const perfil = dados.profiles.find((p) => p.email === 'nova@clube.pt');
  assert.equal(perfil.license_status, 'active', 'sem isto a app trata a conta como sem licença');
  assert.equal(perfil.license_source, 'legacy');
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

test('mudar a licença também liga o estado que a app confere de verdade', async () => {
  // `licenca` e `license_expires_at` não bastam: a app só considera a licença
  // activa quando `license_status` é 'trial'/'active'/'grace' (ver
  // src/lib/license.js). Uma conta com licença e validade certas mas
  // `license_status` esquecido fica, na app, como se não tivesse licença
  // nenhuma — foi exactamente isto que aconteceu a uma conta real.
  const dados = cenario();
  const r = await mudarLicenca(supabaseFalso(dados), { userId: 'u-ana', licenca: 'clube' });

  assert.equal(r.licenca, 'clube');
  const perfil = dados.profiles.find((p) => p.id === 'u-ana');
  assert.equal(perfil.license_status, 'active', 'sem isto a app trata a conta como sem licença');
  assert.equal(perfil.license_source, 'legacy');
});

test('a validade pode ser actualizada sem trocar o tipo de licença', async () => {
  const dados = cenario();
  const r = await mudarLicenca(supabaseFalso(dados), {
    userId: 'u-ana',
    licenca: 'treinador',
    validade: '2027-06-30',
  });

  assert.equal(r.licenca, 'treinador');
  assert.equal(dados.profiles.find((p) => p.id === 'u-ana').license_expires_at, '2027-06-30T23:59:59.999Z');
});

test('remover licença deixa a conta como treinador expirado', async () => {
  const dados = cenario();
  const r = await removerLicenca(supabaseFalso(dados), { userId: 'u-ana' });

  assert.equal(r.licenca, 'treinador');
  assert.equal(dados.profiles.find((p) => p.id === 'u-ana').license_expires_at, '1970-01-01T00:00:00.000Z');
});

test('associar e desassociar clube mexe em membros e acessos', async () => {
  const dados = cenario();
  const sb = supabaseFalso(dados);
  dados.club_members = [];

  await associarClube(sb, { userId: 'u-ana', clubeId: 'c-a' });
  assert.ok(dados.club_members.some((m) => m.user_id === 'u-ana' && m.club_id === 'c-a'));

  await desassociarClube(sb, { userId: 'u-ana', clubeId: 'c-a' });
  assert.equal(dados.club_members.some((m) => m.user_id === 'u-ana' && m.club_id === 'c-a'), false);
  assert.equal(dados.team_access.some((a) => a.user_id === 'u-ana'), false);
});

test('uma conta que não existe dá uma mensagem clara', async () => {
  await assert.rejects(
    () => mudarLicenca(supabaseFalso(cenario()), { userId: 'u-ninguem', licenca: 'clube' }),
    /Não há conta nenhuma/
  );
});

/* ------------------------------------------- registos extra por escalão */

test('o catálogo do painel tem os registos todos (fase 1, remates do adversário e perdas)', () => {
  assert.deepEqual(
    catalogoDoPainel().map((r) => r.id),
    ['remate', 'defesa_gr', 'recuperacao', 'fora', 'canto', 'acao', 'remate_adv', 'perda_bola']
  );
  assert.equal(catalogoDoPainel().find((r) => r.id === 'perda_bola').nome, 'Perdas de bola');
});

test('um escalão sem config lê-se como sem registos', async () => {
  const dados = { ...cenario(), team_stat_config: [] };
  const r = await registosDoEscalao(supabaseFalso(dados), 't-1');
  assert.deepEqual(r.registos, []);
  assert.equal(r.nome, 'A1');
});

test('definir os registos grava a lista validada, pela ordem do catálogo', async () => {
  const dados = { ...cenario(), team_stat_config: [] };
  const sb = supabaseFalso(dados);
  const r = await definirRegistos(sb, { teamId: 't-1', registos: ['canto', 'remate', 'remate'] });
  assert.deepEqual(r.registos, ['remate', 'canto']);
  assert.deepEqual(dados.team_stat_config, [{ team_id: 't-1', registos: ['remate', 'canto'] }]);
  assert.match(r.mensagem, /A1/);

  // Gravar outra vez substitui, não repete.
  await definirRegistos(sb, { teamId: 't-1', registos: ['recuperacao'] });
  assert.equal(dados.team_stat_config.length, 1);
  assert.deepEqual((await registosDoEscalao(sb, 't-1')).registos, ['recuperacao']);
});

test('desligar tudo grava uma lista vazia em vez de apagar a linha', async () => {
  const dados = { ...cenario(), team_stat_config: [{ team_id: 't-1', registos: ['remate'] }] };
  await definirRegistos(supabaseFalso(dados), { teamId: 't-1', registos: [] });
  assert.deepEqual(dados.team_stat_config, [{ team_id: 't-1', registos: [] }]);
});

test('um registo fora do catálogo é recusado sem tocar no Supabase', async () => {
  const dados = { ...cenario(), team_stat_config: [] };
  await assert.rejects(
    () => definirRegistos(supabaseFalso(dados), { teamId: 't-1', registos: ['remate', 'nota'] }),
    /nota/
  );
  await assert.rejects(
    () => definirRegistos(supabaseFalso(dados), { teamId: 't-1', registos: 'remate' }),
    /array/
  );
  assert.deepEqual(dados.team_stat_config, []);
});

test('não se ligam registos num escalão arquivado ou que não existe', async () => {
  const dados = { ...cenario(), team_stat_config: [] };
  await assert.rejects(
    () => definirRegistos(supabaseFalso(dados), { teamId: 't-velho', registos: ['remate'] }),
    /Não há escalão activo/
  );
  await assert.rejects(
    () => definirRegistos(supabaseFalso(dados), { teamId: 't-nada', registos: ['remate'] }),
    /Não há escalão activo/
  );
  assert.deepEqual(dados.team_stat_config, []);
});

/* --------------------------------------------------------------- add-ons */

const ADDONS_FALSOS = {
  'vista-nova': { grupo: 'dashboard', nome: 'Vista nova' },
  'mapa-baliza': { grupo: 'resumo', nome: 'Zona da baliza', depende: ['remate'] },
};

test('definir grava os add-ons junto com os registos', async () => {
  const dados = { ...cenario(), team_stat_config: [] };
  const r = await definirRegistos(supabaseFalso(dados), {
    teamId: 't-1',
    registos: ['remate'],
    addons: ['mapa-baliza', 'vista-nova'],
    catalogoAddons: ADDONS_FALSOS,
  });
  assert.deepEqual(dados.team_stat_config, [
    { team_id: 't-1', registos: ['remate'], addons: ['vista-nova', 'mapa-baliza'] },
  ]);
  assert.match(r.mensagem, /Remates, Vista nova, Zona da baliza/);
});

test('um add-on fora do catálogo é recusado sem tocar no Supabase', async () => {
  const dados = { ...cenario(), team_stat_config: [] };
  await assert.rejects(
    () => definirRegistos(supabaseFalso(dados), {
      teamId: 't-1', registos: [], addons: ['inventado'], catalogoAddons: ADDONS_FALSOS,
    }),
    /inventado/
  );
  assert.deepEqual(dados.team_stat_config, []);
});

test('sem add-ons e sem a coluna no servidor, grava só os registos', async () => {
  // Servidor ainda sem a migração: a linha não tem `addons`, e mandar a
  // coluna partia a gravação dos registos.
  const dados = { ...cenario(), team_stat_config: [{ team_id: 't-1', registos: ['remate'] }] };
  await definirRegistos(supabaseFalso(dados), { teamId: 't-1', registos: [], addons: [] });
  assert.deepEqual(dados.team_stat_config, [{ team_id: 't-1', registos: [] }]);
});

test('desligar os add-ons grava a lista vazia quando a coluna já existe', async () => {
  const dados = {
    ...cenario(),
    team_stat_config: [{ team_id: 't-1', registos: ['remate'], addons: ['vista-nova'] }],
  };
  await definirRegistos(supabaseFalso(dados), {
    teamId: 't-1', registos: ['remate'], addons: [], catalogoAddons: ADDONS_FALSOS,
  });
  assert.deepEqual(dados.team_stat_config, [{ team_id: 't-1', registos: ['remate'], addons: [] }]);
});

test('o estado traz os add-ons de cada escalão, também para quem os herda', async () => {
  const dados = cenario();
  dados.team_stat_config = [{ team_id: 't-1', registos: ['remate'], addons: ['vista-nova'] }];
  const e = await estado(supabaseFalso(dados));
  const gerente = e.contas.find((c) => c.email === 'gerente@clube.pt');
  const ana = e.contas.find((c) => c.email === 'ana@clube.pt');
  assert.deepEqual(gerente.escaloesComRegistos[0].addons, ['vista-nova']);
  assert.deepEqual(ana.partilhados[0].addons, ['vista-nova']);
});

test('o catálogo completo do painel tem os grupos e os registos', () => {
  const c = catalogoCompleto(ADDONS_FALSOS);
  assert.equal(c.grupos[0].id, 'registos');
  assert.deepEqual(c.itens.filter((i) => i.campo === 'addons').map((i) => i.id), ['vista-nova', 'mapa-baliza']);
});

test('os registos do clube vêm por escalão activo', async () => {
  const dados = { ...cenario(), team_stat_config: [{ team_id: 't-2', registos: ['fora', 'canto'] }] };
  const r = await registosDoClube(supabaseFalso(dados), 'c-a');
  assert.deepEqual(
    r.escaloes.map((e) => [e.teamId, e.registos]),
    [['t-1', []], ['t-2', ['fora', 'canto']]]
  );
  assert.equal(r.catalogo.length, 8);
});

test('cada conta traz os últimos jogos que vê, do mais recente para o mais antigo', async () => {
  const dados = cenario();
  dados.matches = [
    { id: 'm1', team_id: 't-1', club_id: 'c-a', scheduled_at: '2026-10-01T10:00:00Z', status: 'FINISHED', opponent_name: 'Benfica', home_or_away: 'HOME', team_score: 3, opponent_score: 1 },
    { id: 'm2', team_id: 't-1', club_id: 'c-a', scheduled_at: '2026-10-20T10:00:00Z', status: 'FINISHED', opponent_name: 'Sporting', home_or_away: 'AWAY', team_score: 0, opponent_score: 2 },
    { id: 'm3', team_id: 't-2', club_id: 'c-a', scheduled_at: '2026-10-25T10:00:00Z', status: 'DRAFT', opponent_name: 'Porto' },
    { id: 'm4', team_id: 't-1', club_id: 'c-a', scheduled_at: '2026-10-26T10:00:00Z', status: 'FINISHED', archived_at: '2026-10-27' },
  ];
  const e = await estado(supabaseFalso(dados));
  const gerente = e.contas.find((c) => c.email === 'gerente@clube.pt');
  const ana = e.contas.find((c) => c.email === 'ana@clube.pt');

  assert.deepEqual(gerente.ultimosJogos.map((j) => j.id), ['m3', 'm2', 'm1'], 'o arquivado não aparece');
  assert.equal(gerente.ultimosJogos[1].fora, true);
  assert.equal(gerente.ultimosJogos[1].adversario, 'Sporting');
  assert.equal(gerente.ultimoJogo, '2026-10-25T10:00:00Z');
  assert.deepEqual(
    ana.ultimosJogos.map((j) => [j.id, j.via]),
    [['m2', 'partilhado'], ['m1', 'partilhado']],
    'a ana só vê o escalão A1, que partilham com ela'
  );
  assert.equal(ana.jogosVisiveis, 2);
});

test('só traz os últimos dez jogos, mas diz quantos há ao todo', () => {
  const jogos = Array.from({ length: 13 }, (_, i) => ({
    id: `m${i}`, team_id: 't-1', club_id: 'c-a',
    scheduled_at: `2026-10-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
  }));
  const r = jogosPorConta({
    jogos,
    clubes: [{ id: 'c-a', name: 'Clube A', owner_id: 'u-1' }],
    escaloes: [{ id: 't-1', name: 'A1' }],
    acessos: [],
  }).get('u-1');
  assert.equal(r.total, 13);
  assert.equal(r.recentes.length, 10);
  assert.equal(r.recentes[0].id, 'm12');
});

/* ------------------------------------------------------------- feedback */

test('o feedback mostra só as respostas, com a conta, e conta quem fechou', async () => {
  const sb = supabaseFalso({
    profiles: [
      { id: 'u1', email: 'ze@clube.pt', name: 'Zé' },
      { id: 'u2', email: 'ana@clube.pt', name: null },
    ],
    feedback_inicial: [
      { user_id: 'u1', momento: 'registo', respondido: true, origem: 'Instagram', email: 'ze@mail.pt', opiniao: 'Top', created_at: '2026-10-27T10:00:00Z' },
      { user_id: 'u2', respondido: false, origem: null, email: null, opiniao: null, created_at: '2026-10-27T11:00:00Z' },
    ],
  });
  const r = await feedbacks(sb);
  assert.equal(r.fechadosSemResposta, 1);
  // Quem recebeu inclui também quem fechou sem responder, do mais recente
  // para o mais antigo.
  assert.deepEqual(r.recebidos.map((l) => [l.conta, l.respondido]), [
    ['ana@clube.pt', false],
    ['ze@clube.pt', true],
  ]);
  assert.equal(r.respostas.length, 1);
  assert.equal(r.respostas[0].momento, 'registo');
  assert.deepEqual(
    { conta: r.respostas[0].conta, nome: r.respostas[0].nome, origem: r.respostas[0].origem, email: r.respostas[0].email, opiniao: r.respostas[0].opiniao },
    { conta: 'ze@clube.pt', nome: 'Zé', origem: 'Instagram', email: 'ze@mail.pt', opiniao: 'Top' }
  );
});
