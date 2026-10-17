// tools/painel/registos.mjs — ligar e desligar os add-ons de um escalão.
//
// Os registos extra (remates, defesas do GR, recuperações, foras, cantos e
// ações +/−, ver src/domain/registos.js) e os restantes add-ons
// (src/domain/addons.js). Quem os liga somos só nós, por aqui. Não há
// interruptor na app: a tabela `team_stat_config` é só de leitura para quem
// tem conta, e só a chave de serviço lhe escreve.
//
// Como a `api.mjs`, não sabe nada de HTTP e recebe o cliente `sb` de fora.

import { CATALOGO, REGISTOS, validarListaDeRegistos } from '../../src/domain/registos.js';
import {
  ADDONS,
  GRUPOS,
  NOME_REGISTO as NOMES,
  catalogoDeAddons,
  validarListaDeAddons,
} from '../../src/domain/addons.js';

/** O catálogo como o painel o mostra: só o que se pode ligar. */
export function catalogoDoPainel() {
  return REGISTOS.filter((id) => CATALOGO[id].disponivel).map((id) => ({
    id,
    nome: NOMES[id] || id,
  }));
}

/**
 * Tudo o que se pode ligar num escalão, com o grupo de cada um, e os grupos
 * pela ordem do painel. Uma entrada nova em `ADDONS` aparece aqui sozinha.
 */
export function catalogoCompleto(catalogo = ADDONS) {
  return { grupos: GRUPOS, itens: catalogoDeAddons(catalogo) };
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
    // `*` e não a lista de colunas: num servidor ainda sem a coluna `addons`
    // a consulta continua a funcionar.
    const r = await sb.from('team_stat_config').select('*').in('team_id', ids);
    if (r.error) throw new Error(r.error.message);
    configs = r.data || [];
  }
  const porEscalao = new Map(configs.map((c) => [c.team_id, c]));

  return {
    clubeId,
    catalogo: catalogoDoPainel(),
    catalogoCompleto: catalogoCompleto(),
    escaloes: activos
      .map((t) => ({
        teamId: t.id,
        nome: t.name,
        registos: Array.isArray(porEscalao.get(t.id)?.registos) ? porEscalao.get(t.id).registos : [],
        addons: Array.isArray(porEscalao.get(t.id)?.addons) ? porEscalao.get(t.id).addons : [],
        atualizadoEm: porEscalao.get(t.id)?.updated_at || null,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
  };
}

/**
 * Gravar os add-ons de um escalão: os registos extra e, se vier a lista, os
 * restantes add-ons. Um id que não esteja no catálogo é recusado antes de se
 * falar com o Supabase: um add-on inventado na config não aparecia em lado
 * nenhum e ninguém dava pelo engano.
 *
 * Desligar tudo grava listas vazias, e não apaga a linha: assim a mudança
 * tem `updated_at` e chega aos telemóveis na sincronização seguinte.
 *
 * A coluna `addons` só vai no pedido quando há add-ons para ligar ou quando
 * a linha já a tem: assim o painel continua a gravar registos num servidor
 * que ainda não tenha a migração.
 */
export async function definirRegistos(sb, { teamId, registos, addons, catalogoAddons = ADDONS }) {
  const validado = validarListaDeRegistos(registos);
  if (validado.erro) throw new Error(`Não gravado: ${validado.erro}.`);
  const validadoAddons = addons === undefined ? null : validarListaDeAddons(addons, catalogoAddons);
  if (validadoAddons?.erro) throw new Error(`Não gravado: ${validadoAddons.erro}.`);
  const escalao = await garantirEscalao(sb, teamId);

  const linha = { team_id: escalao.id, registos: validado.registos };
  if (validadoAddons) {
    let temColuna = validadoAddons.addons.length > 0;
    if (!temColuna) {
      const atual = await sb.from('team_stat_config').select('*').eq('team_id', escalao.id).maybeSingle();
      temColuna = Boolean(atual.data && 'addons' in atual.data);
    }
    if (temColuna) linha.addons = validadoAddons.addons;
  }

  const { error } = await sb.from('team_stat_config').upsert(linha, { onConflict: 'team_id' });
  if (error) {
    if (/addons/.test(error.message)) {
      throw new Error('O servidor ainda não tem a coluna dos add-ons: falta aplicar a migração 20261017200000_addons_por_escalao.');
    }
    throw new Error(error.message);
  }

  const nomes = [
    ...validado.registos.map((id) => NOMES[id] || id),
    ...(linha.addons || []).map((id) => catalogoAddons[id]?.nome || id),
  ];
  return {
    teamId: escalao.id,
    registos: validado.registos,
    addons: linha.addons ?? null,
    mensagem: nomes.length ? `${escalao.name}: ${nomes.join(', ')}.` : `${escalao.name}: sem add-ons.`,
  };
}
