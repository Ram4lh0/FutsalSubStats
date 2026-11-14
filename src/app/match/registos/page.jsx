'use client';

// O ecrã do papel "Registos" de um jogo com registo partilhado (add-on
// 'jogo-partilhado', ver domain/partilha.js).
//
// Quem está neste aparelho aponta tudo menos o tempo em campo: os golos (com
// marcador, assistência e tipo), as faltas, os amarelos e os registos de
// estatística que o escalão tem ligados. Não há campo, banco nem
// substituições: os convocados aparecem todos, em cartões com o número. O
// cartão vermelho é do aparelho dos Tempos, porque expulsa.
//
// Tem relógio próprio, corrido ou cronometrado como o jogo: começa-se a 1.ª
// parte, pára-se e retoma-se, termina-se a parte (o intervalo mostra o que se
// apontou até aí) e começa-se a seguinte. Cada ação fica com a parte e o
// minuto desse relógio; é com eles que a fusão a põe no jogo dos Tempos.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import { Badge, Empty } from '@/components/bits.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import useEcraAceso from '@/lib/ecraAceso.js';
import useNow from '@/lib/useNow.js';
import useRegistos from '@/lib/useRegistos.js';
import useAddons from '@/lib/useAddons.js';
import useAcoesRegistos from '@/components/registos/useAcoesRegistos.js';
import { colunasRegistos } from '@/components/registos/BarraRegistos.jsx';
import PainelRegistos from '@/components/registos/PainelRegistos.jsx';
import FaixaPartilhado from '@/components/partilhado/FaixaPartilhado.jsx';
import { opponentYellowCardDialog, pickGoalType, pickPlayer } from '@/components/live/dialogs.jsx';
import { clubs, competitions, events, loadMatch } from '@/lib/data/repository.js';
import * as sync from '@/lib/data/sync.js';
import { jogoSincronizado, reabrirRegistos, terminarRegistos } from '@/lib/partilhado.js';
import * as A from '@/domain/actions.js';
import { fmt } from '@/domain/clock.js';
import { CARD, DESEMPATE, EVENT, FOUL_LIMIT, PLAYER_MATCH_STATUS, desempateOf, goalTypesFor } from '@/domain/constants.js';
import {
  MAX_PARTES,
  PAPEL,
  RELOGIO,
  lerPartilha,
  metadataDoRelogio,
  relogioDosRegistos,
} from '@/domain/partilha.js';
import { foulsInPeriod } from '@/domain/reducer.js';
import {
  A_BALIZA,
  REGISTO,
  RESULTADO_ACAO,
  RESULTADO_REMATE,
  contagemPorJogador,
  registar,
  registosDoJogo,
} from '@/domain/registos.js';
import { clubShort, dateLabel, eventLabel, opponentShort } from '@/lib/format.js';
import { rotas, comOrigem } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';

const OWN_GOAL = '__OWN_GOAL__';

/** O que se aponta neste ecrã e fica com a parte e o minuto do relógio. */
const COM_TEMPO = new Set([
  EVENT.STAT_RECORDED,
  EVENT.TEAM_GOAL_ADDED,
  EVENT.OPPONENT_GOAL_ADDED,
  EVENT.TEAM_FOUL_ADDED,
  EVENT.OPPONENT_FOUL_ADDED,
  EVENT.YELLOW_CARD,
  EVENT.RED_CARD,
  EVENT.OPPONENT_YELLOW_CARD,
]);

/** Faltas e cartões leem a parte do `metadata` (o jogo dos Registos não tem períodos próprios). */
const PARTE_NO_METADATA = new Set([
  EVENT.TEAM_FOUL_ADDED,
  EVENT.OPPONENT_FOUL_ADDED,
  EVENT.YELLOW_CARD,
  EVENT.RED_CARD,
  EVENT.OPPONENT_YELLOW_CARD,
]);

export default function RegistosPage() {
  return (
    <Pagina>
      <Registos />
    </Pagina>
  );
}

/**
 * O estado com todos os convocados "em campo". Neste papel não há campo, mas
 * as perguntas "quem marcou?" e "quem rematou?" escolhem entre quem está em
 * campo: assim escolhem entre todos.
 */
function comTodosDisponiveis(state) {
  if (!state) return state;
  const players = {};
  for (const [id, p] of Object.entries(state.players || {})) {
    players[id] = { ...p, status: PLAYER_MATCH_STATUS.ON_COURT };
  }
  return { ...state, players };
}

