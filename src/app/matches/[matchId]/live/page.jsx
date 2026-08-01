'use client';

// Jogo ao vivo (secção 4.8). O ecrã que está aberto durante os 40 minutos.
//
// Regra que atravessa o ficheiro: nada aqui guarda estado do jogo. Cada toque
// grava um evento e o estado é recalculado a partir de todos os eventos. É o que
// permite desfazer, corrigir e sobreviver a um recarregamento a meio.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Guard from '@/components/Guard.jsx';
import { Empty } from '@/components/bits.jsx';
import { Dialog, useUI } from '@/lib/ui.jsx';
import Halftime from '@/components/live/Halftime.jsx';
import { Scoreboard, ClockBox, Court, Bench, Penalties, clockMsOf } from '@/components/live/pieces.jsx';
import {
  pickPlayer,
  pickReplacement,
  positionMenu,
  stintsDialog,
  tenMetreAlert,
} from '@/components/live/dialogs.jsx';
import useNow from '@/lib/useNow.js';
import { beep, unlockAudio } from '@/lib/beep.js';
import * as GE from '@/lib/goalEditing.jsx';
import { clubs, events, matches, loadMatch } from '@/lib/data/repository.js';
import * as A from '@/domain/actions.js';
import * as V from '@/domain/validation.js';
import { countOnCourt, foulsInPeriod, foulsTotal } from '@/domain/reducer.js';
import { playerCards } from '@/domain/stats.js';
import { fmt, readClock } from '@/domain/clock.js';
import { openPenalties, penaltyBoard, canStartPenalty, canReplaceExpelled, PENALTY_STATUS } from '@/domain/penalties.js';
import {
  EVENT,
  EVENT_LABEL,
  MATCH_STATUS,
  MATCH_TIMING,
  MAX_ON_COURT,
  POSITIONS,
  POSITION_LABEL,
  PLAYER_MATCH_STATUS,
  CARD,
  FOUL_LIMIT,
  timingOf,
  timingConfig,
} from '@/domain/constants.js';
import { clubShort, opponentShort } from '@/lib/format.js';

const OWN_GOAL = '__OWN_GOAL__';

export default function LivePage() {
  return (
    <Guard>
      <Live />
    </Guard>
  );
}

