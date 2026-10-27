// tools/painel/api.mjs — o que o painel sabe fazer, sem saber nada de HTTP.
//
// Está separado do servidor de propósito. As decisões que este ficheiro toma —
// se um email serve, se uma licença pode descer, o que conta como "sem clube" —
// são as que podem estar erradas, e são as que os testes conseguem apertar sem
// levantar um servidor nem falar com o Supabase.
//
// Todas as funções recebem o cliente `sb` de fora. É o que permite passar-lhes
// um duplo nos testes.

export const LICENCAS = ['treinador', 'clube'];

export function fimDaEpoca(hoje = new Date()) {
  const ano = hoje.getUTCMonth() >= 6 ? hoje.getUTCFullYear() + 1 : hoje.getUTCFullYear();
  return `${ano}-06-30T23:59:59.999Z`;
}

export function normalizarValidade(validade, hoje = new Date()) {
  const v = String(validade || '').trim();
  if (!v) return fimDaEpoca(hoje);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T23:59:59.999Z`;

  const data = new Date(v);
  if (Number.isNaN(data.getTime())) throw new Error(`Validade inválida: ${validade}`);
  return data.toISOString();
}

export function licencaActiva(validade, agora = new Date()) {
  if (!validade) return true;
  return Date.parse(validade) >= agora.getTime();
}

/* ------------------------------------------------------------- validações */

/**
 * Um email suficientemente bem formado para valer a pena tentar.
 *
 * Não é a expressão exaustiva — essas erram nos dois sentidos e ninguém as lê.
 * O que interessa é apanhar o engano do dia a dia (falta o `@`, ficou um
 * espaço, o domínio não tem ponto) antes de o convite sair, porque depois de
 * sair não se desfaz: fica uma conta órfã em `auth.users`.
 */
export function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((email || '').trim());
}

/**
 * O Supabase guarda os emails em minúsculas. Sem isto, "Ze@Clube.pt" criava uma
 * conta que depois não voltava a ser encontrada por este mesmo painel.
 */
export const normalizar = (email) => (email || '').trim().toLowerCase();

/**
 * Contas nossas, da equipa e de testes. Continuam na lista, mas não entram nas
 * contagens do resumo: o que interessa aí é o uso por clientes de verdade.
 */
export const EMAILS_INTERNOS = new Set(
  [
    'axbmr17@gmail.com',
    'review.futsalsubstats@gmail.com',
    'brunomrcosta21@gmail.com',
    'barbaracosta2000@gmail.com',
    'rdcdc91@hotmail.com',
    'pedro.quinta77@gmail.com',
    'pedrobenvindo006@gmail.com',
    'bea.romao@gmail.com',
    'andre.dedecas@gmail.com',
    'nunomerodrigues@gmail.com',
    'axramalho@outlook.pt',
    'diogo.emailbox@gmail.com',
    'nuno.ramalho76@gmail.com',
    'gepack@junitec.pt',
    'stef@junitec.pt',
    'antonio.ramalho@junitec.pt',
    'xpto.devices@gmail.com',
    'goncalo.silvaaa012@gmail.com',
    'sofia.basto@boyden.pt',
    't2z4m4drgc@privaterelay.appleid.com',
    'luisncmachado17@gmail.com',
    'zzp2ktkfdz@privaterelay.appleid.com',
    'apoioaomeio@gmail.com',
    '2006monteiroap@gmail.com',
    'fabiojbc2008@gmail.com',
  ].map((e) => e.toLowerCase())
);

export const eInterno = (email) => EMAILS_INTERNOS.has(normalizar(email));

/** Última entrada por utilizador (auth.users.last_sign_in_at), em Map id -> ISO. */
async function ultimasEntradas(sb) {
  const mapa = new Map();
  if (typeof sb.auth?.admin?.listUsers !== 'function') return mapa;
  try {
    for (let pagina = 1; pagina <= 50; pagina++) {
      const { data, error } = await sb.auth.admin.listUsers({ page: pagina, perPage: 1000 });
      if (error || !data?.users?.length) break;
      for (const u of data.users) mapa.set(u.id, u.last_sign_in_at || null);
      if (data.users.length < 1000) break;
    }
  } catch {
    // sem a data não se perde o resto do painel
  }
  return mapa;
}

/**
 * Último acesso à app por utilizador, em Map id -> ISO.
 *
 * Vem da renovação da sessão (função `painel_ultimos_acessos`, migração
 * 20261027120000), que muda sempre que a app é aberta, ao contrário do login.
 * Sem a função ainda aplicada, o mapa fica vazio e o painel cai para a última
 * entrada.
 */
async function ultimosAcessos(sb) {
  const mapa = new Map();
  if (typeof sb.rpc !== 'function') return mapa;
  try {
    const { data, error } = await sb.rpc('painel_ultimos_acessos');
    if (error) return mapa;
    for (const linha of data || []) mapa.set(linha.user_id, linha.ultimo_acesso || null);
  } catch {
    // sem a data não se perde o resto do painel
  }
  return mapa;
}

/** A mais recente das datas dadas; ignora as que faltam. */
const maisRecente = (...datas) =>
  datas.filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;

/**
 * Pode esta conta passar a ter esta licença?
 *
 * A subida — treinador para clube — nunca tem problema: dá direito a mais.
 *
 * A descida é que tem, e é o erro que o Stef adivinhou. O limite de um escalão
 * por licença de Treinador vive num gatilho que só corre quando se **cria** um
 * escalão. Descer a licença de uma conta que já tem três não apaga nada: fica
 * uma conta em estado que a app nunca deixaria criar, a app começa a esconder o
 * botão de criar escalão, e os três escalões continuam lá a funcionar. Nada
 * rebenta, e é isso que torna a coisa má — descobria-se meses depois.
 *
 * Por isso recusa-se, e diz-se o que fazer: arquivar os escalões a mais
 * primeiro, dentro da app, por quem é dono deles.
 */
export function podeMudarLicenca({ de, para, escaloesActivos }) {
  if (!LICENCAS.includes(para)) {
    return { ok: false, porque: `Licença desconhecida: ${para}.` };
  }
  if (de === para) {
    return { ok: false, porque: 'Já é essa a licença desta conta.' };
  }
  if (para === 'treinador' && escaloesActivos > 1) {
    return {
      ok: false,
      porque:
        `Esta conta tem ${escaloesActivos} escalões activos e a licença de Treinador ` +
        'dá direito a um. Arquiva os que sobram na app, e volta aqui.',
    };
  }
  return { ok: true };
}

/* ---------------------------------------------------------------- leitura */

/**
 * Tudo o que o painel mostra, numa ida só.
 *
 * São seis consultas pequenas e depois junta-se em memória, em vez de uma
 * consulta grande com encadeamentos. A razão é chata e prática: as junções do
 * PostgREST dependem dos nomes das chaves estrangeiras, que já nos partiram uma
 * vez o `--clubes`, e aqui não vale a pena esse risco por umas centenas de
 * linhas.
 */
/**
 * Os add-ons de cada escalão (`team_stat_config`), em Map teamId ->
 * { registos, addons }. Sem a tabela (servidor sem a migração) o painel
 * continua a abrir, só sem add-ons; `*` para não falhar sem a coluna `addons`.
 */
async function configDosRegistos(sb) {
  const mapa = new Map();
  const { data, error } = await sb.from('team_stat_config').select('*');
  if (error) return mapa;
  for (const linha of data || []) {
    mapa.set(linha.team_id, {
      registos: Array.isArray(linha.registos) ? linha.registos : [],
      addons: Array.isArray(linha.addons) ? linha.addons : [],
    });
  }
  return mapa;
}

/** Quantos jogos recentes a lista de cada conta traz. */
export const JOGOS_POR_CONTA = 10;

/**
 * Os jogos que cada conta vê, do mais recente para o mais antigo: os dos clubes
 * de que é dona e os dos escalões que partilham com ela. Um jogo que se vê pelas
 * duas vias conta uma vez, como "dono".
 *
 * Isto é diferente da contagem `jogos`, que só conta o que a conta produziu. Aqui
 * interessa o que a pessoa tem à frente quando abre a app — é o que se quer
 * conferir quando ela diz que "faltam jogos".
 */
export function jogosPorConta({ jogos, clubes, escaloes, acessos }) {
  const donoDoClube = new Map(clubes.map((c) => [c.id, c.owner_id]));
  const clubePorId = new Map(clubes.map((c) => [c.id, c]));
  const escalaoPorId = new Map(escaloes.map((t) => [t.id, t]));
  const quemVeOEscalao = new Map();
  for (const a of acessos) {
    if (!quemVeOEscalao.has(a.team_id)) quemVeOEscalao.set(a.team_id, []);
    quemVeOEscalao.get(a.team_id).push(a.user_id);
  }

  const porConta = new Map();
  const juntar = (userId, jogo, via) => {
    if (!userId) return;
    if (!porConta.has(userId)) porConta.set(userId, new Map());
    const visto = porConta.get(userId);
    if (!visto.has(jogo.id)) visto.set(jogo.id, { jogo, via });
  };

  for (const j of jogos) {
    if (j.archived_at) continue;
    juntar(donoDoClube.get(j.club_id), j, 'dono');
    for (const userId of quemVeOEscalao.get(j.team_id) || []) juntar(userId, j, 'partilhado');
  }

  const resultado = new Map();
  for (const [userId, visto] of porConta) {
    const lista = [...visto.values()]
      .map(({ jogo: j, via }) => ({
        id: j.id,
        quando: j.scheduled_at || j.started_at || j.created_at || null,
        clube: clubePorId.get(j.club_id)?.name || null,
        escalao: escalaoPorId.get(j.team_id)?.name || null,
        adversario: j.opponent_name || null,
        fora: j.home_or_away === 'AWAY',
        golos: j.team_score ?? null,
        golosAdversario: j.opponent_score ?? null,
        estado: j.status || null,
        via,
      }))
      .sort((a, b) => Date.parse(b.quando || 0) - Date.parse(a.quando || 0) || String(a.id).localeCompare(String(b.id)));
    resultado.set(userId, { total: lista.length, ultimoJogo: lista[0]?.quando || null, recentes: lista.slice(0, JOGOS_POR_CONTA) });
  }
  return resultado;
}

export async function estado(sb) {
  const [perfis, clubes, escaloes, membros, acessos, jogos] = await Promise.all([
    sb
      .from('profiles')
      .select('id, email, name, licenca, license_expires_at, created_at')
      .order('created_at', { ascending: false }),
    sb.from('clubs').select('id, name, owner_id, archived_at'),
    sb.from('teams').select('id, name, club_id, archived_at'),
    sb.from('club_members').select('club_id, user_id'),
    sb.from('team_access').select('team_id, user_id, nivel'),
    sb
      .from('matches')
      .select(
        'id, team_id, club_id, scheduled_at, started_at, created_at, archived_at, status, opponent_name, home_or_away, team_score, opponent_score'
      ),
  ]);

  const erro = [perfis, clubes, escaloes, membros, acessos, jogos].find((r) => r.error);
  if (erro) throw new Error(erro.error.message);

  const entradas = await ultimasEntradas(sb);
  const acessosApp = await ultimosAcessos(sb);
  const registosPorEscalao = await configDosRegistos(sb);
  const registosDe = (teamId) => registosPorEscalao.get(teamId)?.registos || [];
  const addonsDe = (teamId) => registosPorEscalao.get(teamId)?.addons || [];

  const clubesActivos = (clubes.data || []).filter((c) => !c.archived_at);
  const escaloesActivos = (escaloes.data || []).filter((t) => !t.archived_at);

  const clubePorId = new Map(clubesActivos.map((c) => [c.id, c]));
  const escalaoPorId = new Map(escaloesActivos.map((t) => [t.id, t]));

  // Jogos por escalão, e daí por clube. Um jogo de um escalão já arquivado não
  // desaparece da contagem: aconteceu, e o número serve para saber quem usa a
  // app a sério.
  const jogosPorEscalao = new Map();
  for (const j of jogos.data || []) {
    jogosPorEscalao.set(j.team_id, (jogosPorEscalao.get(j.team_id) || 0) + 1);
  }

  const jogosDeCadaConta = jogosPorConta({
    jogos: jogos.data || [],
    clubes: clubes.data || [],
    escaloes: escaloes.data || [],
    acessos: acessos.data || [],
  });

  const contas = (perfis.data || []).map((p) => {
    const meuClube = clubesActivos.find((c) => c.owner_id === p.id) || null;
    const meusEscaloes = meuClube
      ? escaloesActivos.filter((t) => t.club_id === meuClube.id)
      : [];

    const associadoA = (membros.data || [])
      .filter((m) => m.user_id === p.id)
      .map((m) => clubePorId.get(m.club_id))
      .filter(Boolean)
      .filter((c) => c.owner_id !== p.id); // o dono não é "associado" ao seu clube

    const partilhados = (acessos.data || [])
      .filter((a) => a.user_id === p.id)
      .map((a) => ({ escalao: escalaoPorId.get(a.team_id), nivel: a.nivel }))
      .filter((x) => x.escalao)
      .map((x) => ({
        teamId: x.escalao.id,
        nome: x.escalao.name,
        clube: clubePorId.get(x.escalao.club_id)?.name || '?',
        nivel: x.nivel,
        registos: registosDe(x.escalao.id),
        addons: addonsDe(x.escalao.id),
      }));

    // Os jogos que esta conta produziu: os dos escalões do seu clube. Os
    // escalões partilhados contam para quem é dono deles, não para quem os vê.
    const totalJogos = meusEscaloes.reduce(
      (soma, t) => soma + (jogosPorEscalao.get(t.id) || 0),
      0
    );

    return {
      id: p.id,
      email: p.email || '(sem email)',
      nome: p.name || null,
      licenca: p.licenca || 'treinador',
      validade: p.license_expires_at || null,
      activo: licencaActiva(p.license_expires_at),
      criadaEm: p.created_at || null,
      ultimaEntrada: entradas.get(p.id) || null,
      ultimoAcesso: maisRecente(acessosApp.get(p.id), entradas.get(p.id)),
      interna: eInterno(p.email),
      clube: meuClube ? { id: meuClube.id, nome: meuClube.name } : null,
      escaloes: meusEscaloes.map((t) => t.name),
      // Os add-ons (registos extra) de cada escalão do seu clube. Quem tem
      // acesso a um destes escalões fica com os mesmos: a config é do escalão,
      // não da conta. Ver `partilhados[].registos` do outro lado.
      escaloesComRegistos: meusEscaloes
        .map((t) => ({ teamId: t.id, nome: t.name, registos: registosDe(t.id), addons: addonsDe(t.id) }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
      associadoA: associadoA.map((c) => ({ id: c.id, nome: c.name })),
      partilhados,
      jogos: totalJogos,
      jogosVisiveis: jogosDeCadaConta.get(p.id)?.total || 0,
      ultimoJogo: jogosDeCadaConta.get(p.id)?.ultimoJogo || null,
      ultimosJogos: jogosDeCadaConta.get(p.id)?.recentes || [],
    };
  });

  // Contagens só com contas de clientes; escalões e jogos seguem o dono.
  const reais = contas.filter((c) => !c.interna);
  const clubesReais = clubesActivos.filter(
    (c) => !eInterno((perfis.data || []).find((p) => p.id === c.owner_id)?.email)
  );
  const idsClubesReais = new Set(clubesReais.map((c) => c.id));
  const escaloesReais = escaloesActivos.filter((t) => idsClubesReais.has(t.club_id));
  const jogosReais = escaloes.data
    ? (escaloes.data || [])
        .filter((t) => idsClubesReais.has(t.club_id))
        .reduce((soma, t) => soma + (jogosPorEscalao.get(t.id) || 0), 0)
    : 0;

  return {
    contas,
    clubes: clubesActivos
      .map((c) => ({
        id: c.id,
        nome: c.name,
        dono: (perfis.data || []).find((p) => p.id === c.owner_id)?.email || '?',
        escaloes: escaloesActivos.filter((t) => t.club_id === c.id).length,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
    resumo: {
      contas: reais.length,
      comLicencaClube: reais.filter((c) => c.licenca === 'clube').length,
      comLicencaTreinador: reais.filter((c) => c.licenca === 'treinador').length,
      licencasActivas: reais.filter((c) => c.activo).length,
      licencasExpiradas: reais.filter((c) => !c.activo).length,
      semClube: reais.filter((c) => !c.clube && !c.associadoA.length).length,
      clubes: clubesReais.length,
      escaloes: escaloesReais.length,
      jogos: jogosReais,
      internasExcluidas: contas.length - reais.length,
    },
  };
}

/* ---------------------------------------------------------------- escrita */

/**
 * Criar uma conta já com a licença escolhida, e opcionalmente associada a um
 * clube.
 *
 * A conta nasce **convidada e sem palavra-passe**: sai o email de convite e é a
 * pessoa que escolhe a sua. É a mesma decisão do `tools/convidar.mjs`, e pela
 * mesma razão — não queremos saber as palavras-passe dos nossos clientes, nem
 * que elas viajem por WhatsApp.
 */
export async function convidar(sb, { email, licenca, clubeId, validade }) {
  const endereco = normalizar(email);

  if (!emailValido(endereco)) throw new Error(`Isto não parece um email: ${email}`);
  if (!LICENCAS.includes(licenca)) throw new Error(`Licença desconhecida: ${licenca}.`);

  const license_expires_at = normalizarValidade(validade);

  let userId = null;
  let novaConta = true;

  const { data, error } = await sb.auth.admin.inviteUserByEmail(endereco);

  if (error) {
    // Já existir não é falha: é quem foi convidado para um clube e agora entra
    // noutro, ou quem já testava a app antes disto existir. O convite não se
    // repete; a licença e a associação fazem-se na mesma.
    if (!/already been registered|already exists|email_exists/i.test(error.message)) {
      throw new Error(error.message);
    }
    const { data: perfil } = await sb
      .from('profiles')
      .select('id')
      .eq('email', endereco)
      .maybeSingle();
    if (!perfil) throw new Error('A conta já existe mas não tem perfil. Ver no painel do Supabase.');
    userId = perfil.id;
    novaConta = false;
  } else {
    userId = data.user.id;
  }

  const { error: erroLicenca } = await sb
    .from('profiles')
    .update({ licenca, license_expires_at, license_status: 'active', license_source: 'legacy' })
    .eq('id', userId);
  if (erroLicenca) throw new Error(`Conta criada, mas a licença não ficou: ${erroLicenca.message}`);

  if (clubeId) {
    const { error: erroMembro } = await sb
      .from('club_members')
      .upsert({ club_id: clubeId, user_id: userId }, { onConflict: 'club_id,user_id' });
    if (erroMembro) throw new Error(`Licença gravada, mas a associação falhou: ${erroMembro.message}`);
  }

  return {
    userId,
    email: endereco,
    licenca,
    validade: license_expires_at,
    novaConta,
    mensagem: novaConta
      ? `Convite enviado para ${endereco}, com licença ${licenca}.`
      : `${endereco} já tinha conta. Licença actualizada para ${licenca}; convite não repetido.`,
  };
}

/**
 * Mudar a licença de uma conta que já existe.
 *
 * Conta os escalões activos do clube dela antes de decidir — é o que a
 * `podeMudarLicenca` precisa de saber para recusar uma descida que deixaria a
 * conta num estado que a app nunca produziria.
 */
export async function mudarLicenca(sb, { userId, licenca, validade, forcar = false }) {
  const { data: perfil, error } = await sb
    .from('profiles')
    .select('id, email, licenca, license_expires_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!perfil) throw new Error('Não há conta nenhuma com esse identificador.');

  const { data: clube } = await sb
    .from('clubs')
    .select('id')
    .eq('owner_id', userId)
    .is('archived_at', null)
    .maybeSingle();

  let escaloesActivos = 0;
  if (clube) {
    const { count } = await sb
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', clube.id)
      .is('archived_at', null);
    escaloesActivos = count || 0;
  }

  const mesmaLicencaComValidadeNova = (perfil.licenca || 'treinador') === licenca && validade !== undefined;
  if (!forcar && !mesmaLicencaComValidadeNova) {
    const veredicto = podeMudarLicenca({
      de: perfil.licenca || 'treinador',
      para: licenca,
      escaloesActivos,
    });
    if (!veredicto.ok) throw new Error(veredicto.porque);
  } else if (!LICENCAS.includes(licenca)) {
    throw new Error(`Licença desconhecida: ${licenca}.`);
  }

  const patch = { licenca, license_status: 'active', license_source: 'legacy' };
  if (validade !== undefined) patch.license_expires_at = normalizarValidade(validade);

  const { error: erroEscrita } = await sb.from('profiles').update(patch).eq('id', userId);
  if (erroEscrita) throw new Error(erroEscrita.message);

  return {
    userId,
    email: perfil.email,
    licenca,
    validade: patch.license_expires_at ?? perfil.license_expires_at ?? null,
    mensagem: `${perfil.email} passou a ter licença ${licenca}.`,
  };
}

export async function removerLicenca(sb, { userId }) {
  const { data: perfil, error } = await sb
    .from('profiles')
    .select('id, email')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!perfil) throw new Error('Não há conta nenhuma com esse identificador.');

  const expirada = '1970-01-01T00:00:00.000Z';
  const { error: erroEscrita } = await sb
    .from('profiles')
    .update({ licenca: 'treinador', license_expires_at: expirada })
    .eq('id', userId);
  if (erroEscrita) throw new Error(erroEscrita.message);

  return {
    userId,
    email: perfil.email,
    licenca: 'treinador',
    validade: expirada,
    mensagem: `Licença removida de ${perfil.email}. A conta ficou como treinador expirado.`,
  };
}

async function garantirConta(sb, userId) {
  const { data, error } = await sb
    .from('profiles')
    .select('id, email')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Não há conta nenhuma com esse identificador.');
  return data;
}

async function garantirClube(sb, clubeId) {
  const { data, error } = await sb
    .from('clubs')
    .select('id, name, owner_id, archived_at')
    .eq('id', clubeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.archived_at) throw new Error('Não há clube activo com esse identificador.');
  return data;
}

export async function associarClube(sb, { userId, clubeId }) {
  const [perfil, clube] = await Promise.all([garantirConta(sb, userId), garantirClube(sb, clubeId)]);

  const { error } = await sb
    .from('club_members')
    .upsert({ club_id: clube.id, user_id: perfil.id }, { onConflict: 'club_id,user_id' });
  if (error) throw new Error(error.message);

  return {
    userId: perfil.id,
    clubeId: clube.id,
    mensagem: `${perfil.email} ficou associado ao clube ${clube.name}.`,
  };
}

export async function desassociarClube(sb, { userId, clubeId }) {
  const [perfil, clube] = await Promise.all([garantirConta(sb, userId), garantirClube(sb, clubeId)]);

  const { data: escaloes, error: erroEscaloes } = await sb
    .from('teams')
    .select('id')
    .eq('club_id', clube.id);
  if (erroEscaloes) throw new Error(erroEscaloes.message);

  const ids = (escaloes || []).map((t) => t.id);
  if (ids.length) {
    const { error: erroAcessos } = await sb
      .from('team_access')
      .delete()
      .eq('user_id', perfil.id)
      .in('team_id', ids);
    if (erroAcessos) throw new Error(erroAcessos.message);
  }

  const { error } = await sb
    .from('club_members')
    .delete()
    .eq('club_id', clube.id)
    .eq('user_id', perfil.id);
  if (error) throw new Error(error.message);

  return {
    userId: perfil.id,
    clubeId: clube.id,
    mensagem: `${perfil.email} deixou de estar associado ao clube ${clube.name}.`,
  };
}

/* ------------------------------------------------------------- feedback */

/**
 * As respostas aos popups de feedback (tabela `feedback_inicial`), da mais
 * recente para a mais antiga, com o email e o nome da conta. Cada conta pode
 * ter duas: `registo` (contas novas, à entrada) e `dois_jogos`.
 *
 * Quem fechou o popup sem responder também tem linha (é a marca de "já viu"):
 * vem com `respondido: false` e conta à parte, para se saber quantos o viram.
 */
export async function feedbacks(sb) {
  const [respostas, perfis] = await Promise.all([
    sb
      .from('feedback_inicial')
      .select('user_id, momento, respondido, origem, email, opiniao, created_at')
      .order('created_at', { ascending: false }),
    sb.from('profiles').select('id, email, name'),
  ]);
  const erro = [respostas, perfis].find((r) => r.error);
  if (erro) throw new Error(erro.error.message);

  const perfilPorId = new Map((perfis.data || []).map((p) => [p.id, p]));
  const linhas = (respostas.data || []).map((r) => {
    const perfil = perfilPorId.get(r.user_id);
    return {
      userId: r.user_id,
      conta: perfil?.email || r.user_id,
      nome: perfil?.name || null,
      interna: eInterno(perfil?.email),
      momento: r.momento || 'dois_jogos',
      respondido: Boolean(r.respondido),
      origem: r.origem || null,
      email: r.email || null,
      opiniao: r.opiniao || null,
      quando: r.created_at,
    };
  });

  return {
    respostas: linhas.filter((l) => l.respondido),
    fechadosSemResposta: linhas.filter((l) => !l.respondido).length,
  };
}
