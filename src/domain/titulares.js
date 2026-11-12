/**
 * Titulares de cada parte: quem estava em campo no apito inicial dessa parte.
 *
 * Vai pelas entradas (stints) de cada jogador e não pelo `startPeriod`: quem
 * entra no cinco da 2.ª parte abre a entrada ainda no intervalo, com a parte a
 * dizer 1 (ver domain/tempos.js). Uma entrada conta se estava aberta no minuto
 * em que a parte começou e durou para lá dele.
 */
import { POSITIONS } from './constants.js';

const partesDoJogo = (state) => (state?.periodStarts?.[3] != null ? [1, 2, 3, 4] : [1, 2]);

/** Minuto do jogo em que a parte começou, ou null se ainda não começou. */
function inicioDaParte(state, parte) {
  if (parte === 1) return 0;
  const v = state?.periodStarts?.[parte];
  if (v != null) return v;
  if (parte === 2) return state?.firstHalfMs ?? null;
  return null;
}

const ordemPosicao = (p) => {
  const i = POSITIONS.indexOf(p);
  return i < 0 ? POSITIONS.length : i;
};

/**
 * `[{ parte, jogadores: [{ playerId, name, number, position }] }]`, só com as
 * partes que já começaram e têm alguém. Ordenado por posição (GR primeiro) e
 * número.
 */
export function titularesPorParte(state) {
  if (!state?.players) return [];
  const fimJogo = state.elapsedMatchMs ?? Infinity;
  const out = [];
  for (const parte of partesDoJogo(state)) {
    const inicio = inicioDaParte(state, parte);
    if (inicio == null) continue;
    const jogadores = [];
    for (const p of Object.values(state.players)) {
      const st = (p.stints || []).find((x) => {
        const fim = x.endMatchMs ?? fimJogo;
        return x.startMatchMs <= inicio && fim > inicio;
      });
      if (!st) continue;
      jogadores.push({
        playerId: p.playerId,
        name: p.name,
        number: p.number,
        position: st.startMatchMs === inicio ? st.startingPosition || null : null,
      });
    }
    if (!jogadores.length) continue;
    jogadores.sort(
      (a, b) => ordemPosicao(a.position) - ordemPosicao(b.position) || (a.number ?? 999) - (b.number ?? 999)
    );
    out.push({ parte, jogadores });
  }
  return out;
}
