'use client';

// components/live/pieces.jsx — as peças do ecrã de jogo: marcador, cronómetro,
// campo, banco e sanções.
//
// Nenhuma decide nada: recebem o estado e devolvem toques. Toda a mutação passa
// pelo `commit` da página, que grava um evento e recalcula o jogo.

import { fmt, periodProgress, readClock } from '@/domain/clock.js';
import { playerMatchStats, playerCards } from '@/domain/stats.js';
import {
  countOnCourt,
  foulsInPeriod,
  powerPlayAtivo,
  powerPlayAutomatico,
} from '@/domain/reducer.js';
import {
  POSITIONS,
  POSITION_SHORT,
  PLAYER_MATCH_STATUS,
  MAX_ON_COURT,
  FOUL_LIMIT,
  PENALTY_ALERT_MS,
} from '@/domain/constants.js';
import { openPenalties, PENALTY_STATUS, canReplaceExpelled } from '@/domain/penalties.js';

/* --------------------------------------------------------------- marcador */

/**
 * Grelha de três colunas (nós · traço · adversário) e três linhas
 * (nome · golos · faltas). Assim o traço fica sempre à altura dos números,
 * independentemente do que houver por cima e por baixo.
 */
export function Scoreboard({ state, ourName, opponentName, ourFull, opponentFull, interactive, on }) {
  return (
    <div className="scoreboard">
      <span className="scoreboard__name is-left" title={ourFull}>
        {ourName}
      </span>
      <span className="scoreboard__name is-right" title={opponentFull}>
        {opponentName}
      </span>
      <span className="scoreboard__dash">—</span>
      <ScoreCell team="US" score={state.teamScore} side="is-left" interactive={interactive} on={on} />
      <ScoreCell
        team="THEM"
        score={state.opponentScore}
        side="is-right"
        interactive={interactive}
        on={on}
      />
      <FoulsCell state={state} team="US" side="is-left" interactive={interactive} on={on} />
      <FoulsCell state={state} team="THEM" side="is-right" interactive={interactive} on={on} />
    </div>
  );
}

function ScoreCell({ team, score, side, interactive, on }) {
  return (
    <div className={`scoreboard__score ${side}`}>
      {interactive ? (
        <button className="scorebtn" aria-label="Menos um golo" onClick={() => on.removeGoal(team)}>
          −
        </button>
      ) : null}
      <span className="scoreboard__value">{score}</span>
      {interactive ? (
        <button
          className="scorebtn scorebtn--add"
          aria-label="Mais um golo"
          onClick={() => on.addGoal(team)}
        >
          +
        </button>
      ) : null}
    </div>
  );
}