function Registos() {
  const t = useT();
  const { matchId } = useRouteParams();
  const router = useRouter();
  const ui = useUI();
  const { userId, user } = useAuth();

  const [carregado, setCarregado] = useState(null);
  const [club, setClub] = useState(null);
  // A competição diz se há prolongamento: sem ele, a 2.ª parte só acaba com
  // "Terminar jogo".
  const [competicao, setCompeticao] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  // Os eventos mais recentes, para o relógio se ler a meio de uma sequência
  // de gravações (golo, assistência, tipo) sem esperar pelo desenho seguinte.
  const eventosAgora = useRef([]);

  const recarregar = useCallback(async () => {
    const novo = await loadMatch(matchId);
    eventosAgora.current = novo?.events || [];
    setCarregado(novo || { vazio: true });
    return novo;
  }, [matchId]);

  useEffect(() => {
    (async () => {
      const novo = await recarregar();
      if (novo) setClub(await clubs.get(novo.match.clubId));
      if (novo?.match?.competitionId) setCompeticao(await competitions.get(novo.match.competitionId));
    })();
  }, [recarregar]);

  const match = carregado?.match || null;
  const state = useMemo(() => comTodosDisponiveis(carregado?.state || null), [carregado]);
  const partilha = useMemo(() => lerPartilha(carregado?.events), [carregado]);
  const terminado = partilha.terminadoEm != null;
  const aRegistar = Boolean(state) && partilha.papel === PAPEL.REGISTOS && !terminado;

  // O relógio deste aparelho. Só bate enquanto se regista.
  const aCorrer = aRegistar && relogioDosRegistos(carregado?.events).aCorrer;
  const now = useNow(aCorrer ? 250 : 1000, aRegistar);
  const relogio = useMemo(() => relogioDosRegistos(carregado?.events, now), [carregado, now]);

  const ligados = useRegistos(match?.teamId);
  const addons = useAddons(match?.teamId);
  const ourName = clubShort(club);
  const rivalName = match ? opponentShort(match) : '';

  // Opção do escalão (pedido do Elétrico FC): em vez do botão "Remate", que
  // pergunta o que aconteceu, dois botões que já o dizem — "Remate enquadrado"
  // e "Remate fora" — e só se pergunta a zona.
  const doisRemates = ligados.has(REGISTO.REMATE) && Boolean(ligados.opcoes?.remate?.enquadrado);

  const registos = useAcoesRegistos({
    state,
    ligados,
    commit: (ev) => commit(ev),
    marcarGolo: (p, opcoes) => golo(p, opcoes),
    marcarGoloAdversario: (opcoes) => goloDeles(opcoes),
    nomes: () => ({ nos: ourName, eles: rivalName }),
  });
  const on = registos.on;

  // Enquanto se regista, o ecrã não adormece.
  useEcraAceso(aRegistar);

  // Em jogo, sem a barra lateral (como no jogo ao vivo).
  useEffect(() => {
    if (!aRegistar) return undefined;
    const el = document.getElementById('app');
    el?.classList.add('is-registos');
    return () => el?.classList.remove('is-registos');
  }, [aRegistar]);

  // Um jogo que não é deste papel tem os seus ecrãs de sempre.
  useEffect(() => {
    if (!carregado || carregado.vazio) return;
    if (partilha.papel !== PAPEL.REGISTOS) router.replace(rotas.jogoPreparar(matchId));
  }, [carregado, partilha.papel, matchId, router]);

  if (!carregado) return <p className="muted">{t('comum.aCarregar')}</p>;
  if (carregado.vazio) return <Empty>{t('jogo.naoEncontrado')}</Empty>;
  if (partilha.papel !== PAPEL.REGISTOS) return null;

  /* ------------------------------------------------------------ gravar */

  /** Põe no evento a parte e o minuto do relógio deste aparelho. */
  function comTempo(ev) {
    if (!COM_TEMPO.has(ev.eventType)) return ev;
    const r = relogioDosRegistos(eventosAgora.current, ev.createdAt || Date.now());
    if (!r.parte) return ev;
    return {
      ...ev,
      period: r.parte,
      matchElapsedMs: r.matchMs,
      periodElapsedMs: r.periodMs,
      metadata: PARTE_NO_METADATA.has(ev.eventType) ? { ...(ev.metadata || {}), period: r.parte } : ev.metadata,
    };
  }

  /** Grava um evento e recalcula. Toda a escrita deste ecrã passa por aqui. */
  async function commit(ev) {
    await events.append(comTempo(ev), { sync: 'defer' });
    const novo = await recarregar();
    return comTodosDisponiveis(novo?.state);
  }

  /* ------------------------------------------------------------ relógio */

  const nomeDaParte = (n) => t(`partilhado.relogio.parte${n}`);

  async function tocarRelogio(acao, parte = relogio.parte) {
    const agora = Date.now();
    const r = relogioDosRegistos(eventosAgora.current, agora);
    await events.append(
      A.correction(
        state,
        metadataDoRelogio(acao, { parte, ms: acao === RELOGIO.INICIO ? 0 : r.periodMs, hora: agora }),
        agora
      ),
      { sync: 'defer' }
    );
    await recarregar();
  }

  async function terminarParte() {
    const ok = await ui.confirmar(t('partilhado.relogio.terminarPergunta', { parte: nomeDaParte(relogio.parte) }), {
      okLabel: t('partilhado.relogio.terminar', { parte: nomeDaParte(relogio.parte) }),
      danger: false,
    });
    if (ok) await tocarRelogio(RELOGIO.FIM);
  }

  /* -------------------------------------------------------------- golos */

  const ultimoGolo = (st, team) => [...(st?.goals || [])].reverse().find((g) => g.team === team) || null;

  async function tipoDoGolo(st, g, team) {
    const tipo = await pickGoalType(
      ui,
      team === 'THEM' ? t('acao.comoFoiOGoloSofrido') : t('acao.comoFoiOGolo'),
      goalTypesFor(team, { ressalto: addons.has('golo-ressalto') })
    );
    if (tipo === undefined) return;
    await commit(A.attributeGoal(st, { targetEventId: g.eventId, howScored: tipo }));
  }

  /**
   * Golo nosso, com o marcador já sabido (`p` a null: sem marcador). A seguir
   * pergunta-se a assistência e como foi. `comRemate`, `tipo` e `base` vêm dos
   * registos (remate, penálti ou livre de 10 m que deu golo), como no jogo ao
   * vivo.
   */
  async function golo(p, { comRemate = null, tipo = null, base = null } = {}) {
    const de = base || state;
    let st = await commit(p ? A.teamGoalBy(de, p.playerId) : A.goal(de, EVENT.TEAM_GOAL_ADDED));
    const g = ultimoGolo(st, 'US');
    if (!g) return;
    // Com os dois botões de remate (enquadrado / fora), o golo conta sozinho
    // como remate enquadrado de quem marcou: não há botão "remate com golo".
    const remate =
      comRemate ||
      (tipo
        ? null
        : registos.remateDoGolo('US', p?.playerId) ||
          (doisRemates && p
            ? (s, goloEventId) =>
                registar(s, { registo: REGISTO.REMATE, playerId: p.playerId, resultado: RESULTADO_REMATE.GOLO, goloEventId })
            : null));
    if (remate) st = (await commit(remate(st, g.eventId))) || st;
    if (tipo) {
      await commit(A.attributeGoal(st, { targetEventId: g.eventId, howScored: tipo }));
      return;
    }
    if (p) {
      const assistId = await pickPlayer(ui, st, t('acao.quemAssistiu'), {
        exclude: p.playerId,
        allowNone: true,
        noneLabel: t('golos.semAssistencia'),
      });
      if (assistId === undefined) return;
      if (assistId) st = (await commit(A.attributeGoal(st, { targetEventId: g.eventId, assistId }))) || st;
    }
    await tipoDoGolo(st, g, 'US');
  }

  /** O "+ Golo" do marcador: primeiro quem marcou. Fechar a pergunta não grava nada. */
  async function goloNosso() {
    const scorerId = await pickPlayer(ui, state, t('acao.quemMarcou'), {
      allowNone: true,
      noneLabel: t('acao.naoRegistar'),
      extra: [{ id: OWN_GOAL, label: t('golos.autogolo') }],
    });
    if (scorerId === undefined) return;
    if (scorerId === OWN_GOAL) {
      let st = await commit(A.goal(state, EVENT.TEAM_GOAL_ADDED));
      const g = ultimoGolo(st, 'US');
      if (!g) return;
      st = (await commit(A.attributeGoal(st, { targetEventId: g.eventId, scorerId: null, ownGoal: true }))) || st;
      await tipoDoGolo(st, g, 'US');
      return;
    }
    await golo(scorerId ? state.players[scorerId] : null);
  }

  async function goloDeles({ comRemate = null, tipo = null, base = null } = {}) {
    const de = base || state;
    let st = await commit(A.goal(de, EVENT.OPPONENT_GOAL_ADDED));
    const g = ultimoGolo(st, 'THEM');
    if (!g) return;
    const remate = comRemate || (tipo ? null : registos.remateDoGolo('THEM'));
    if (remate) st = (await commit(remate(st, g.eventId))) || st;
    if (tipo) {
      await commit(A.attributeGoal(st, { targetEventId: g.eventId, howScored: tipo }));
      return;
    }
    await tipoDoGolo(st, g, 'THEM');
  }

  /* ------------------------------------------------------------- faltas */

  /**
   * Uma falta. Nossa: quem a fez (`p`, ou pergunta-se). Deles: quem a sofreu.
   * Da 6.ª falta da parte em diante vem o livre de 10 metros, como no jogo ao
   * vivo — precisa do relógio a contar, que é ele que diz em que parte se está.
   */
  async function falta(team, p = null) {
    let st = await commit(A.foul(state, team === 'US' ? EVENT.TEAM_FOUL_ADDED : EVENT.OPPONENT_FOUL_ADDED));
    const ultima = [...(st?.fouls || [])].reverse().find((f) => f.team === team);
    if (!ultima) return;
    let playerId = p?.playerId || null;
    if (!p) {
      playerId = await pickPlayer(ui, st, team === 'US' ? t('acao.quemFezFalta') : t('acao.quemSofreuFalta'), {
        allowNone: true,
        noneLabel: t('acao.naoRegistar'),
      });
    }
    if (playerId) st = (await commit(A.attributeFoul(st, { targetEventId: ultima.eventId, playerId }))) || st;
    const parte = relogioDosRegistos(eventosAgora.current).parte;
    const n = parte ? foulsInPeriod(st, team, parte) : 0;
    if (n > FOUL_LIMIT) await registos.perguntarLivre10(st, { equipa: team === 'US' ? 'THEM' : 'US', n });
  }

  /* ------------------------------------------------------------ cartões */

  /**
   * Amarelo a um jogador nosso. Fica apontado sem expulsar ninguém: num
   * segundo amarelo, a expulsão marca-se no aparelho dos Tempos.
   */
  async function amarelo(p) {
    const jaTem = (state.cards || []).some((c) => c.playerId === p.playerId && c.type === CARD.YELLOW);
    await commit(A.lateCard(state, { type: CARD.YELLOW, playerId: p.playerId, matchElapsedMs: 0, period: 0 }));
    if (jaTem) ui.toast(t('partilhado.registos.segundoAmarelo', { numero: p.number, nome: p.name }), 'error', 7000);
  }

  async function amareloDeles() {
    const numero = await opponentYellowCardDialog(ui, state);
    if (!numero) return;
    await commit(A.lateOpponentYellow(state, { number: numero, matchElapsedMs: 0, period: 0 }));
  }

  /* ------------------------------------------------------ desfazer e fim */

  const ultimo = [...(state.events || [])].reverse().find((e) => COM_TEMPO.has(e.eventType)) || null;

  /**
   * Desfaz a última ação. Um remate que deu golo sai com o seu golo, e um golo
   * leva consigo o remate que lhe estava preso.
   */
  async function desfazerUltimo() {
    if (ultimo) await tirarEvento(ultimo);
  }

  /**
   * Tira uma ação já gravada (o "−" do marcador e dos cartões, e o DESFAZER).
   * Um remate que deu golo sai com o seu golo, e um golo leva consigo o remate
   * que lhe estava preso.
   */
  async function tirarEvento(ev) {
    if (!ev || ocupado) return;
    setOcupado(true);
    try {
      const alvos = new Map(registos.alvosDoDesfazer(ev).map((e) => [e.id, e]));
      for (const e of state.events || []) {
        if (e.eventType === EVENT.STAT_RECORDED && e.metadata?.goloEventId && alvos.has(e.metadata.goloEventId)) {
          alvos.set(e.id, e);
        }
      }
      for (const e of alvos.values()) {
        await events.markUndone(e.id, null, { sync: 'defer' });
        await events.append(A.undoEvent(state, e), { sync: 'defer' });
      }
      await recarregar();
      ui.toast(t('partilhado.registos.desfeito', { registo: eventLabel(ev.eventType, ev, state.players) }), 'ok');
    } finally {
      setOcupado(false);
    }
  }

  /** O evento do último elemento de uma lista do estado (golos, faltas, cartões, registos). */
  const eventoDoUltimo = (itens) => {
    const ult = itens[itens.length - 1];
    return ult ? (state.events || []).find((e) => e.id === ult.eventId) || null : null;
  };

  /** Tira o último registo que cumpre `filtro`; um remate que deu golo tira-se pelo golo. */
  function tirarRegisto(filtro) {
    const meus = lista.filter(filtro);
    if (!meus.length) return;
    const semGolo = meus.filter((r) => r.resultado !== RESULTADO_REMATE.GOLO);
    if (!semGolo.length) {
      ui.toast(t('registos.tirarPeloGolo'), 'error');
      return;
    }
    tirarEvento(eventoDoUltimo(semGolo));
  }

  /**
   * Terminar o jogo: fecha a parte que estiver aberta, marca o jogo como
   * terminado e manda-o já para o servidor. Sem rede fica guardado aqui e
   * avisa-se: só se pode juntar depois de subir.
   */
  async function terminar() {
    if (ocupado) return;
    const ok = await ui.confirmar(t('partilhado.registos.terminarPergunta'), {
      okLabel: t('acao.terminarJogo'),
      danger: false,
    });
    if (!ok) return;
    setOcupado(true);
    try {
      const r = relogioDosRegistos(eventosAgora.current);
      if (r.parte && !r.emPausa) await tocarRelogio(RELOGIO.FIM, r.parte);
      await terminarRegistos(matchId);
      await recarregar();
      await sync.saveNow(userId, user?.email);
      if (!(await jogoSincronizado(matchId))) ui.toast(t('partilhado.faixa.porSincronizar'), 'error', 6000);
      else ui.toast(t('partilhado.sincronizou'), 'ok');
      await recarregar();
    } finally {
      setOcupado(false);
    }
  }

  async function reabrir() {
    if (ocupado) return;
    setOcupado(true);
    try {
      await reabrirRegistos(matchId);
      await recarregar();
    } finally {
      setOcupado(false);
    }
  }

  /** Depois de juntar, o jogo que fica é o dos Tempos: abre-se o resumo dele. */
  function depoisDeJuntar({ baseId, juntou }) {
    if (juntou && baseId && baseId !== matchId) {
      router.push(comOrigem(rotas.jogoResumo(baseId), { atras: rotas.jogos(match.clubId, match.teamId) }));
      return;
    }
    recarregar();
  }

  /* ------------------------------------------------------------ o que há */

  const jogadores = Object.values(state.players).sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  const contagem = contagemPorJogador(state);
  const lista = registosDoJogo(state);
  const golosDe = (id) => (state.goals || []).filter((g) => g.team === 'US' && g.scorerId === id).length;
  const faltasDe = (id) => (state.fouls || []).filter((f) => f.team === 'US' && f.playerId === id).length;
  const amarelosDe = (id) => (state.cards || []).filter((c) => c.playerId === id && c.type === CARD.YELLOW).length;
  const faltasDaParte = (team) =>
    relogio.parte ? foulsInPeriod(state, team, relogio.parte) : (state.fouls || []).filter((f) => f.team === team).length;
  const acoes =
    lista.length + (state.goals || []).length + (state.fouls || []).length + (state.cards || []).length + (state.opponentCards || []).length;
  // Os registos do guarda-redes vão para quem é guarda-redes no plantel; se
  // ninguém o for, para todos, para não ficarem sem botão.
  const haGR = jogadores.some((p) => p.preferredPosition === 'GOALKEEPER');
  const eGR = (p) => !haGR || p.preferredPosition === 'GOALKEEPER';

  /**
   * Os botões de um cartão: golo, falta e os registos ligados no escalão.
   * Cada um é "− n +": o "+" aponta, o "−" tira o último desse jogador.
   */
  function botoesDe(p) {
    const id = p.playerId;
    const c = contagem.get(id) || {};
    const dele = (registo, extra = () => true) => (r) => r.registo === registo && r.playerId === id && extra(r);
    const b = [
      {
        classe: 'golo',
        rotulo: t('partilhado.registos.golo'),
        n: golosDe(id),
        mais: () => golo(p),
        menos: () => tirarEvento(eventoDoUltimo((state.goals || []).filter((g) => g.team === 'US' && g.scorerId === id))),
      },
      {
        classe: 'falta',
        rotulo: t('partilhado.registos.falta'),
        n: faltasDe(id),
        mais: () => falta('US', p),
        menos: () => tirarEvento(eventoDoUltimo((state.fouls || []).filter((f) => f.team === 'US' && f.playerId === id))),
      },
    ];
    const reg = (classe, rotulo, n, mais, filtro) => b.push({ classe, rotulo, n, mais, menos: () => tirarRegisto(filtro) });
    if (doisRemates) {
      const meus = lista.filter(dele(REGISTO.REMATE));
      reg(
        'enquadrado',
        t('partilhado.registos.remateEnquadrado'),
        meus.filter((r) => A_BALIZA.has(r.resultado)).length,
        () => on.registarRemateCom(p, RESULTADO_REMATE.DEFENDIDO, t('partilhado.registos.remateEnquadradoDe', { numero: p.number, nome: p.name })),
        dele(REGISTO.REMATE, (r) => A_BALIZA.has(r.resultado))
      );
      reg(
        'fora',
        t('partilhado.registos.remateFora'),
        meus.filter((r) => r.resultado === RESULTADO_REMATE.FORA).length,
        () => on.registarRemateCom(p, RESULTADO_REMATE.FORA, t('partilhado.registos.remateForaDe', { numero: p.number, nome: p.name })),
        dele(REGISTO.REMATE, (r) => r.resultado === RESULTADO_REMATE.FORA)
      );
    } else if (ligados.has(REGISTO.REMATE)) {
      reg('remate', t('registos.nome.remate'), c.remate, () => on.registarRemate(p), dele(REGISTO.REMATE));
    }
    if (ligados.has(REGISTO.RECUPERACAO)) {
      reg('recup', t('registos.nome.recuperacao'), c.recuperacao, () => on.registarRecuperacao(p), dele(REGISTO.RECUPERACAO));
    }
    if (ligados.has(REGISTO.PERDA_BOLA)) {
      reg('perda', t('registos.nome.perda_bola'), c.perda_bola, () => on.registarPerda(p), dele(REGISTO.PERDA_BOLA));
    }
    if (ligados.has(REGISTO.PASSE_FALHADO)) {
      reg('passe', t('registos.nome.passe_falhado'), c.passe_falhado, () => on.registarPasse(p), dele(REGISTO.PASSE_FALHADO));
    }
    if (eGR(p) && ligados.has(REGISTO.DEFESA_GR)) {
      reg('defesa', t('registos.nome.defesa_gr'), c.defesa_gr, () => on.registarDefesa(p), dele(REGISTO.DEFESA_GR));
    }
    if (eGR(p) && ligados.has(REGISTO.LANCAMENTO_GR)) {
      reg('lanc', t('registos.nome.lancamento_gr'), c.lancamento_gr, () => on.registarLancamentoGR(p), dele(REGISTO.LANCAMENTO_GR));
    }
    if (ligados.has(REGISTO.ACAO)) {
      reg('positiva', t('registos.acaoPositiva'), c.positivas, () => on.registarAcao(p, RESULTADO_ACAO.POSITIVA),
        dele(REGISTO.ACAO, (r) => r.resultado === RESULTADO_ACAO.POSITIVA));
      reg('negativa', t('registos.acaoNegativa'), c.negativas, () => on.registarAcao(p, RESULTADO_ACAO.NEGATIVA),
        dele(REGISTO.ACAO, (r) => r.resultado === RESULTADO_ACAO.NEGATIVA));
    }
    return b;
  }

  /** Um contador "− n +". O "−" fica apagado sem nada para tirar. */
  const passo = ({ classe, rotulo, n, mais, menos }, base = 'regpasso') => (
    <div key={classe} className={`${base} ${base}--${classe}`}>
      <button
        type="button"
        className={`${base}__menos`}
        onClick={menos}
        disabled={!n || ocupado}
        aria-label={`− ${rotulo}`}
      >
        −
      </button>
      <button type="button" className={`${base}__meio`} onClick={mais}>
        <span className={`${base}__rot`}>{rotulo}</span>
        <b className={`${base}__n`}>{n || 0}</b>
      </button>
      <button type="button" className={`${base}__mais`} onClick={mais} aria-label={rotulo}>
        +
      </button>
    </div>
  );

  /** O resultado de uma equipa entre o "−" (tira o último golo) e o "+" (golo). */
  const golosDaEquipa = (team, n, mais) => (
    <div className="regplacar__golo">
      <button
        type="button"
        className="regplacar__menos"
        onClick={() => tirarEvento(eventoDoUltimo((state.goals || []).filter((g) => g.team === team)))}
        disabled={!n || ocupado}
        aria-label={`− ${t('partilhado.registos.golo')}`}
      >
        −
      </button>
      <strong className="regplacar__golos">{n}</strong>
      <button type="button" className="regplacar__mais" onClick={mais} aria-label={`+ ${t('partilhado.registos.golo')}`}>
        +
      </button>
    </div>
  );

  /** As faltas da parte de uma equipa: o "−" tira a última dessa parte. */
  const faltaDaEquipa = (team) => ({
    classe: 'falta',
    rotulo: t('partilhado.registos.falta'),
    n: faltasDaParte(team),
    mais: () => falta(team),
    menos: () =>
      tirarEvento(
        eventoDoUltimo((state.fouls || []).filter((f) => f.team === team && (!relogio.parte || f.period === relogio.parte)))
      ),
  });

  // Os contadores de equipa que se somam por aqui (cantos, remates deles, …):
  // vão para o lado de cada equipa no marcador, em vez de uma barra à parte.
  const { colunas } = colunasRegistos(state, ligados, doisRemates ? { ...on, registarRemateBarra: null } : on);
  const daEquipa = (equipa) =>
    colunas
      .filter((col) => col[equipa]?.mais)
      .map((col) => {
        const c = col[equipa];
        return {
          classe: `eq-${col.id}`,
          rotulo: t(`registos.barra.${col.id}`),
          n: c.valor,
          mais: c.mais,
          menos: () => on.tirarUltimo(c.registo, c.equipa),
        };
      });

  /** O que já se apontou, em poucas linhas: golos, faltas e cartões. */
  const nomeDe = (id) => {
    const p = id ? state.players[id] : null;
    return p ? `#${p.number} ${p.name}` : null;
  };
  const resumo = (
    <div className="regresumo">
      <p className="regresumo__placar">
        {ourName} <strong>{state.teamScore} — {state.opponentScore}</strong> {rivalName}
      </p>
      {(state.goals || []).length ? (
        <ul className="regresumo__lista">
          {state.goals.map((g) => {
            const ev = state.events.find((e) => e.id === g.eventId);
            return (
              <li key={g.eventId}>
                <span className="mono">{ev?.period ? `${nomeDaParte(ev.period)} · ${fmt(ev.periodElapsedMs)}` : '—'}</span>
                <span>
                  {g.team === 'US'
                    ? `${ourName}${g.ownGoal ? ` · ${t('golos.autogolo')}` : nomeDe(g.scorerId) ? ` · ${nomeDe(g.scorerId)}` : ''}`
                    : rivalName}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <p className="muted">
        {t('partilhado.registos.resumoLinha', {
          faltasNos: (state.fouls || []).filter((f) => f.team === 'US').length,
          faltasEles: (state.fouls || []).filter((f) => f.team === 'THEM').length,
          amarelos: (state.cards || []).length,
          amarelosEles: (state.opponentCards || []).length,
          registos: lista.length,
        })}
      </p>
    </div>
  );

  // Em jogo, o ecrã é como o do jogo: sem barra lateral e sem título, só uma
  // linha fina para sair e os estados, para o marcador ficar bem no topo.
  const topoFino = (
    <div className="regtopo">
      <button
        type="button"
        className="btn btn--ghost btn--tiny"
        onClick={() => router.push(rotas.jogos(match.clubId, match.teamId))}
      >
        ‹
      </button>
      <div className="summary-actions">
        <Badge kind="partilha">{t('partilhado.papel.REGISTOS')}</Badge>
        <Badge kind="live">{t('partilhado.aRegistar')}</Badge>
        {ligados.size ? (
          <button type="button" className="regtopo__stats" onClick={on.verRegistos}>
            {t('registos.estatisticas')}
          </button>
        ) : null}
      </div>
    </div>
  );

  const cabecalho = (
    <PageHead
      title={`${ourName} — ${rivalName}`}
      subtitle={[t('jogo.vs', { adversario: match.opponentName }), dateLabel(match.scheduledAt)].join(' · ')}
      backTo={rotas.jogos(match.clubId, match.teamId)}
      actions={
        <div className="summary-actions">
          <Badge kind="partilha">{t('partilhado.papel.REGISTOS')}</Badge>
          <Badge kind={terminado ? 'ok' : 'live'}>
            {terminado ? t('estado.FINISHED') : t('partilhado.aRegistar')}
          </Badge>
          {terminado && !partilha.fundidoEm ? (
            <button type="button" className="btn btn--ghost" onClick={reabrir} disabled={ocupado}>
              {t('partilhado.registos.voltarARegistar')}
            </button>
          ) : null}
        </div>
      }
    />
  );

  // Fundido: o jogo que conta é o dos Tempos. Este fica guardado, só para ver.
  if (partilha.fundidoEm) {
    return (
      <>
        {cabecalho}
        <section className="faixa-partilha">
          <div className="faixa-partilha__info">
            <Badge kind="partilha">{t('partilhado.juntado')}</Badge>
            <span>{t('partilhado.registos.fundido')}</span>
          </div>
          <div className="faixa-partilha__acoes">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => router.push(rotas.jogoResumo(partilha.fundidoEm.jogo))}
            >
              {t('partilhado.registos.abrirJogo')}
            </button>
          </div>
        </section>
        <div className="card">
          {resumo}
          {lista.length ? <PainelRegistos state={state} ourName={ourName} opponentName={rivalName} /> : null}
        </div>
      </>
    );
  }

  if (terminado) {
    return (
      <>
        {cabecalho}
        <FaixaPartilhado matchId={matchId} events={carregado.events} state={carregado.state} aoMudar={depoisDeJuntar} />
        <div className="card">
          {resumo}
          {lista.length ? <PainelRegistos state={state} ourName={ourName} opponentName={rivalName} /> : null}
        </div>
      </>
    );
  }

  const comProlongamento = desempateOf(competicao) === DESEMPATE.PROLONGAMENTO;
  // Sem prolongamento na competição, a 2.ª parte é a última.
  const ultimaParte = comProlongamento ? MAX_PARTES : 2;
  const seguinte = relogio.parte < ultimaParte ? relogio.parte + 1 : null;
  const noFimDeUmaParte = relogio.parte > 0 && relogio.emPausa;

  return (
    <>
      {topoFino}

      <section className="regplacar" aria-label={t('partilhado.registos.marcador')}>
        <div className="regplacar__lado">
          <span className="regplacar__nome">{ourName}</span>
          {golosDaEquipa('US', state.teamScore, goloNosso)}
          <div className="regplacar__passos">
            {passo(faltaDaEquipa('US'), 'regpasso')}
            {daEquipa('US').map((x) => passo(x, 'regpasso'))}
          </div>
        </div>

        <div className="regplacar__relogio">
          <span className="regplacar__parte">
            {relogio.parte === 0
              ? t('partilhado.relogio.porComecar')
              : noFimDeUmaParte
                ? t('partilhado.relogio.fimDe', { parte: nomeDaParte(relogio.parte) })
                : nomeDaParte(relogio.parte)}
          </span>
          <strong className={`regplacar__tempo ${relogio.aCorrer ? 'is-a-correr' : ''}`}>{fmt(relogio.periodMs)}</strong>
          <span className="muted small">
            {t('partilhado.relogio.total', { tempo: fmt(relogio.matchMs), parte: fmt(match.periodDurationMs) })}
          </span>
          <div className="regplacar__botoes regplacar__botoes--relogio">
            {relogio.parte === 0 ? (
              <button type="button" className="btn btn--primary" onClick={() => tocarRelogio(RELOGIO.INICIO, 1)}>
                {t('partilhado.relogio.comecar', { parte: nomeDaParte(1) })}
              </button>
            ) : noFimDeUmaParte ? (
              <>
                {seguinte ? (
                  <button
                    type="button"
                    className={`btn ${relogio.parte >= 2 ? 'btn--ghost' : 'btn--primary'}`}
                    onClick={() => tocarRelogio(RELOGIO.INICIO, seguinte)}
                  >
                    {t('partilhado.relogio.comecar', { parte: nomeDaParte(seguinte) })}
                  </button>
                ) : null}
                {relogio.parte >= 2 ? (
                  <button type="button" className="btn btn--primary" onClick={terminar} disabled={ocupado}>
                    {t('acao.terminarJogo')}
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`btn ${relogio.aCorrer ? 'btn--warn' : 'btn--primary'}`}
                  onClick={() => tocarRelogio(relogio.aCorrer ? RELOGIO.PAUSA : RELOGIO.RETOMA)}
                >
                  {relogio.aCorrer ? t('vivo.pararTempo') : t('vivo.retomarTempo')}
                </button>
                {relogio.parte < 2 || comProlongamento ? (
                  <button type="button" className="btn btn--ghost" onClick={terminarParte}>
                    {t('partilhado.relogio.terminar', { parte: nomeDaParte(relogio.parte) })}
                  </button>
                ) : null}
                {relogio.parte >= 2 ? (
                  <button type="button" className="btn btn--ghost" onClick={terminar} disabled={ocupado}>
                    {t('acao.terminarJogo')}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="regplacar__lado regplacar__lado--deles">
          <span className="regplacar__nome">{rivalName}</span>
          {golosDaEquipa('THEM', state.opponentScore, () => goloDeles())}
          <div className="regplacar__passos">
            {passo(faltaDaEquipa('THEM'), 'regpasso')}
            {passo(
              {
                classe: 'amarelo',
                rotulo: t('partilhado.registos.amarelo'),
                n: (state.opponentCards || []).length,
                mais: amareloDeles,
                menos: () => tirarEvento(eventoDoUltimo(state.opponentCards || [])),
              },
              'regpasso'
            )}
            {daEquipa('THEM').map((x) => passo(x, 'regpasso'))}
          </div>
        </div>
      </section>

      {relogio.parte === 0 ? <p className="regaviso">{t('partilhado.relogio.aviso')}</p> : null}

      {/* No fim de uma parte: o que se apontou até aqui, antes de continuar. */}
      {noFimDeUmaParte ? (
        <div className="card">
          <h2 className="section section--tight">
            {t('partilhado.relogio.ateAqui', { parte: nomeDaParte(relogio.parte) })}
          </h2>
          {resumo}
          {lista.length ? <PainelRegistos state={state} ourName={ourName} opponentName={rivalName} /> : null}
        </div>
      ) : null}

      <div className="regcards">
        {jogadores.map((p) => {
          const amarelos = amarelosDe(p.playerId);
          return (
            <article
              key={p.playerId}
              className={`regcard ${amarelos ? 'is-amarelo' : ''} ${amarelos >= 2 ? 'is-dois-amarelos' : ''}`}
            >
              <header className="regcard__quem">
                <span className="regcard__num">{p.number}</span>
                <span className="regcard__nome">{p.name}</span>
                {amarelos ? (
                  <button
                    type="button"
                    className="regcard__tiraramarelo"
                    disabled={ocupado}
                    aria-label={`− ${t('partilhado.registos.amarelo')}`}
                    title={`− ${t('partilhado.registos.amarelo')}`}
                    onClick={() =>
                      tirarEvento(
                        eventoDoUltimo((state.cards || []).filter((c) => c.playerId === p.playerId && c.type === CARD.YELLOW))
                      )
                    }
                  >
                    −
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`regcard__amarelo ${amarelos ? '' : 'is-vazio'}`}
                  aria-label={t('partilhado.registos.amarelo')}
                  title={t('partilhado.registos.amarelo')}
                  onClick={() => amarelo(p)}
                >
                  {amarelos || ''}
                </button>
              </header>
              <div className="regcard__botoes">{botoesDe(p).map((b) => passo(b))}</div>
            </article>
          );
        })}
      </div>

      <div className="regultimo">
        <span className="regultimo__texto">
          <strong>{t('partilhado.registos.total', { n: acoes })}</strong>
          {ultimo ? (
            <span className="muted">
              {' · '}
              {t('partilhado.registos.ultimo', { registo: eventLabel(ultimo.eventType, ultimo, state.players) })}
            </span>
          ) : null}
        </span>
        <button type="button" className="btn btn--ghost" onClick={desfazerUltimo} disabled={!ultimo || ocupado}>
          {t('partilhado.registos.desfazer')}
        </button>
      </div>
    </>
  );
}
