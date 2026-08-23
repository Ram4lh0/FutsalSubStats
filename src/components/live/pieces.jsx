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
  PLAYER_MATCH_STATUS,
  MAX_ON_COURT,
  FOUL_LIMIT,
  PENALTY_ALERT_MS,
} from '@/domain/constants.js';
import { openPenalties, PENALTY_STATUS, canReplaceExpelled } from '@/domain/penalties.js';
import { positionShort } from '@/lib/format.js';
import { t } from '@/lib/i18n/index.js';

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
        extra={interactive ? <RivalOut state={state} on={on} /> : null}
      />
      <FoulsCell state={state} team="US" side="is-left" interactive={interactive} on={on} />
      <FoulsCell state={state} team="THEM" side="is-right" interactive={interactive} on={on} />
    </div>
  );
}

function ScoreCell({ team, score, side, interactive, on, extra }) {
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
      {extra}
    </div>
  );
}

/**
 * Expulsos do adversário, encostado ao resultado deles.
 *
 * Era uma faixa a toda a largura por baixo do marcador, e ocupava mais ecrã do
 * que o assunto merece: passam jogos inteiros sem ninguém ser expulso do outro
 * lado. Aqui vive ao lado do número a que diz respeito, e num telemóvel cai para
 * a linha de baixo, que é onde há espaço.
 *
 * Continua a ter de existir, e pequeno não quer dizer acessório: a app não vê o
 * banco deles, e é este número que decide se um golo sofrido devolve ou não um
 * jogador nosso. Com 4 contra 4 ninguém repõe.
 */