/** Faltas da parte que está a decorrer. À quinta o bloco fica em alerta. */
function FoulsCell({ state, team, side, interactive, on }) {
  const n = foulsInPeriod(state, team);
  const quente = n >= FOUL_LIMIT;
  return (
    <div className={`scoreboard__fouls ${side} ${quente ? 'is-hot' : ''}`}>
      {interactive ? (
        <button className="foulbtn" aria-label="Menos uma falta" onClick={() => on.removeFoul(team)}>
          −
        </button>
      ) : null}
      <span className="foulbtn__n">{n}</span>
      <span className="foulbtn__label">{n === 1 ? 'falta' : 'faltas'}</span>
      {interactive ? (
        <button
          className="foulbtn foulbtn--add"
          aria-label="Mais uma falta"
          onClick={() => on.addFoul(team)}
        >
          +
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- cronómetro */

/**
 * O cronómetro conta sempre a subir e nunca pára sozinho ao chegar à duração
 * configurada — o árbitro é que manda. Passado o limite, o número fica âmbar e a
 * linha de baixo troca a contagem decrescente por quanto tempo já vai a mais.
 */
export function ClockBox({ state, periodDurationMs, periodLabel, running, now }) {
  const p = periodProgress(state, periodDurationMs, now);
  return (
    <div className="clockbox">
      <span className="clockbox__period">{periodLabel}</span>
      <span className={`clockbox__time ${p.over ? 'is-over' : ''}`}>{fmt(p.periodMs)}</span>
      <span className="clockbox__hint">
        {p.over
          ? `+${fmt(p.overtimeMs)} além dos ${fmt(p.limitMs)} · total ${fmt(p.matchMs)}`
          : `Faltam ${fmt(p.remainingMs)} · total ${fmt(p.matchMs)}`}
      </span>
      <span className={`pill ${running ? 'pill--live' : 'pill--paused'}`}>
        {running ? 'A CORRER' : 'PARADO'}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ campo */

export function Court({ state, sel, clockMs, penaltyMs, on }) {
  const emCampo = countOnCourt(state);
  return (
    <section className="court">
      <div className="court__bg" />
      {POSITIONS.map((pos) => {
        const pid = state.court[pos];
        const p = pid ? state.players[pid] : null;
        return p ? (
          <CourtCard key={pos} pos={pos} p={p} state={state} sel={sel} clockMs={clockMs} on={on} />
        ) : (
          <EmptySlot
            key={pos}
            pos={pos}
            sel={sel}
            trancado={Boolean(canReplaceExpelled(state, clockMs, penaltyMs))}
            on={on}
          />
        );
      })}
      {emCampo < MAX_ON_COURT ? (
        <div className="court__warn">{emCampo} em campo — inferioridade numérica</div>
      ) : null}
    </section>
  );
}

function CourtCard({ pos, p, state, sel, clockMs, on }) {
  const selecionado = sel?.kind === 'court' && sel.playerId === p.playerId;
  const aEntrar = sel?.kind === 'bench';
  const s = playerMatchStats(state.players[p.playerId] || p, clockMs);

  return (
    <button
      className={`pcard pcard--court slot--${pos.toLowerCase()} ${selecionado ? 'is-out' : ''} ${
        aEntrar ? 'is-target' : ''
      }`}
      onClick={() => on.tapCourt(pos, p)}
    >
      <div className="pcard__top">
        <span className="pcard__num">{p.number}</span>
        <span className="pcard__pos">{POSITION_SHORT[pos]}</span>
        {pos === 'GOALKEEPER' ? <PowerPlayChip state={state} on={on} /> : null}
        <CardChips p={p} state={state} />
        <span
          className="pcard__goal"
          title="Golo deste jogador"
          onClick={(e) => {
            e.stopPropagation();
            on.scoreFor(p);
          }}
        >
          G
        </span>
        <span
          className="pcard__more"
          onClick={(e) => {
            e.stopPropagation();
            on.courtMenu(pos, p);
          }}
        >
          ⋯
        </span>
      </div>
      <div className="pcard__name">{p.name}</div>
      <div className="pcard__times">
        <span className="pcard__t">Tempo de jogo {fmt(s.courtMs)}</span>
        <span className="pcard__t pcard__t--hi">Em jogo há {fmt(s.currentStintMs ?? 0)}</span>
      </div>
      {selecionado ? <span className="pcard__flag">A SAIR</span> : null}
    </button>
  );
}

function EmptySlot({ pos, sel, trancado, on }) {
  // Durante a sanção o lugar fica trancado: a equipa tem de jogar reduzida.
  const aEntrar = sel?.kind === 'bench' && !trancado;
  return (
    <button
      // pcard--court também nos vazios: é o que os coloca na posição certa do
      // campo (e o que os põe na grelha, no telemóvel).
      className={`pcard pcard--court pcard--empty slot--${pos.toLowerCase()} ${
        aEntrar ? 'is-target' : ''
      } ${trancado ? 'is-locked' : ''}`}
      onClick={() => on.tapEmpty(pos)}
    >
      <span className="pcard__pos">{POSITION_SHORT[pos]}</span>
      <span className="pcard__empty">
        {trancado ? 'Em sanção' : aEntrar ? 'Colocar aqui' : 'Vazio'}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ banco */

export function Bench({ state, sel, clockMs, on }) {
  const lista = Object.values(state.players)
    .filter((p) => p.status !== PLAYER_MATCH_STATUS.ON_COURT)
    .sort((a, b) => {
      const rank = (x) => (x.status === PLAYER_MATCH_STATUS.ON_BENCH ? 0 : 1);
      return rank(a) - rank(b) || a.number - b.number;
    });

  // Duas linhas equilibradas em vez de uma cheia e outra com as sobras:
  // 9 suplentes dão 5+4, não 7+2.
  const cols = lista.length <= 6 ? Math.max(1, lista.length) : Math.ceil(lista.length / 2);
  const noBanco = lista.filter((p) => p.status === PLAYER_MATCH_STATUS.ON_BENCH).length;

  return (
    <section className="bench">
      <div className="bench__head">
        <h2>Banco ({noBanco})</h2>
        {sel?.kind === 'court' ? (
          <span className="bench__hint">Toque num jogador para o fazer entrar</span>
        ) : null}
      </div>
      <div className="bench__row" style={{ '--bench-cols': String(cols) }}>
        {lista.length ? (
          lista.map((p) => (
            <BenchCard key={p.playerId} p={p} state={state} sel={sel} clockMs={clockMs} on={on} />
          ))
        ) : (
          <span className="muted">Sem jogadores no banco.</span>
        )}
      </div>
    </section>
  );
}

function BenchCard({ p, state, sel, clockMs, on }) {
  const expulso = p.status === PLAYER_MATCH_STATUS.EXPELLED;
  const selecionado = sel?.kind === 'bench' && sel.playerId === p.playerId;
  const alvo = sel?.kind === 'court' && !expulso;
  const s = playerMatchStats(state.players[p.playerId] || p, clockMs);

  return (
    <button
      className={`pcard pcard--bench ${selecionado ? 'is-in' : ''} ${alvo ? 'is-target' : ''} ${
        expulso ? 'is-expelled' : ''
      }`}
      onClick={() => on.tapBench(p)}
    >
      <div className="pcard__top">
        <span className="pcard__num">{p.number}</span>
        <CardChips p={p} state={state} />
        {expulso ? <span className="badge badge--danger">EXPULSO</span> : null}
        <span
          className="pcard__more"
          onClick={(e) => {
            e.stopPropagation();
            on.benchMenu(p);
          }}
        >
          ⋯
        </span>
      </div>
      <div className="pcard__name">{p.name}</div>
      {expulso ? (
        <div className="pcard__times">
          <span className="pcard__t">Expulso aos {fmt(p.expelledAtMatchMs)}</span>
        </div>
      ) : (
        <div className="pcard__times">
          <span className="pcard__t">Tempo de jogo {fmt(s.courtMs)}</span>
          {/* Destacado como o "Em jogo há" dos jogadores em campo: é o número que
              decide a próxima substituição — há quanto tempo este descansa. */}
          <span className="pcard__t pcard__t--hi">
            {s.sinceLeftMs == null ? 'Ainda não entrou' : `Saiu há ${fmt(s.sinceLeftMs)}`}
          </span>
          <span className="pcard__t">Entradas {s.entries}</span>
        </div>
      )}
      {selecionado ? <span className="pcard__flag pcard__flag--in">A ENTRAR</span> : null}
    </button>
  );
}

/**
 * O selo 5v4 no cartão de quem está à baliza.
 *
 * Quando quem lá está é um jogador de campo, a app percebe sozinha e o selo
 * acende-se fixo: não há nada a decidir. O toque serve para o outro caso — um
 * guarda-redes a sério que sobe para jogar como quinto, que ninguém adivinha.
 */
function PowerPlayChip({ state, on }) {
  const auto = powerPlayAutomatico(state);
  const ativo = powerPlayAtivo(state);
  return (
    <span
      className={`ppchip ${ativo ? 'is-on' : ''} ${auto ? 'is-auto' : ''}`}
      title={
        ativo
          ? auto
            ? 'Guarda-redes avançado: está um jogador de campo à baliza. Toque para desligar.'
            : 'A contar 5v4. Toque para terminar.'
          : 'Toque para marcar que o guarda-redes está a jogar como quinto.'
      }
      onClick={(e) => {
        e.stopPropagation();
        on.togglePowerPlay(!ativo);
      }}
    >
      5v4
    </span>
  );
}

/** Marca visual dos cartões já mostrados a este jogador. */
function CardChips({ p, state }) {
  const c = playerCards(p.playerId, state.cards);
  if (!c.yellows && !c.reds) return null;
  return (
    <span className="pcard__cards">
      {Array.from({ length: c.yellows }, (_, i) => (
        <span key={`y${i}`} className="cardchip cardchip--yellow" />
      ))}
      {Array.from({ length: c.reds }, (_, i) => (
        <span key={`r${i}`} className="cardchip cardchip--red" />
      ))}
    </span>
  );
}

/* --------------------------------------------------------------- sanções */

/**
 * Expulsões do adversário. Não têm cronómetro nem nomes — o que interessa é o
 * número, porque é ele que decide se um golo sofrido devolve ou não um jogador
 * nosso. Com 4 contra 4 ninguém repõe; a app só sabe isso se alguém lhe disser
 * quantos são eles.
 */
function OpponentExpulsions({ state, on }) {
  const n = state.opponentExpulsions || 0;
  return (
    <div className={`penalty penalty--rival ${n ? 'is-on' : ''}`}>
      <span className="penalty__who">Expulsos do adversário</span>
      <div className="rivalcount">
        <button
          className="foulbtn"
          aria-label="Menos uma expulsão do adversário"
          disabled={!n}
          onClick={() => on.opponentExpulsion(-1)}
        >
          −
        </button>
        <span className="rivalcount__n">{n}</span>
        <button
          className="foulbtn foulbtn--add"
          aria-label="Mais uma expulsão do adversário"
          onClick={() => on.opponentExpulsion(1)}
        >
          +
        </button>
      </div>
      <span className="penalty__label">
        {n ? `Jogam com ${MAX_ON_COURT - n}` : 'Jogam com cinco'}
      </span>
    </div>
  );
}

/** Cartões por baixo do campo, um por jogador expulso com sanção por cumprir. */
export function Penalties({ state, clockMs, penaltyMs, on }) {
  const abertas = openPenalties(state, clockMs, penaltyMs);

  return (
    <aside className="penalties">
      {abertas.map((p) =>
        p.status === PENALTY_STATUS.PENDING ? (
          <div key={p.playerId} className="penalty penalty--pending">
            <span className="penalty__who">
              #{p.number} {p.name}
            </span>
            <span className="penalty__label">Expulso · sanção por iniciar</span>
            <button
              className="btn btn--warn btn--block"
              onClick={() => on.startPenalty(p.playerId)}
            >
              Começar {Math.round(penaltyMs / 60000)} min
            </button>
          </div>
        ) : (
          <div
            key={p.playerId}
            // Últimos segundos: o cartão passa a pulsar a vermelho.
            className={`penalty penalty--running ${
              p.remainingMs <= PENALTY_ALERT_MS ? 'is-alert' : ''
            }`}
          >
            <span className="penalty__who">
              #{p.number} {p.name}
            </span>
            <span className="penalty__time">{fmt(p.remainingMs)}</span>
            <span className="penalty__label">até poder repor</span>
          </div>
        )
      )}
      <OpponentExpulsions state={state} on={on} />
    </aside>
  );
}

export function clockMsOf(state, now) {
  return readClock(state, now).matchMs;
}
