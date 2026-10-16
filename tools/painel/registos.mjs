// tools/painel/registos.mjs — ligar e desligar os registos extra de um escalão.
//
// Remates, defesas do GR, recuperações, foras, cantos e ações +/− (ver
// src/domain/registos.js). Na fase 1 quem os liga somos só nós, por aqui,
// para os clubes Personalizado e para a conta Demo FC. Não há interruptor na
// app: a tabela `team_stat_config` é só de leitura para quem tem conta, e só a
// chave de serviço lhe escreve.
//
// Como a `api.mjs`, não sabe nada de HTTP e recebe o cliente `sb` de fora.

import { CATALOGO, REGISTOS, validarListaDeRegistos } from '../../src/domain/registos.js';

/** O nome de cada registo no painel. A app tem os seus nos dicionários. */
const NOMES = {
  remate: 'Remates',
  defesa_gr: 'Defesas do GR',
  recuperacao: 'Recuperações',
  fora: 'Foras',
  canto: 'Cantos',
  acao: 'Ações +/−',
};

/** O catálogo como o painel o mostra: só o que se pode ligar. */
export function catalogoDoPainel() {
  return REGISTOS.filter((id) => CATALOGO[id].disponivel).map((id) => ({
    id,
    nome: NOMES[id] || id,
  }));
}

async function garantirEscalao(sb, teamId) {
  if (!teamId) throw new Error('Falta o escalão.');
  const { data, error } = await sb
    .from('teams')
    .select('id, name, club_id, archived_at')
    .eq('id', teamId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.archived_at) throw new Error('Não há escalão activo com esse identificador.');
  return data;
}

/** Os registos ligados de um escalão (lista vazia se não tiver config). */
export async function registosDoEscalao(sb, teamId) {
  const escalao = await garantirEscalao(sb, teamId);
  const { data, error } = await sb
    .from('team_stat_config')
    .select('team_id, registos, updated_at')
    .eq('team_id', escalao.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    teamId: escalao.id,
    nome: escalao.name,
    registos: Array.isArray(data?.registos) ? data.registos : [],
    atualizadoEm: data?.updated_at || null,
  };
}

/** Os escalões activos de um clube, cada um com os seus registos. */
export async function registosDoClube(sb, clubeId) {
  if (!clubeId) throw new Error('Falta o clube.');
  const { data: escaloes, error } = await sb
    .from('teams')
    .select('id, name, club_id, archived_at')
    .eq('club_id', clubeId);
  if (error) throw new Error(error.message);
  const activos = (escaloes || []).filter((t) => !t.archived_at);
  const ids = activos.map((t) => t.id);

  let configs = [];
  if (ids.length) {
    const r = await sb.from('team_stat_config').select('team_id, registos, updated_at').in('team_id', ids);
    if (r.error) throw new Error(r.error.message);
    configs = r.data || [];
  }
  const porEscalao = new Map(configs.map((c) => [c.team_id, c]));

  return {
    clubeId,
    catalogo: catalogoDoPainel(),
    escaloes: activos
      .map((t) => ({
        teamId: t.id,
        nome: t.name,
        registos: Array.isArray(porEscalao.get(t.id)?.registos) ? porEscalao.get(t.id).registos : [],
        atualizadoEm: porEscalao.get(t.id)?.updated_at || null,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
  };
}

/**
 * Gravar os registos de um escalão. Um id que não esteja no catálogo é
 * recusado antes de se falar com o Supabase: um registo inventado na config
 * não aparecia em lado nenhum e ninguém dava pelo engano.
 *
 * Desligar tudo grava uma lista vazia, e não apaga a linha: assim a mudança
 * tem `updated_at` e chega aos telemóveis na sincronização seguinte.
 */
export async function definirRegistos(sb, { teamId, registos }) {
  const validado = validarListaDeRegistos(registos);
  if (validado.erro) throw new Error(`Não gravado: ${validado.erro}.`);
  const escalao = await garantirEscalao(sb, teamId);

  const { error } = await sb
    .from('team_stat_config')
    .upsert({ team_id: escalao.id, registos: validado.registos }, { onConflict: 'team_id' });
  if (error) throw new Error(error.message);

  const lista = validado.registos.map((id) => NOMES[id] || id).join(', ');
  return {
    teamId: escalao.id,
    registos: validado.registos,
    mensagem: validado.registos.length
      ? `${escalao.name}: ${lista}.`
      : `${escalao.name}: sem registos extra.`,
  };
}
