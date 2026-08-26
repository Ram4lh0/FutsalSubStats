import { supabase } from './supabase/client.js';
import { EVENT } from '../domain/constants.js';
import { profile, raw as db } from './data/repository.js';

export const FREE_GAME_LIMIT = 4;

export function localLicenseActive(perfil, at = Date.now()) {
  if (!perfil || !['trial', 'active', 'grace'].includes(perfil.licenseStatus)) return false;
  return perfil.licenseExpiresAt == null || perfil.licenseExpiresAt > at;
}

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
  const status = await entitlement();
  if (status.error) return offlineEntitlementFallback();
  return {
    ...status,
    allowed: status.licenseActive || status.freeGamesRemaining > 0,
    reason: status.licenseActive || status.freeGamesRemaining > 0 ? null : 'free_limit_reached',
  };
}

export async function claimMatchStart(matchId) {
  const sb = supabase();
  if (!sb) {
    return offlineEntitlementFallback();
  }
  const { data, error } = await sb.rpc('claim_match_start', { p_match_id: matchId });
  if (error) return offlineEntitlementFallback();
  return data;
}
