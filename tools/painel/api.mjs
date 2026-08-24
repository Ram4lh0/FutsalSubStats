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
export async function estado(sb) {
  const [perfis, clubes, escaloes, membros, acessos, jogos] = await Promise.all([
    sb.from('profiles').select('id, email, licenca, license_expires_at, created_at').order('email'),
    sb.from('clubs').select('id, name, owner_id, archived_at'),
    sb.from('teams').select('id, name, club_id, archived_at'),
    sb.from('club_members').select('club_id, user_id'),
    sb.from('team_access').select('team_id, user_id, nivel'),
    sb.from('matches').select('id, team_id, club_id, scheduled_at, status'),
  ]);

  const erro = [perfis, clubes, escaloes, membros, acessos, jogos].find((r) => r.error);
  if (erro) throw new Error(erro.error.message);

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
      licenca: p.licenca || 'treinador',
      validade: p.license_expires_at || null,
      activo: licencaActiva(p.license_expires_at),
      criadaEm: p.created_at || null,
      clube: meuClube ? { id: meuClube.id, nome: meuClube.name } : null,
      escaloes: meusEscaloes.map((t) => t.name),
      associadoA: associadoA.map((c) => ({ id: c.id, nome: c.name })),
      partilhados,
      jogos: totalJogos,
    };
  });

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
      contas: contas.length,
      comLicencaClube: contas.filter((c) => c.licenca === 'clube').length,
      comLicencaTreinador: contas.filter((c) => c.licenca === 'treinador').length,
      licencasActivas: contas.filter((c) => c.activo).length,
      licencasExpiradas: contas.filter((c) => !c.activo).length,
      semClube: contas.filter((c) => !c.clube && !c.associadoA.length).length,
      clubes: clubesActivos.length,
      escaloes: escaloesActivos.length,
      jogos: (jogos.data || []).length,
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
    .update({ licenca, license_expires_at })
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

  const patch = { licenca };
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