function Live() {
  const { matchId } = useParams();
  const router = useRouter();
  const ui = useUI();
  const { toast, confirmar } = ui;

  const [carregado, setCarregado] = useState(null);
  const [club, setClub] = useState(null);
  const [sel, setSel] = useState(null); // { kind: 'court'|'bench', playerId }
  // Sanções cujo fim já foi anunciado — evita repetir o aviso a cada batimento e
  // evita anunciar sanções que já tinham terminado quando o ecrã abriu.
  const anunciadas = useRef(new Set());

  const state = carregado?.state || null;
  const match = carregado?.match || null;
  const aCorrer = state?.timerStatus === 'RUNNING';
  const now = useNow(250, Boolean(aCorrer));
  const clockMs = state ? clockMsOf(state, now) : 0;

  const recarregar = useCallback(async () => {
    const novo = await loadMatch(matchId);
    setCarregado(novo || { vazio: true });
    return novo;
  }, [matchId]);

  useEffect(() => {
    (async () => {
      const novo = await recarregar();
      if (novo) setClub(await clubs.get(novo.match.clubId));
    })();
  }, [recarregar]);

  // Sanções já terminadas quando o ecrã abre não devem disparar aviso.
  useEffect(() => {
    if (!state) return;
    for (const p of penaltyBoard(state, clockMs, penaltyMs())) {
      if (p.status === PENALTY_STATUS.DONE && p.penaltyId) anunciadas.current.add(p.penaltyId);
    }
    // Só ao abrir o jogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(state)]);

  // Deteta o momento exacto em que uma sanção chega ao fim.
  useEffect(() => {
    if (!state) return;
    for (const p of penaltyBoard(state, clockMs, penaltyMs())) {
      if (p.status !== PENALTY_STATUS.DONE || !p.penaltyId) continue;
      if (anunciadas.current.has(p.penaltyId)) continue;
      anunciadas.current.add(p.penaltyId);
      beep();
      toast(`2 minutos cumpridos — pode repor um jogador por #${p.number} ${p.name}.`, 'ok', 8000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockMs, state]);

  // Preparação e jogo terminado têm ecrã próprio.
  useEffect(() => {
    if (!state) return;
    if (state.status === MATCH_STATUS.DRAFT || state.status === MATCH_STATUS.READY)
      router.replace(`/matches/${matchId}/setup`);
    if (state.status === MATCH_STATUS.FINISHED) router.replace(`/matches/${matchId}/summary`);
  }, [state, matchId, router]);

  if (!carregado) return <p className="muted">A carregar…</p>;
  if (carregado.vazio) return <Empty>Jogo não encontrado.</Empty>;
  if (
    state.status === MATCH_STATUS.DRAFT ||
    state.status === MATCH_STATUS.READY ||
    state.status === MATCH_STATUS.FINISHED
  )
    return null;

  // O tipo de jogo (herdado do clube) define a duração da parte e da sanção.
  function penaltyMs() {
    return timingConfig(match).penaltyDurationMs;
  }
  const timing = timingOf(match);
  const ourName = clubShort(club);
  const rivalName = opponentShort(match);

  /** Grava um evento e recalcula o jogo. Toda a mutação passa por aqui. */
  async function commit(event, mensagem, { sync = 'defer' } = {}) {
    await events.append(event, { sync });
    setSel(null);
    const novo = await recarregar();
    if (mensagem) toast(mensagem, 'ok');
    return novo?.state;
  }

  /* ----------------------------------------------------------- resultado */

  function lastTeamGoal(st) {
    const nossos = st.goals.filter((g) => g.team === 'US');
    return nossos[nossos.length - 1] || null;
  }

  /**
   * O resultado sobe SEMPRE primeiro. A atribuição vem a seguir, num evento
   * separado — assim o marcador nunca fica à espera de dois toques, e fechar o
   * popup deixa apenas um golo por atribuir (corrigível no resumo).
   */
  async function scoreFor(p) {
    const st = await commit(A.teamGoalBy(state, p.playerId), `Golo de ${p.name}!`);
    const golo = lastTeamGoal(st);
    if (golo) await askAssist(st, golo, p.playerId);
  }

  async function addTeamGoal() {
    const st = await commit(A.goal(state, EVENT.TEAM_GOAL_ADDED), 'Golo!');
    const golo = lastTeamGoal(st);
    if (!golo) return;

    const scorerId = await pickPlayer(ui, st, 'Quem marcou?', {
      allowNone: true,
      noneLabel: 'Não registar',
      extra: [{ id: OWN_GOAL, label: 'Autogolo do adversário' }],
    });
    if (scorerId === undefined) return; // fechou o popup

    // Autogolo: conta para o resultado mas não para nenhum marcador nosso, e por
    // isso também não faz sentido perguntar a assistência.
    if (scorerId === OWN_GOAL) {
      await events.append(
        A.attributeGoal(st, { targetEventId: golo.eventId, scorerId: null, ownGoal: true }),
        { sync: 'defer' }
      );
      await recarregar();
      return toast('Autogolo do adversário.', 'ok');
    }
    if (!scorerId) return;
    await events.append(A.attributeGoal(st, { targetEventId: golo.eventId, scorerId }), {
      sync: 'defer',
    });
    const depois = await recarregar();
    await askAssist(depois.state, golo, scorerId);
  }

  async function askAssist(st, golo, scorerId) {
    const assistId = await pickPlayer(ui, st, 'Quem fez a assistência?', {
      exclude: scorerId,
      allowNone: true,
      noneLabel: 'Sem assistência',
    });
    if (!assistId) return;
    await events.append(A.attributeGoal(st, { targetEventId: golo.eventId, assistId }), {
      sync: 'defer',
    });
    const depois = await recarregar();
    toast(`Assistência de ${depois.state.players[assistId]?.name || '—'}.`, 'ok');
  }

  /**
   * Golo do adversário: pela regra, encurta a sanção mais antiga a decorrer. O
   * reducer trata disso; aqui só é preciso dar a notícia ao treinador.
   */
  async function addOpponentGoal() {
    unlockAudio();
    const emCurso = (st) =>
      openPenalties(st, readClock(st, Date.now()).matchMs, penaltyMs())
        .filter((p) => p.status === PENALTY_STATUS.RUNNING)
        .map((p) => p.playerId);

    const antes = emCurso(state);
    const st = await commit(A.goal(state, EVENT.OPPONENT_GOAL_ADDED));
    const depois = new Set(emCurso(st));
    const libertado = antes.find((id) => !depois.has(id));
    if (!libertado) return;

    const p = st.players[libertado];
    anunciadas.current.add(st.penalties.find((x) => x.playerId === libertado)?.id);
    beep();
    toast(
      `Golo sofrido — a sanção de #${p.number} ${p.name} terminou. Pode repor um jogador.`,
      'ok',
      8000
    );
  }

  /* --------------------------------------------------------------- faltas */

  /**
   * O contador sobe já; o aviso dos 10 metros vem a seguir (é a informação
   * urgente do momento) e só depois se pergunta o jogador.
   *
   * Em qualquer dos casos o jogador escolhido é sempre do nosso plantel — do
   * adversário não temos ninguém registado. Muda o papel: numa falta nossa é
   * quem a cometeu, numa falta deles é quem a sofreu.
   */
  async function addFoul(team) {
    const st = await commit(
      A.foul(state, team === 'US' ? EVENT.TEAM_FOUL_ADDED : EVENT.OPPONENT_FOUL_ADDED)
    );
    const n = foulsInPeriod(st, team);
    if (n > FOUL_LIMIT) {
      await tenMetreAlert(ui, {
        beneficia: team === 'US' ? rivalName : ourName,
        faltou: team === 'US' ? ourName : rivalName,
        n,
      });
    }

    const ultima = [...st.fouls].reverse().find((f) => f.team === team);
    if (!ultima) return;
    const nossa = team === 'US';
    const playerId = await pickPlayer(ui, st, nossa ? 'Quem fez a falta?' : 'Quem sofreu a falta?', {
      allowNone: true,
      noneLabel: 'Não registar',
    });
    if (!playerId) return;
    await events.append(A.attributeFoul(st, { targetEventId: ultima.eventId, playerId }), {
      sync: 'defer',
    });
    const depois = await recarregar();
    const nome = depois.state.players[playerId]?.name || '—';
    toast(nossa ? `Falta de ${nome}.` : `Falta sofrida por ${nome}.`, 'ok');
  }

  function removeFoul(team) {
    if (foulsInPeriod(state, team) === 0) return;
    return commit(
      A.foul(state, team === 'US' ? EVENT.TEAM_FOUL_REMOVED : EVENT.OPPONENT_FOUL_REMOVED)
    );
  }

  /* -------------------------------------------------------------- sanções */

  async function startPenalty(playerId) {
    const erro = canStartPenalty(state, playerId);
    if (erro) return toast(erro, 'error');
    unlockAudio(); // o toque do utilizador é o que permite tocar o aviso depois
    await commit(
      A.startPenalty(state, { playerId, durationMs: penaltyMs() }),
      `Contagem de ${Math.round(penaltyMs() / 60000)} minutos iniciada.`
    );
  }

  /* ------------------------------------------------------------ interação */

  function tapCourt(pos, p) {
    if (sel?.kind === 'bench') return doSubstitution(p.playerId, sel.playerId, pos);
    if (sel?.kind === 'court' && sel.playerId === p.playerId) return setSel(null);
    if (sel?.kind === 'court') return doMoveTo(sel.playerId, pos);
    setSel({ kind: 'court', playerId: p.playerId });
  }

  function tapBench(p) {
    if (p.status === PLAYER_MATCH_STATUS.EXPELLED)
      return toast('Um jogador expulso não pode voltar a entrar.', 'error');
    if (sel?.kind === 'court') {
      const pos = state.players[sel.playerId].position;
      return doSubstitution(sel.playerId, p.playerId, pos);
    }
    if (sel?.kind === 'bench' && sel.playerId === p.playerId) return setSel(null);
    setSel({ kind: 'bench', playerId: p.playerId });
  }

  async function tapEmpty(pos) {
    if (sel?.kind === 'bench') return doReplacement(sel.playerId, pos);
    if (sel?.kind === 'court') return doMoveTo(sel.playerId, pos);
    const bloqueio = canReplaceExpelled(state, clockMs, penaltyMs());
    if (bloqueio) return toast(bloqueio, 'error');
    const disponiveis = Object.values(state.players).filter(
      (p) => p.status === PLAYER_MATCH_STATUS.ON_BENCH
    );
    if (!disponiveis.length) return toast('Não há jogadores disponíveis no banco.', 'error');
    const playerId = await pickReplacement(ui, state, pos);
    if (playerId) await doReplacement(playerId, pos);
  }

  async function doSubstitution(outId, inId, position) {
    const erro = V.validateSubstitution(state, { playerOutId: outId, playerInId: inId });
    if (erro) return toast(erro, 'error');
    await commit(
      A.substitute(state, {
        playerOutId: outId,
        playerInId: inId,
        position: position || state.players[outId].position,
      }),
      `Entra ${state.players[inId].name} · sai ${state.players[outId].name}`
    );
  }

  async function doMoveTo(playerId, toPosition) {
    const de = state.players[playerId].position;
    if (de === toPosition) return setSel(null);
    await commit(
      A.changePosition(state, { playerId, fromPosition: de, toPosition }),
      'Posição alterada.'
    );
  }

  async function doReplacement(playerInId, position) {
    const bloqueio = canReplaceExpelled(state, clockMs, penaltyMs());
    if (bloqueio) return toast(bloqueio, 'error');
    const erro = V.validateReplacement(state, { playerInId, position });
    if (erro) return toast(erro, 'error');
    await commit(
      A.replaceAfterExpulsion(state, { playerInId, position }),
      `${state.players[playerInId].name} entra em campo.`
    );
  }

  /* ----------------------------------------------------------------- menus */

  /**
   * Itens de disciplina, iguais no campo e no banco.
   * O segundo amarelo é anunciado antes de ser aplicado — expulsa e a equipa
   * fica reduzida, por isso convém não ser uma surpresa.
   */
  async function aplicarAmarelo(p) {
    const temAmarelo = state.cards.some((c) => c.playerId === p.playerId && c.type === CARD.YELLOW);
    if (temAmarelo) {
      const ok = await confirmar(
        `Segundo amarelo de #${p.number} ${p.name}. Fica expulso e a equipa joga reduzida. Nas estatísticas conta como um vermelho, não como dois amarelos.`,
        { okLabel: 'Segundo amarelo' }
      );
      if (!ok) return;
    }
    await commit(
      A.yellowCard(state, { playerId: p.playerId }),
      temAmarelo ? `${p.name} expulso por acumulação de amarelos.` : `Amarelo para ${p.name}.`
    );
  }

  async function aplicarVermelho(p) {
    const ok = await confirmar(
      `Cartão vermelho para #${p.number} ${p.name}? Fica expulso e a equipa joga reduzida.`,
      { okLabel: 'Vermelho' }
    );
    if (!ok) return;
    await commit(A.redCard(state, { playerId: p.playerId }), `${p.name} expulso.`);
  }

  function cardItems(p, close) {
    const cartoes = playerCards(p.playerId, state.cards);
    const temAmarelo = state.cards.some((c) => c.playerId === p.playerId && c.type === CARD.YELLOW);
    return (
      <>
        <button
          className="menu__item menu__item--yellow"
          onClick={() => {
            close();
            aplicarAmarelo(p);
          }}
        >
          <span className="cardchip cardchip--yellow" />
          {temAmarelo ? 'Segundo amarelo (expulsa)' : 'Cartão amarelo'}
          {cartoes.yellows ? <span className="menu__hint">já tem {cartoes.yellows}</span> : null}
        </button>
        <button
          className="menu__item menu__item--danger"
          onClick={() => {
            close();
            aplicarVermelho(p);
          }}
        >
          <span className="cardchip cardchip--red" />
          Cartão vermelho
        </button>
      </>
    );
  }

  function courtMenu(pos, p) {
    ui.open((close) => (
      <Dialog title={`#${p.number} ${p.name}`} onClose={() => close(null)}>
        <div className="menu">
          <button
            className="menu__item"
            onClick={() => {
              close(null);
              setSel({ kind: 'court', playerId: p.playerId });
              toast('Escolha o jogador do banco que entra.', 'info');
            }}
          >
            Substituir
          </button>
          <button
            className="menu__item"
            onClick={async () => {
              close(null);
              const destino = await positionMenu(ui, state, p);
              if (destino) doMoveTo(p.playerId, destino);
            }}
          >
            Alterar posição
          </button>
          {/* A expulsão não tem entrada própria: é sempre consequência de um cartão. */}
          {cardItems(p, () => close(null))}
          <button
            className="menu__item"
            onClick={() => {
              close(null);
              stintsDialog(ui, state, p, clockMs);
            }}
          >
            Consultar períodos em campo
          </button>
        </div>
      </Dialog>
    ));
  }

  function benchMenu(p) {
    const podeEntrar =
      p.status === PLAYER_MATCH_STATUS.ON_BENCH &&
      countOnCourt(state) < MAX_ON_COURT &&
      !canReplaceExpelled(state, clockMs, penaltyMs());

    ui.open((close) => (
      <Dialog title={`#${p.number} ${p.name}`} onClose={() => close(null)}>
        <div className="menu">
          {podeEntrar ? (
            <button
              className="menu__item"
              onClick={() => {
                close(null);
                const livre = POSITIONS.find((pos) => !state.court[pos]);
                doReplacement(p.playerId, livre);
              }}
            >
              Colocar em campo (repor jogador)
            </button>
          ) : null}
          {p.status === PLAYER_MATCH_STATUS.ON_BENCH ? (
            <button
              className="menu__item"
              onClick={() => {
                close(null);
                setSel({ kind: 'bench', playerId: p.playerId });
                toast('Escolha o jogador de campo que sai.', 'info');
              }}
            >
              Substituir um jogador de campo
            </button>
          ) : null}
          {p.status === PLAYER_MATCH_STATUS.EXPELLED ? null : cardItems(p, () => close(null))}
          <button
            className="menu__item"
            onClick={() => {
              close(null);
              stintsDialog(ui, state, p, clockMs);
            }}
          >
            Consultar tempos
          </button>
        </div>
      </Dialog>
    ));
  }

  function moreMenu() {
    ui.open((close) => (
      <Dialog title="Mais ações" onClose={() => close(null)}>
        <div className="menu">
          <button
            className="menu__item"
            onClick={async () => {
              close(null);
              const livre = POSITIONS.find((pos) => !state.court[pos]);
              if (!livre) return toast('O campo já tem cinco jogadores.', 'error');
              await tapEmpty(livre);
            }}
          >
            Repor jogador (após expulsão)
          </button>
          {state.currentPeriod === 1 ? (
            <button
              className="menu__item"
              onClick={() => {
                close(null);
                finishFirst();
              }}
            >
              Terminar 1.ª parte
            </button>
          ) : (
            <button
              className="menu__item"
              onClick={() => {
                close(null);
                finishGame();
              }}
            >
              Terminar jogo
            </button>
          )}
          <button
            className="menu__item menu__item--danger"
            onClick={() => {
              close(null);
              abandon();
            }}
          >
            Abandonar jogo (terminar já)
          </button>
          <button
            className="menu__item"
            onClick={() => {
              close(null);
              router.push(`/matches/${matchId}/events?from=live`);
            }}
          >
            Histórico de ações
          </button>
        </div>
      </Dialog>
    ));
  }

  /* --------------------------------------------------- transições de parte */

  async function finishFirst() {
    const erro = V.canFinishFirstHalf(state);
    if (erro) return toast(erro, 'error');
    const ok = await confirmar(
      'Terminar a 1.ª parte? Todos os períodos em campo são encerrados e o resultado ao intervalo é guardado.',
      { okLabel: 'Terminar 1.ª parte', danger: false }
    );
    if (!ok) return;
    await commit(A.finishFirstHalf(state), 'Intervalo.', { sync: 'checkpoint' });
  }

  async function startSecondHalf(lineup) {
    const erro0 = V.validateLineup(lineup, Object.keys(state.players));
    if (erro0) return toast(erro0, 'error');
    if (!Object.values(lineup).filter(Boolean).length)
      return toast('Escolha os jogadores em campo.', 'error');
    await events.append(A.setSecondHalfLineup(state, lineup), { sync: 'defer' });
    const novo = await recarregar();
    const erro = V.canStartSecondHalf(novo.state);
    if (erro) return toast(erro, 'error');
    await events.append(A.startSecondHalf(novo.state), { sync: 'defer' });
    await recarregar();
    toast('Começou a 2.ª parte.', 'ok');
  }

  async function finishGame() {
    const erro = V.canFinishMatch(state);
    if (erro) return toast(erro, 'error');
    const ok = await confirmar('Terminar o jogo e fechar as estatísticas?', {
      okLabel: 'Terminar jogo',
      danger: false,
    });
    if (!ok) return;
    await endMatch();
  }

  async function abandon() {
    const ok = await confirmar(
      'Abandonar o jogo termina-o imediatamente, mesmo sem a segunda parte. Continuar?',
      { okLabel: 'Abandonar' }
    );
    if (!ok) return;
    await endMatch();
  }

  /**
   * Ao fechar o jogo guarda-se o total de faltas da nossa equipa na própria linha
   * do jogo. Os eventos continuam a ser a fonte de verdade — este campo é só para
   * o histórico e as exportações não terem de reconstruir tudo.
   */
  async function endMatch() {
    await events.append(A.finishMatch(state), { sync: 'checkpoint' });
    const fresco = await loadMatch(matchId);
    await matches.update(matchId, { teamFouls: foulsTotal(fresco.state, 'US') });
    router.push(`/matches/${matchId}/summary`);
  }

  /* ------------------------------------------------------------ correções */

  async function editarGolo(goal) {
    if (await GE.editGoal(ui, { matchId, goal })) await recarregar();
  }

  async function corrigirResultado() {
    if (await GE.correctScore(ui, { matchId, ourName, opponentName: rivalName }))
      await recarregar();
  }

  /* ------------------------------------------------------------- desenho */

  const on = {
    addGoal: (team) => (team === 'US' ? addTeamGoal() : addOpponentGoal()),
    removeGoal: (team) =>
      commit(A.goal(state, team === 'US' ? EVENT.TEAM_GOAL_REMOVED : EVENT.OPPONENT_GOAL_REMOVED)),
    addFoul,
    removeFoul,
    tapCourt,
    tapBench,
    tapEmpty,
    scoreFor,
    courtMenu,
    benchMenu,
    startPenalty,
  };

  // O intervalo tem ecrã próprio: sem cronómetro e sem forma de "retomar" a
  // primeira parte, que já foi encerrada. A única saída é começar a segunda.
  if (state.status === MATCH_STATUS.HALFTIME) {
    return (
      <div className="live">
        <header className="live__head live__head--halftime">
          <Scoreboard
            state={state}
            ourName={ourName}
            opponentName={rivalName}
            ourFull={club?.name || ''}
            opponentFull={match.opponentName}
            interactive={false}
            on={on}
          />
          <div className="clockbox">
            <span className="clockbox__period">INTERVALO</span>
            <span className="clockbox__time">{fmt(state.firstHalfMs || 0)}</span>
            <span className="clockbox__hint">1.ª parte terminada</span>
            <span className="pill pill--paused">PARADO</span>
          </div>
          <div className="live__controls">
            <button
              className="btn btn--ghost"
              onClick={() => router.push(`/matches/${matchId}/events?from=live`)}
            >
              Histórico
            </button>
          </div>
        </header>

        <Halftime
          state={state}
          ourName={ourName}
          opponentName={rivalName}
          onEditGoal={editarGolo}
          onCorrectScore={corrigirResultado}
          onStart={startSecondHalf}
        />
      </div>
    );
  }

  const periodLabel =
    state.currentPeriod === 1 ? '1.ª PARTE' : state.currentPeriod === 2 ? '2.ª PARTE' : '—';
  const undoable = state.lastUndoable;

  return (
    <div className="live">
      <header className="live__head">
        <Scoreboard
          state={state}
          ourName={ourName}
          opponentName={rivalName}
          ourFull={club?.name || ''}
          opponentFull={match.opponentName}
          interactive
          on={on}
        />
        <ClockBox
          state={state}
          periodDurationMs={match.periodDurationMs}
          periodLabel={periodLabel}
          running={aCorrer}
          now={now}
        />
        <div className="live__controls">
          {/* No jogo cronometrado a pausa vive no canto inferior direito, ao
              alcance do polegar; aqui em cima seria um segundo botão igual. */}
          {timing !== MATCH_TIMING.TIMED ? (
            <button
              className={`btn btn--big ${aCorrer ? 'btn--warn' : 'btn--primary'}`}
              onClick={() =>
                commit(
                  aCorrer ? A.pauseClock(state) : A.resumeClock(state),
                  aCorrer ? 'Tempo parado.' : 'Tempo retomado.'
                )
              }
            >
              {aCorrer ? 'Parar tempo' : 'Retomar tempo'}
            </button>
          ) : null}
          {state.currentPeriod === 1 ? (
            <button className="btn btn--big btn--ghost" onClick={finishFirst}>
              Terminar 1.ª parte
            </button>
          ) : (
            <button className="btn btn--big btn--ghost" onClick={finishGame}>
              Terminar jogo
            </button>
          )}
        </div>
      </header>

      <Court state={state} sel={sel} clockMs={clockMs} penaltyMs={penaltyMs()} on={on} />

      {/* Faixa própria por baixo do campo: assim a contagem não tapa jogadores. */}
      <Penalties state={state} clockMs={clockMs} penaltyMs={penaltyMs()} on={on} />

      <Bench state={state} sel={sel} clockMs={clockMs} on={on} />

      <footer className="live__bar">
        <button
          className="btn btn--ghost btn--big"
          disabled={!undoable}
          onClick={async () => {
            if (!undoable) return;
            const ok = await confirmar(
              `Desfazer "${EVENT_LABEL[undoable.eventType]}" registada aos ${fmt(
                undoable.matchElapsedMs
              )}?`,
              { okLabel: 'Desfazer', danger: false }
            );
            if (!ok) return;
            await events.markUndone(undoable.id, null, { sync: 'defer' });
            await events.append(A.undoEvent(state, undoable), { sync: 'defer' });
            setSel(null);
            await recarregar();
            toast('Ação desfeita.', 'ok');
          }}
        >
          {undoable ? `Desfazer: ${EVENT_LABEL[undoable.eventType]}` : 'Nada para desfazer'}
        </button>

        {sel ? (
          <button className="btn btn--ghost btn--big" onClick={() => setSel(null)}>
            Cancelar seleção
          </button>
        ) : null}

        <span className="live__spacer" />

        <button
          className="btn btn--ghost btn--big"
          onClick={() => router.push(`/matches/${matchId}/events?from=live`)}
        >
          Histórico
        </button>
        <button className="btn btn--ghost btn--big" onClick={moreMenu}>
          Mais ações
        </button>

        {/* Num jogo cronometrado o relógio pára e recomeça a toda a hora. Este
            botão flutua sobre o ecrã, por isso não obriga a deslizar nada. */}
        {timing === MATCH_TIMING.TIMED ? (
          <button
            className={`btn btn--big clocktoggle ${aCorrer ? 'btn--warn' : 'btn--primary'}`}
            onClick={() =>
              commit(
                aCorrer ? A.pauseClock(state) : A.resumeClock(state),
                aCorrer ? 'Tempo parado.' : 'Tempo retomado.'
              )
            }
          >
            <span className="clocktoggle__icon">{aCorrer ? '⏸' : '▶'}</span>
            <span>{aCorrer ? 'Parar tempo' : 'Retomar'}</span>
          </button>
        ) : null}
      </footer>
    </div>
  );
}