function RivalOut({ state, on }) {
  const n = state.opponentExpulsions || 0;
  return (
    <span
      className={`rivalout ${n ? 'is-on' : ''}`}
      title={n ? t('vivo.jogamCom', { n: MAX_ON_COURT - n }) : t('vivo.jogamComCinco')}
    >
      <span className="rivalout__lbl">{t('vivo.expAdvCurto')}</span>
      <span className="rivalout__linha">
        <button
          className="rivalout__b"
          aria-label={t('vivo.menosExpulsao')}
          disabled={!n}
          onClick={() => on.opponentExpulsion(-1)}
        >
          −
        </button>
        <span className="rivalout__n">{n}</span>
        <button
          className="rivalout__b"
          aria-label={t('vivo.maisExpulsao')}
          onClick={() => on.opponentExpulsion(1)}
        >
          +
        </button>
      </span>
    </span>
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
export function ClockBox({ state, periodDurationMs, periodLabel, running, now, on }) {
  const p = periodProgress(state, periodDurationMs, now);
  return (
    <div className="clockbox">
      <span className="clockbox__period">{periodLabel}</span>
      <div className="clockbox__linha">
        {/* Os de tirar à esquerda, os de somar à direita, e o relógio ao meio.
            É a leitura natural de uma linha do tempo: para trás fica atrás, para
            a frente fica à frente. Com os quatro do mesmo lado era preciso ler o
            sinal de cada um antes de carregar, e isto usa-se com o jogo a
            decorrer. */}
        {on?.adjustClock ? (
          <span className="clockadj">
            <button
              type="button"
              className="clockadj__b"
              title={t('vivo.menosDezSegundos')}
              aria-label={t('vivo.menosDezSegundos')}
              onClick={() => on.adjustClock(-10_000)}
            >
              −10s
            </button>
            <button
              type="button"
              className="clockadj__b"
              title={t('vivo.menosSegundo')}
              aria-label={t('vivo.menosSegundo')}
              onClick={() => on.adjustClock(-1000)}
            >
              −1s
            </button>
          </span>
        ) : null}

        <span className={`clockbox__time ${p.over ? 'is-over' : ''}`}>{fmt(p.periodMs)}</span>

        {on?.adjustClock ? (
          <span className="clockadj">
            <button
              type="button"
              className="clockadj__b"
              title={t('vivo.maisDezSegundos')}
              aria-label={t('vivo.maisDezSegundos')}
              onClick={() => on.adjustClock(10_000)}
            >
              +10s
            </button>
            <button
              type="button"
              className="clockadj__b"
              title={t('vivo.maisSegundo')}
              aria-label={t('vivo.maisSegundo')}
              onClick={() => on.adjustClock(1000)}
            >
              +1s
            </button>
          </span>
        ) : null}
      </div>
      <span className="clockbox__hint">
        {p.over
          ? t('vivo.alemDe', {
              extra: fmt(p.overtimeMs),
              limite: fmt(p.limitMs),
              total: fmt(p.matchMs),
            })
          : t('vivo.faltam', { resta: fmt(p.remainingMs), total: fmt(p.matchMs) })}
      </span>
      <span className={`pill ${running ? 'pill--live' : 'pill--paused'}`}>
        {running ? t('vivo.aCorrer') : t('vivo.parado')}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ campo */

export function Court({ state, sel, clockMs, penaltyMs, on, arrasto }) {
  const emCampo = countOnCourt(state);
  return (
    <section className="court">
      <div className="court__bg" />
      {POSITIONS.map((pos) => {
        const pid = state.court[pos];
        const p = pid ? state.players[pid] : null;
        return p ? (
          <CourtCard
            key={pos}
            pos={pos}
            p={p}
            state={state}
            sel={sel}
            clockMs={clockMs}
            on={on}
            arrasto={arrasto}
          />
        ) : (
          <EmptySlot
            key={pos}
            pos={pos}
            sel={sel}
            trancado={Boolean(canReplaceExpelled(state, clockMs, penaltyMs))}
            on={on}
            arrasto={arrasto}
          />
        );
      })}
      {emCampo < MAX_ON_COURT ? (
        <div className="court__warn">{t('vivo.inferioridade', { n: emCampo })}</div>
      ) : null}
    </section>
  );
}

function CourtCard({ pos, p, state, sel, clockMs, on, arrasto }) {
  const selecionado = sel?.kind === 'court' && sel.playerId === p.playerId;
  const aEntrar = sel?.kind === 'bench';
  const s = playerMatchStats(state.players[p.playerId] || p, clockMs);
  const pega = arrasto?.pegar({ tipo: 'court', playerId: p.playerId, pos }) || {};
  const solta = arrasto?.alvo({ tipo: 'court', pos }) || {};
  const aSerArrastado = arrasto?.origem?.playerId === p.playerId;

  return (
    <button
      className={`pcard pcard--court slot--${pos.toLowerCase()} ${selecionado ? 'is-out' : ''} ${
        aEntrar ? 'is-target' : ''
      } ${pega.className || ''} ${solta.className || ''} ${aSerArrastado ? 'is-a-arrastar' : ''}`}
      data-largar={solta['data-largar']}
      onPointerDown={pega.onPointerDown}
      onPointerMove={pega.onPointerMove}
      onPointerUp={pega.onPointerUp}
      onPointerCancel={pega.onPointerCancel}
      onClickCapture={pega.onClickCapture}
      onClick={() => on.tapCourt(pos, p)}
    >
      <div className="pcard__top">
        <span className="pcard__num">{p.number}</span>
        {/* A posição saiu daqui. O cartão já **está** no lugar dela dentro do
            campo, portanto a etiqueta repetia o que se via, e era o que gastava
            a linha de cima — que agora sobra para o que vier a seguir.
            Nos lugares vazios continua, que aí não há mais nada a identificá-los. */}
        {pos === 'GOALKEEPER' ? <PowerPlayChip state={state} on={on} /> : null}
        <CardChips p={p} state={state} />
        <span
          className="pcard__goal"
          title="Golo deste jogador"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
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
        <span className="pcard__t">{t('vivo.tempoDeJogo', { tempo: fmt(s.courtMs) })}</span>
        <span className="pcard__t pcard__t--hi">
          {t('vivo.emJogoHa', { tempo: fmt(s.currentStintMs ?? 0) })}
        </span>
      </div>
      {selecionado ? <span className="pcard__flag">{t('vivo.aSair')}</span> : null}
    </button>
  );
}

function EmptySlot({ pos, sel, trancado, on, arrasto }) {
  // Durante a sanção o lugar fica trancado: a equipa tem de jogar reduzida.
  const aEntrar = sel?.kind === 'bench' && !trancado;
  return (
    <button
      // pcard--court também nos vazios: é o que os coloca na posição certa do
      // campo (e o que os põe na grelha, no telemóvel).
      className={`pcard pcard--court pcard--empty slot--${pos.toLowerCase()} ${
        aEntrar ? 'is-target' : ''
      } ${trancado ? 'is-locked' : ''} ${
        // Um lugar trancado por sanção não recebe ninguém, nem por toque nem por
        // arrasto: a equipa tem mesmo de jogar reduzida.
        trancado ? '' : arrasto?.alvo({ tipo: 'court', pos })?.className || ''
      }`}
      data-largar={trancado ? undefined : arrasto?.alvo({ tipo: 'court', pos })?.['data-largar']}
      onClick={() => on.tapEmpty(pos)}
    >
      <span className="pcard__pos">{positionShort(pos)}</span>
      <span className="pcard__empty">
        {trancado ? t('vivo.emSancao') : aEntrar ? t('vivo.colocarAqui') : t('vivo.vazio')}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ banco */

export function Bench({ state, sel, clockMs, on, arrasto }) {
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

  // O banco inteiro recebe quem vem do campo. Largar em cima de um suplente diz
  // logo quem entra; largar no espaço à volta é sair sem ter decidido, e aí a
  // app pergunta. As duas coisas são o mesmo gesto, com um passo a mais ou a
  // menos — e é o `closest` do arrasto que escolhe o alvo mais interior.
  const solta = (arrasto?.origem?.tipo === 'court' && arrasto.alvo({ tipo: 'bench' })) || {};

  return (
    <section
      className={`bench ${solta.className || ''}`}
      data-largar={solta['data-largar']}
    >
      <div className="bench__head">
        <h2>{t('vivo.banco', { n: noBanco })}</h2>
        {sel?.kind === 'court' ? (
          <span className="bench__hint">{t('vivo.dicaEntrar')}</span>
        ) : null}
      </div>
      <div className="bench__row" style={{ '--bench-cols': String(cols) }}>
        {lista.length ? (
          lista.map((p) => (
            <BenchCard
              key={p.playerId}
              p={p}
              state={state}
              sel={sel}
              clockMs={clockMs}
              on={on}
              arrasto={arrasto}
            />
          ))
        ) : (
          <span className="muted">{t('vivo.semBanco')}</span>
        )}
      </div>
    </section>
  );
}

function BenchCard({ p, state, sel, clockMs, on, arrasto }) {
  const expulso = p.status === PLAYER_MATCH_STATUS.EXPELLED;
  const selecionado = sel?.kind === 'bench' && sel.playerId === p.playerId;
  const alvo = sel?.kind === 'court' && !expulso;
  const s = playerMatchStats(state.players[p.playerId] || p, clockMs);

  // Um expulso não volta a entrar, portanto nem se arrasta nem recebe ninguém.
  const pega = (!expulso && arrasto?.pegar({ tipo: 'bench', playerId: p.playerId })) || {};
  const recebe = !expulso && arrasto?.origem?.tipo === 'court';
  const solta = (recebe && arrasto?.alvo({ tipo: 'bench', playerId: p.playerId })) || {};
  const aSerArrastado = arrasto?.origem?.playerId === p.playerId;

  return (
    <button
      className={`pcard pcard--bench ${selecionado ? 'is-in' : ''} ${alvo ? 'is-target' : ''} ${
        expulso ? 'is-expelled' : ''
      } ${pega.className || ''} ${solta.className || ''} ${aSerArrastado ? 'is-a-arrastar' : ''}`}
      data-largar={solta['data-largar']}
      onPointerDown={pega.onPointerDown}
      onPointerMove={pega.onPointerMove}
      onPointerUp={pega.onPointerUp}
      onPointerCancel={pega.onPointerCancel}
      onClickCapture={pega.onClickCapture}
      onClick={() => on.tapBench(p)}
    >
      <div className="pcard__top">
        <span className="pcard__num">{p.number}</span>
        <CardChips p={p} state={state} />
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
      {/* A marca de expulso vai por baixo do minuto, e não na linha de cima:
          ali ao lado do número e dos cartões não cabia, e saía do cartão. */}
      {expulso ? (
        <div className="pcard__times">
          <span className="pcard__t">
            {t('vivo.expulsoAos', { tempo: fmt(p.expelledAtMatchMs) })}
          </span>
          <span className="badge badge--danger">{t('vivo.expulso')}</span>
        </div>
      ) : (
        <div className="pcard__times">
          <span className="pcard__t">{t('vivo.tempoDeJogo', { tempo: fmt(s.courtMs) })}</span>
          {/* Destacado como o "Em jogo há" dos jogadores em campo: é o número que
              decide a próxima substituição — há quanto tempo este descansa. */}
          <span className="pcard__t pcard__t--hi">
            {s.sinceLeftMs == null
              ? t('vivo.aindaNaoEntrou')
              : t('vivo.saiuHa', { tempo: fmt(s.sinceLeftMs) })}
          </span>
          <span className="pcard__t">{t('vivo.entradas', { n: s.entries })}</span>
        </div>
      )}
      {selecionado ? (
        <span className="pcard__flag pcard__flag--in">{t('vivo.aEntrar')}</span>
      ) : null}
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
            ? t('vivo.ppAuto')
            : t('vivo.ppManual')
          : t('vivo.ppDesligado')
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
            <span className="penalty__label">{t('vivo.sancaoPorIniciar')}</span>
            <button
              className="btn btn--warn btn--block"
              onClick={() => on.startPenalty(p.playerId)}
            >
              {t('vivo.comecarMin', { n: Math.round(penaltyMs / 60000) })}
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
            <span className="penalty__label">{t('vivo.atePoderRepor')}</span>
          </div>
        )
      )}
    </aside>
  );
}

export function clockMsOf(state, now) {
  return readClock(state, now).matchMs;
}
