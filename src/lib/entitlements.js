import { supabase } from './supabase/client.js';
import { EVENT } from '../domain/constants.js';
import { profile, raw as db } from './data/repository.js';
import { localClubLicenseActive, localLicenseActive } from './license.js';
import { donoAtual } from './data/owner.js';

export { localClubLicenseActive, localLicenseActive } from './license.js';

export const FREE_GAME_LIMIT = 4;

function isDemoMatch(match) {
  return String(match?.id || '').startsWith('00000000-dem0-');
}

export async function localFreeGamesUsed() {
  const [eventos, jogos] = await Promise.all([
    db.all(db.STORES.matchEvents),
    db.all(db.STORES.matches),
  ]);
  const jogosPorId = new Map(jogos.map((m) => [m.id, m]));
  const iniciados = new Set();
  for (const ev of eventos) {
    if (ev.undoneAt || ev.eventType !== EVENT.FIRST_HALF_STARTED) continue;
    const jogo = jogosPorId.get(ev.matchId);
    if (!jogo || isDemoMatch(jogo)) continue;
    iniciados.add(ev.matchId);
  }
  return iniciados.size;
}

async function offlineEntitlementFallback() {
  const local = await profile.get();
  if (localLicenseActive(local)) return { allowed: true, licensed: true, offline: true };
  const used = await localFreeGamesUsed();
  const remaining = Math.max(0, FREE_GAME_LIMIT - used);
  return {
    allowed: remaining > 0,
    licensed: false,
    offline: true,
    freeGamesUsed: used,
    freeGamesRemaining: remaining,
    reason: remaining > 0 ? null : 'free_limit_reached',
  };
}

export async function entitlement() {
  const sb = supabase();
  if (!sb) return { error: 'offline' };
  const { data, error } = await sb.rpc('my_entitlement');
  if (error) return { error: error.message || 'entitlement_failed' };
  return { ...data, error: null };
}

export async function canCreateMatch() {
  const local = await profile.get();
  if (localLicenseActive(local)) return { allowed: true, licensed: true };
  const localUsed = await localFreeGamesUsed();
  const status = await entitlement();
  if (status.error) return offlineEntitlementFallback();
  if (!status.licenseActive && localUsed >= FREE_GAME_LIMIT) {
    return {
      ...status,
      allowed: false,
      reason: 'free_limit_reached',
      freeGamesUsed: Math.max(status.freeGamesUsed || 0, localUsed),
      freeGamesRemaining: 0,
    };
  }
  return {
    ...status,
    allowed: status.licenseActive || status.freeGamesRemaining > 0,
    reason: status.licenseActive || status.freeGamesRemaining > 0 ? null : 'free_limit_reached',
  };
}

export async function claimMatchStart(matchId) {
  const local = await profile.get();
  if (localLicenseActive(local)) return { allowed: true, licensed: true };
  const status = await entitlement();
  const localUsed = await localFreeGamesUsed();
  if (status?.licenseActive) return { ...status, allowed: true, reason: null };
  if (!status.error && status.freeGamesRemaining <= 0) return { ...status, allowed: false, reason: 'free_limit_reached' };
  if (localUsed >= FREE_GAME_LIMIT) {
    return {
      ...status,
      allowed: false,
      licensed: false,
      freeGamesUsed: Math.max(status.freeGamesUsed || 0, localUsed),
      freeGamesRemaining: 0,
      reason: 'free_limit_reached',
    };
  }
  const sb = supabase();
  if (!sb) {
    return offlineEntitlementFallback();
  }
  const { data, error } = await sb.rpc('claim_match_start', { p_match_id: matchId });
  if (error) return offlineEntitlementFallback();
  return data;
}

/* ------------------------------------------------------------ jogadas */

export const FREE_PLAY_LIMIT = 3;

/**
 * Esta conta entra pela licença de outra pessoa neste escalão?
 *
 * Um treinador associado (nível `editar` ou `ver`) só existe dentro de um
 * clube com licença Clube — é o dono que paga. O servidor confirma (ver
 * `plays_limite_gratis` e `pode_ver_biblioteca`); aqui é para o ecrã saber o
 * que mostrar sem rede.
 */
function associado(team) {
  return Boolean(team?.nivel && team.nivel !== 'dono');
}

/** Licença Clube: a biblioteca do clube e copiar jogadas entre escalões. */
export async function temLicencaClube(teamId) {
  const [perfil, team] = await Promise.all([profile.get(), db.get(db.STORES.teams, teamId)]);
  return localClubLicenseActive(perfil) || associado(team);
}

/**
 * Pode criar mais uma jogada?
 *
 * Sem licença são 3 por conta, para sempre: apagar não devolve a vaga. Conta o
 * maior de dois números — o do servidor (certo entre aparelhos) e o deste
 * aparelho (o que vale sem rede, e que já inclui o que ainda não subiu).
 *
 * @returns {Promise<{allowed: boolean, licensed: boolean, used?: number, limit: number}>}
 */
export async function podeCriarJogada(teamId) {
  const [perfil, team] = await Promise.all([profile.get(), db.get(db.STORES.teams, teamId)]);
  if (localLicenseActive(perfil) || associado(team)) {
    return { allowed: true, licensed: true, limit: FREE_PLAY_LIMIT };
  }
  const eu = donoAtual();
  const locais = eu ? (await db.all(db.STORES.plays)).filter((p) => p.createdBy === eu).length : 0;
  let remotas = 0;
  const sb = supabase();
  if (sb) {
    try {
      const { data, error } = await sb.rpc('my_free_plays_used');
      if (!error && Number.isFinite(Number(data))) remotas = Number(data);
    } catch {
      /* sem rede (ou servidor sem a função ainda): vale a conta local */
    }
  }
  const used = Math.max(locais, remotas);
  return { allowed: used < FREE_PLAY_LIMIT, licensed: false, used, limit: FREE_PLAY_LIMIT };
}
