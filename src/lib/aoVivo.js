'use client';

// lib/aoVivo.js — "Assistir ao vivo" (add-on 'ao-vivo') do lado da app.
//
// As regras estão em domain/aoVivo.js; aqui fica o que precisa da base local e
// do servidor: que escalões têm o add-on, que jogos estão ao vivo, e se um
// jogo é para registar ou para acompanhar.

import { supabase } from './supabase/client.js';
import { clubs, events, statConfig, raw } from './data/repository.js';
import { matchMapper } from './data/mappers.js';
import { guardarDoRealtime } from './data/sync.js';
import { addonsAtivos } from '../domain/addons.js';
import { EVENT } from '../domain/constants.js';
import {
  ADDON_AO_VIVO,
  AO_VIVO_VALIDADE_MS,
  ESTADOS_AO_VIVO,
  estaAoVivo,
  quemComecou,
  registadoPorOutro,
} from '../domain/aoVivo.js';

/** O escalão tem o add-on ligado? Lê a config local, como o `useAddons`. */
export async function temAoVivo(teamId) {
  if (!teamId) return false;
  const config = await statConfig.get(teamId).catch(() => null);
  return addonsAtivos(config).has(ADDON_AO_VIVO);
}

/**
 * Abrir este jogo no ecrã de registo, ou mandar para o de acompanhamento?
 *
 * Acompanha-se quando o jogo tem o interruptor ligado, o escalão tem o add-on
 * e foi outra conta a começá-lo. Em tudo o resto, o ecrã de registo fica como
 * sempre foi.
 *
 * @param {{match: object, events: object[]}} carregado o que `loadMatch` devolve
 */
export async function deveAssistir(carregado, userId) {
  if (!carregado?.match?.liveEnabled) return false;
  if (!registadoPorOutro(carregado.events, userId)) return false;
  return temAoVivo(carregado.match.teamId);
}

/**
 * Os jogos ao vivo dos escalões a que esta conta tem acesso (dono, `ver` ou
 * `editar`) e que têm o add-on ligado.
 *
 * Sem nenhum escalão com o add-on não se pergunta nada ao servidor: para quem
 * não o tem, isto não custa um pedido. Com ele, é uma pergunta pequena (o
 * índice `matches_ao_vivo`), e quem filtra o acesso é a segurança por linha.
 * Sem rede, responde com o que este aparelho já sabe.
 *
 * Ficam de fora os jogos que esta conta está a registar: esses têm o atalho
 * "Jogo em curso" e voltam ao ecrã de registo.
 *
 * @returns {Promise<Array<{match: object, team: object, club: object|null}>>}
 */
export async function jogosAoVivo(userId, agora = Date.now()) {
  const escaloes = (await raw.all(raw.STORES.teams)).filter((t) => !t.archivedAt);
  const comAddon = [];
  for (const team of escaloes) if (await temAoVivo(team.id)) comAddon.push(team);
  if (!comAddon.length) return [];
  const porId = new Map(comAddon.map((t) => [t.id, t]));

  let jogos = null;
  const sb = supabase();
  if (sb && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
    try {
      const { data, error } = await sb
        .from('matches')
        .select('*')
        .eq('live_enabled', true)
        .in('status', ESTADOS_AO_VIVO)
        .in('team_id', [...porId.keys()])
        .is('archived_at', null)
        .gt('updated_at', new Date(agora - AO_VIVO_VALIDADE_MS).toISOString());
      if (error) throw error;
      // Fica também na base local, pelas regras de sempre: é a mesma linha que
      // a próxima descarga traria.
      for (const linha of data || []) await guardarDoRealtime('matches', linha);
      jogos = (data || []).map(matchMapper.fromRow);
    } catch {
      jogos = null;
    }
  }
  if (!jogos) {
    jogos = (await raw.all(raw.STORES.matches)).filter((m) => porId.has(m.teamId));
  }

  const lista = [];
  for (const match of jogos) {
    if (!porId.has(match.teamId) || !estaAoVivo(match, agora)) continue;
    const evs = await events.listByMatch(match.id);
    // Começado aqui (ainda sem dono do servidor) ou por esta conta: é meu.
    const comecadoAqui = evs.some((e) => e.eventType === EVENT.FIRST_HALF_STARTED && !e.undoneAt);
    const quem = quemComecou(evs);
    if (comecadoAqui && (!quem || quem === userId)) continue;
    lista.push({ match, team: porId.get(match.teamId), club: await clubs.get(match.clubId) });
  }
  return lista.sort((a, b) => (b.match.updatedAt || 0) - (a.match.updatedAt || 0));
}
