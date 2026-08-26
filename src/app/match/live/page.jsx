'use client';

// Jogo ao vivo (secção 4.8). O ecrã que está aberto durante os 40 minutos.
//
// Regra que atravessa o ficheiro: nada aqui guarda estado do jogo. Cada toque
// grava um evento e o estado é recalculado a partir de todos os eventos. É o que
// permite desfazer, corrigir e sobreviver a um recarregamento a meio.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import { Empty } from '@/components/bits.jsx';
import { Dialog, useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import Halftime from '@/components/live/Halftime.jsx';
import { Scoreboard, ClockBox, RivalOut, Court, Bench, Penalties, clockMsOf } from '@/components/live/pieces.jsx';
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
import * as sync from '@/lib/data/sync.js';
import * as A from '@/domain/actions.js';
import * as V from '@/domain/validation.js';
import { countOnCourt, foulsInPeriod, foulsTotal } from '@/domain/reducer.js';
import { playerCards } from '@/domain/stats.js';
import { fmt, readClock } from '@/domain/clock.js';
import { openPenalties, penaltyBoard, canStartPenalty, canReplaceExpelled, PENALTY_STATUS } from '@/domain/penalties.js';
import {
  EVENT,
  MATCH_STATUS,
  MATCH_TIMING,
  MAX_ON_COURT,
  POSITIONS,
  PLAYER_MATCH_STATUS,
  CARD,
  FOUL_LIMIT,
  timingOf,
  timingConfig,
} from '@/domain/constants.js';
import { clubShort, opponentShort, mensagemErro, eventLabel } from '@/lib/format.js';
import { t } from '@/lib/i18n/index.js';
import { rotas, comOrigem } from '@/lib/routes.js';
import useEcraAceso from '@/lib/ecraAceso.js';
import useArrasto from '@/lib/arrastar.js';

const OWN_GOAL = '__OWN_GOAL__';

export default function LivePage() {
  return (
    <Pagina>
      <Live />
    </Pagina>
  );
}

function Live() {
  const { matchId } = useRouteParams();
  const router = useRouter();
  const ui = useUI();
  const { toast, confirmar } = ui;
  const { userId, user } = useAuth();

  const [carregado, setCarregado] = useState(null);
  const [club, setClub] = useState(null);
  const [sel, setSel] = useState(null); // { kind: 'court'|'bench', playerId }
  // Sanções cujo fim já foi anunciado — evita repetir o aviso a cada batimento e
  // evita anunciar sanções que já tinham terminado quando o ecrã abriu.
  const anunciadas = useRef(new Set());

  // Arrastar um jogador para cima de outro troca-os. É um atalho para o que o
  // toque já fazia em dois passos, e não um substituto: quem tem o gesto na mão
  // continua a poder tocar num e depois no outro.
  const arrasto = useArrasto((origem, destino) => largar(origem, destino));

  const state = carregado?.state || null;
  const match = carregado?.match || null;
  const aCorrer = state?.timerStatus === 'RUNNING';
  const now = useNow(250, Boolean(aCorrer));
  const clockMs = state ? clockMsOf(state, now) : 0;

  // Enquanto o jogo está aberto, o ecrã não adormece. Não é só com o cronómetro
  // a andar: o intervalo é precisamente quando se pousa o telemóvel e se fala
  // com a equipa, e voltar a encontrar a app a seguir é o que se quer evitar.
  useEcraAceso(Boolean(state) && state.status !== MATCH_STATUS.FINISHED);

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
      toast(t('acao.sancaoCumprida', { numero: p.number, nome: p.name }), 'ok', 8000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockMs, state]);

  // Preparação e jogo terminado têm ecrã próprio.
  useEffect(() => {
    if (!state) return;
    if (state.status === MATCH_STATUS.DRAFT || state.status === MATCH_STATUS.READY)
      router.replace(rotas.jogoPreparar(matchId));
    if (state.status === MATCH_STATUS.FINISHED) router.replace(rotas.jogoResumo(matchId));
  }, [state, matchId, router]);

  if (!carregado) return <p className="muted">{t('comum.aCarregar')}</p>;
  if (carregado.vazio) return <Empty>{t('jogo.naoEncontrado')}</Empty>;
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

  /**
   * Grava um evento e recalcula o jogo. Toda a mutação passa por aqui.
   *
   * Não anuncia nada. Anunciava: cada golo, cada substituição, cada falta
   * levantava uma mensagem no fundo do ecrã a dizer o que tinha acabado de
   * acontecer. Num jogo a sério são dezenas delas, e todas a repetir o que já
   * se estava a ver — o cartão mudou de sítio, o número subiu. Uma confirmação
   * que só confirma o óbvio tapa o ecrã e treina o olho a ignorar o sítio onde
   * aparecem os avisos que interessam.
   *
   * Continuam a aparecer duas coisas: os erros, e as consequências que ninguém
   * pediu — o segundo amarelo que expulsa, o golo sofrido que liberta um
   * jogador, a sanção que chegou ao fim.
   */
  async function commit(event, { sync = 'defer' } = {}) {
    await events.append(event, { sync });
    setSel(null);
    const novo = await recarregar();
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
    const st = await commit(A.teamGoalBy(state, p.playerId));
    const golo = lastTeamGoal(st);
    if (golo) await askAssist(st, golo, p.playerId);
  }

  async function addTeamGoal() {
    const st = await commit(A.goal(state, EVENT.TEAM_GOAL_ADDED));
    const golo = lastTeamGoal(st);
    if (!golo) return;

    const scorerId = await pickPlayer(ui, st, t('acao.quemMarcou'), {
      allowNone: true,
      noneLabel: t('acao.naoRegistar'),
      extra: [{ id: OWN_GOAL, label: t('golos.autogolo') }],
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
      return;
    }
    if (!scorerId) return;
    await events.append(A.attributeGoal(st, { targetEventId: golo.eventId, scorerId }), {
      sync: 'defer',
    });
    const depois = await recarregar();
    await askAssist(depois.state, golo, scorerId);
  }

  async function askAssist(st, golo, scorerId) {
    const assistId = await pickPlayer(ui, st, t('acao.quemAssistiu'), {
      exclude: scorerId,
      allowNone: true,
      noneLabel: t('golos.semAssistencia'),
    });
    if (!assistId) return;
    await events.append(A.attributeGoal(st, { targetEventId: golo.eventId, assistId }), {
      sync: 'defer',
    });
    const depois = await recarregar();
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
    toast(t('acao.goloSofridoLiberta', { numero: p.number, nome: p.name }), 'ok', 8000);
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
    const playerId = await pickPlayer(
      ui,
      st,
      nossa ? t('acao.quemFezFalta') : t('acao.quemSofreuFalta'),
      { allowNone: true, noneLabel: t('acao.naoRegistar') }
    );
    if (!playerId) return;
    await events.append(A.attributeFoul(st, { targetEventId: ultima.eventId, playerId }), {
      sync: 'defer',
    });
    const depois = await recarregar();
    const nome = depois.state.players[playerId]?.name || '—';
  }

  async function foulFor(p) {
    const st = await commit(A.foul(state, EVENT.TEAM_FOUL_ADDED));
    const n = foulsInPeriod(st, 'US');
    if (n > FOUL_LIMIT) {
      await tenMetreAlert(ui, {
        beneficia: rivalName,
        faltou: ourName,
        n,
      });
    }

    const ultima = [...st.fouls].reverse().find((f) => f.team === 'US');
    if (!ultima) return;
    await events.append(A.attributeFoul(st, { targetEventId: ultima.eventId, playerId: p.playerId }), {
      sync: 'defer',
    });
    await recarregar();
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
    if (erro) return toast(mensagemErro(erro), 'error');
    unlockAudio(); // o toque do utilizador é o que permite tocar o aviso depois
    await commit(A.startPenalty(state, { playerId, durationMs: penaltyMs() }));
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
      return toast(t('validacao.expulsoNaoVolta'), 'error');
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
    if (bloqueio) return toast(mensagemErro(bloqueio), 'error');
    const disponiveis = Object.values(state.players).filter(
      (p) => p.status === PLAYER_MATCH_STATUS.ON_BENCH
    );
    if (!disponiveis.length) return toast(t('acao.semBanco'), 'error');
    const playerId = await pickReplacement(ui, state, pos);
    if (playerId) await doReplacement(playerId, pos);
  }

  /**
   * Largar um jogador.
   *
   * Repete as decisões do toque, e não inventa nenhuma: do banco para um lugar
   * ocupado é uma substituição, do banco para um lugar vazio é uma entrada, de
   * um lugar para outro é uma troca de posição, e do campo para o banco é sair.
   * Quem valida continua a ser o `V.validate*`, como em qualquer outro caminho.
   */
  async function largar(origem, destino) {
    if (!destino) return;
    setSel(null);

    // Do campo para fora. Em cima de um suplente já diz quem entra; no espaço à
    // volta falta essa metade, e é o que a janela pergunta. Não há forma de sair
    // sem entrar ninguém — em futsal joga-se a cinco, e a única maneira de ficar
    // reduzido é uma expulsão, que tem caminho próprio.
    if (destino.tipo === 'bench') {
      if (origem.tipo !== 'court') return;
      if (destino.playerId) return doSubstitution(origem.playerId, destino.playerId, origem.pos);
      const entra = await pickReplacement(ui, state, origem.pos);
      if (entra) await doSubstitution(origem.playerId, entra, origem.pos);
      return;
    }

    if (destino.tipo !== 'court') return;

    if (origem.tipo === 'bench') {
      const ocupante = state.court[destino.pos];
      if (ocupante) return doSubstitution(ocupante, origem.playerId, destino.pos);
      return doReplacement(origem.playerId, destino.pos);
    }

    if (origem.tipo === 'court') {
      // Largar em cima de si próprio não é nada. Sem isto, um arrasto curto que
      // acabasse onde começou disparava uma troca de posição consigo mesmo.
      if (origem.pos === destino.pos) return;
      return doMoveTo(origem.playerId, destino.pos);
    }
  }

  async function doSubstitution(outId, inId, position) {
    const erro = V.validateSubstitution(state, { playerOutId: outId, playerInId: inId });
    if (erro) return toast(mensagemErro(erro), 'error');
    await commit(
      A.substitute(state, {
        playerOutId: outId,
        playerInId: inId,
        position: position || state.players[outId].position,
      }),
      t('acao.entraSai', { entra: state.players[inId].name, sai: state.players[outId].name })
    );
  }

  async function doMoveTo(playerId, toPosition) {
    const de = state.players[playerId].position;
    if (de === toPosition) return setSel(null);
    await commit(
      A.changePosition(state, { playerId, fromPosition: de, toPosition })
    );
  }

  async function doReplacement(playerInId, position) {
    const bloqueio = canReplaceExpelled(state, clockMs, penaltyMs());
    if (bloqueio) return toast(mensagemErro(bloqueio), 'error');
    const erro = V.validateReplacement(state, { playerInId, position });
    if (erro) return toast(mensagemErro(erro), 'error');
    await commit(
      A.replaceAfterExpulsion(state, { playerInId, position })
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
        t('acao.confirmaSegundoAmarelo', { numero: p.number, nome: p.name }),
        { okLabel: t('acao.segundoAmarelo') }
      );
      if (!ok) return;
    }
    await commit(A.yellowCard(state, { playerId: p.playerId }));
    if (temAmarelo) toast(t('acao.expulsoPorAmarelos', { nome: p.name }), 'ok', 8000);
  }

  async function aplicarVermelho(p) {
    const ok = await confirmar(
      t('acao.confirmaVermelho', { numero: p.number, nome: p.name }),
      { okLabel: t('acao.vermelho') }
    );
    if (!ok) return;
    await commit(A.redCard(state, { playerId: p.playerId }));
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
          {temAmarelo ? t('acao.segundoAmareloMenu') : t('acao.cartaoAmarelo')}
          {cartoes.yellows ? (
            <span className="menu__hint">{t('acao.jaTem', { n: cartoes.yellows })}</span>
          ) : null}
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
              toast(t('acao.escolhaQuemEntra'), 'info');
            }}
          >
            {t('acao.substituir')}
          </button>
          <button
            className="menu__item"
            onClick={async () => {
              close(null);
              const destino = await positionMenu(ui, state, p);
              if (destino) doMoveTo(p.playerId, destino);
            }}
          >
            {t('acao.alterarPosicao')}
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
            {t('acao.consultarPeriodos')}
          </button>
        </div>
      </Dialog>
    ));
  }

  function cardMenu(pos, p) {
    ui.open((close) => (
      <Dialog title={`#${p.number} ${p.name}`} onClose={() => close(null)}>
        <div className="menu">
          {cardItems(p, () => close(null))}
          {pos ? (
            <button
              className="menu__item"
              onClick={() => {
                close(null);
                courtMenu(pos, p);
              }}
            >
              {t('acao.maisAcoes')}
            </button>
          ) : null}
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
              {t('acao.colocarEmCampo')}
            </button>
          ) : null}
          {p.status === PLAYER_MATCH_STATUS.ON_BENCH ? (
            <button
              className="menu__item"
              onClick={() => {
                close(null);
                setSel({ kind: 'bench', playerId: p.playerId });
                toast(t('acao.escolhaQuemSai'), 'info');
              }}
            >
              {t('acao.substituirDeCampo')}
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
            {t('acao.consultarTempos')}
          </button>
        </div>
      </Dialog>
    ));
  }

  function moreMenu() {
    ui.open((close) => (
      <Dialog title={t('acao.maisAcoes')} onClose={() => close(null)}>
        <div className="menu">
          <button
            className="menu__item"
            onClick={async () => {
              close(null);
              const livre = POSITIONS.find((pos) => !state.court[pos]);
              if (!livre) return toast(t('acao.campoCheio'), 'error');
              await tapEmpty(livre);
            }}
          >
            {t('acao.reporJogador')}
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
              router.push(comOrigem(rotas.jogoHistorico(matchId), { de: 'live' }));
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
    if (erro) return toast(mensagemErro(erro), 'error');
    const ok = await confirmar(
      t('acao.confirmaTerminarPrimeira'),
      { okLabel: t('acao.terminarPrimeira'), danger: false }
    );
    if (!ok) return;
    await commit(A.finishFirstHalf(state), { sync: 'defer' });
  }

  async function startSecondHalf(lineup) {
    const erro0 = V.validateLineup(lineup, Object.keys(state.players));
    if (erro0) return toast(mensagemErro(erro0), 'error');
    if (!Object.values(lineup).filter(Boolean).length)
      return toast(t('acao.escolhaEmCampo'), 'error');
    await events.append(A.setSecondHalfLineup(state, lineup), { sync: 'defer' });
    const novo = await recarregar();
    const erro = V.canStartSecondHalf(novo.state);
    if (erro) return toast(mensagemErro(erro), 'error');
    await events.append(A.startSecondHalf(novo.state), { sync: 'defer' });
    await recarregar();
  }

  async function finishGame() {
    const erro = V.canFinishMatch(state);
    if (erro) return toast(mensagemErro(erro), 'error');
    const ok = await confirmar(t('acao.confirmaTerminarJogo'), {
      okLabel: t('acao.terminarJogo'),
      danger: false,
    });
    if (!ok) return;
    await endMatch();
  }

  async function abandon() {
    const ok = await confirmar(
      t('acao.confirmaAbandonar'),
      { okLabel: t('acao.abandonar') }
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
    await events.append(A.finishMatch(state), { sync: 'defer' });
    const fresco = await loadMatch(matchId);
    await matches.update(matchId, { teamFouls: foulsTotal(fresco.state, 'US') }, { sync: 'defer' });
    await sync.saveNow(userId, user?.email);
    router.push(rotas.jogoResumo(matchId));
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
    foulFor,
    cardMenu,
    courtMenu,
    benchMenu,
    startPenalty,
    // Acertar o relógio. O passo vem em milissegundos e pode ser negativo; o
    // reducer é que trava para não passar do zero.
    adjustClock: (deltaMs) => commit(A.adjustClock(state, deltaMs, Date.now()), { sync: 'defer' }),
    togglePowerPlay: (ligar) => commit(A.setPowerPlay(state, ligar)),
    opponentExpulsion: (delta) => commit(A.opponentExpulsion(state, delta)),
  };

  // O intervalo tem ecrã próprio: sem cronómetro e sem forma de "retomar" a
  // primeira parte, que já foi encerrada. A única saída é começar a segunda.
  if (state.status === MATCH_STATUS.HALFTIME) {
    return (
      <div className="live live--pause">
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
            <span className="clockbox__period">{t('acao.intervaloTitulo')}</span>
            <span className="clockbox__time">{fmt(state.firstHalfMs || 0)}</span>
            <span className="clockbox__hint">{t('acao.primeiraTerminada')}</span>
            <span className="pill pill--paused">{t('vivo.parado')}</span>
          </div>
          <div className="live__controls">
            <button
              className="btn btn--ghost"
              onClick={() => router.push(comOrigem(rotas.jogoHistorico(matchId), { de: 'live' }))}
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
      <header className="live__head" data-tour="live-clock">
        <Scoreboard
          state={state}
          ourName={ourName}
          opponentName={rivalName}
          ourFull={club?.name || ''}
          opponentFull={match.opponentName}
          interactive
          on={on}
          opponentExtra={<RivalOut state={state} on={on} variant="inline" />}
        />
        <ClockBox
          state={state}
          periodDurationMs={match.periodDurationMs}
          periodLabel={periodLabel}
          now={now}
          // Só no jogo cronometrado. No corrido o relógio é uma referência, não
          // uma contagem oficial, e não há paragens onde alguém se possa enganar.
          on={timing === MATCH_TIMING.TIMED ? on : null}
        />
        <RivalOut state={state} on={on} />
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
            <button className="btn btn--big btn--fecha" onClick={finishFirst}>
              Terminar 1.ª parte
            </button>
          ) : (
            <button className="btn btn--big btn--fecha" onClick={finishGame}>
              Terminar jogo
            </button>
          )}
        </div>
      </header>

      {/* Entre o marcador e o campo: a contagem da sanção decide substituições e
          não pode ficar abaixo da dobra, à espera que alguém deslize para a ver. */}
      <Penalties state={state} clockMs={clockMs} penaltyMs={penaltyMs()} on={on} />

      <div data-tour="live-court">
        <Court
          state={state}
          sel={sel}
          clockMs={clockMs}
          penaltyMs={penaltyMs()}
          on={on}
          arrasto={arrasto}
        />

        <Bench state={state} sel={sel} clockMs={clockMs} on={on} arrasto={arrasto} />
      </div>

      <footer className="live__bar">
        <button
          className="btn btn--ghost btn--big"
          disabled={!undoable}
          onClick={async () => {
            if (!undoable) return;
            const ok = await confirmar(
              t('acao.confirmaDesfazer', {
                acao: eventLabel(undoable.eventType),
                tempo: fmt(undoable.matchElapsedMs),
              }),
              { okLabel: t('acao.desfazer'), danger: false }
            );
            if (!ok) return;
            await events.markUndone(undoable.id, null, { sync: 'defer' });
            await events.append(A.undoEvent(state, undoable), { sync: 'defer' });
            setSel(null);
            await recarregar();
          }}
        >
          {undoable
            ? t('acao.desfazerRotulo', { acao: eventLabel(undoable.eventType) })
            : t('acao.nadaParaDesfazer')}
        </button>

        {sel ? (
          <button className="btn btn--ghost btn--big" onClick={() => setSel(null)}>
            {t('acao.cancelarSelecao')}
          </button>
        ) : null}

        <span className="live__spacer" />

        <button
          className="btn btn--ghost btn--big"
          onClick={() => router.push(comOrigem(rotas.jogoHistorico(matchId), { de: 'live' }))}
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
