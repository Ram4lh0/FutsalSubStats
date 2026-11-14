'use client';

// components/registos/useAcoesRegistos.js — os toques dos registos extra no
// jogo ao vivo: remate, recuperação, defesa, perda de bola, passe falhado,
// ação +/−, fora, canto, lançamento de baliza, remate e penálti do adversário,
// penálti nosso e o livre de 10 metros.
//
// Vive fora do `Live()` de propósito: o ecrã do jogo já é grande, e isto é um
// bloco que só existe para os escalões com registos ligados. A página passa o
// que já tem — o estado, o `commit` que grava e recalcula, o fluxo do golo —
// e recebe de volta os handlers para pôr no `on`.
//
// As opções do escalão (`ligados.opcoes`) decidem o que se pergunta: sem zona
// não aparece o campo, sem "o que aconteceu" não aparecem os resultados. Sem
// nenhuma das duas, o toque grava logo.

import { useUI } from '@/lib/ui.jsx';
import { events } from '@/lib/data/repository.js';
import * as A from '@/domain/actions.js';
import { EVENT, GOAL_TYPE } from '@/domain/constants.js';
import {
  COR_PENALTI,
  COR_PENALTI_ADV,
  COR_RESULTADO,
  COR_RESULTADO_ADV,
  REGISTO,
  RESULTADO_10M,
  RESULTADO_PENALTI,
  RESULTADO_REMATE,
  levaGolo,
  marcadores,
  registar,
  registosDoJogo,
} from '@/domain/registos.js';
import { pickPlayer } from '@/components/live/dialogs.jsx';
import { t } from '@/lib/i18n/index.js';
import { perguntarOnde } from './CampoToque.jsx';
import { abrirPainelRegistos } from './PainelRegistos.jsx';

/**
 * @param {object} o
 * @param {object} o.state     o estado do jogo, como está agora
 * @param {Set}    o.ligados   os registos ligados para este escalão (com `.opcoes`)
 * @param {Function} o.commit  grava um evento e devolve o estado novo
 * @param {Function} o.marcarGolo  o fluxo do golo nosso; recebe
 *   `(p, { comRemate, tipo })` — `p` a null para um golo sem marcador — e chama
 *   `comRemate(st, goloEventId)` logo depois de o golo subir ao marcador.
 *   Com `tipo`, o golo fica com esse tipo e não se pergunta mais nada; com
 *   `base`, parte desse estado e não do da última vez que o ecrã desenhou.
 * @param {Function} o.marcarGoloAdversario  o fluxo do golo sofrido; recebe
 *   `({ comRemate, tipo })`, como o de cima
 * @param {Function} o.nomes   devolve `{ nos, eles }` (os nomes curtos)
 */
export default function useAcoesRegistos({ state, ligados, commit, marcarGolo, marcarGoloAdversario, nomes }) {
  const ui = useUI();

  const quem = (p) => ({ numero: p.number, nome: p.name });
  const pontos = (registo) => (state ? marcadores(state, { registos: [registo] }) : []);
  const opcoesDe = (registo) => ligados?.opcoes?.[registo] || {};

  /**
   * Pergunta o que este escalão quer para este registo. Resolve com
   * `{ opcao, x, y }` (o que não se perguntou vem a null) ou null se fechar.
   * Sem nada para perguntar, resolve logo, sem abrir janela.
   */
  async function perguntar(registo, { opcoes = null, ...resto }) {
    const op = opcoesDe(registo);
    const comZona = op.zona !== false;
    const comResultado = Boolean(opcoes) && op.resultado !== false;
    if (!comZona && !comResultado) return { opcao: null, x: null, y: null };
    return perguntarOnde(ui, {
      ...resto,
      opcoes: comResultado ? opcoes : null,
      markers: pontos(registo),
      semCampo: !comZona,
    });
  }

  const opcoesRemate = (cores, chave) =>
    Object.values(RESULTADO_REMATE).map((o) => ({ id: o, rotulo: t(`registos.${chave}.${o}`), cor: cores[o] }));

  async function registarRemate(p) {
    const r = await perguntar(REGISTO.REMATE, {
      titulo: t('registos.remateDe', quem(p)),
      opcoes: opcoesRemate(COR_RESULTADO, 'resultado'),
      destaque: 'deles',
    });
    if (!r) return;
    const dados = { registo: REGISTO.REMATE, playerId: p.playerId, resultado: r.opcao, x: r.x, y: r.y };
    // Remate que deu golo: primeiro o golo, pelo caminho de sempre; o remate
    // grava-se a seguir, preso ao golo. Sem golo, não há remate com GOLO.
    if (r.opcao === RESULTADO_REMATE.GOLO) {
      await marcarGolo(p, {
        comRemate: (st, goloEventId) => registar(st, { ...dados, goloEventId }),
      });
      return;
    }
    await commit(registar(state, dados));
  }

  /**
   * Remate com o resultado já dito pelo botão ("enquadrado" ou "fora", no ecrã
   * dos Registos de um jogo partilhado): só se pergunta a zona, se o escalão a
   * pedir.
   */
  async function registarRemateCom(p, resultado, titulo) {
    let x = null;
    let y = null;
    if (opcoesDe(REGISTO.REMATE).zona !== false) {
      const r = await perguntarOnde(ui, {
        titulo: titulo || t('registos.remateDe', quem(p)),
        markers: pontos(REGISTO.REMATE),
        destaque: 'deles',
      });
      if (!r) return;
      x = r.x;
      y = r.y;
    }
    // Remate enquadrado: depois da zona, pergunta-se se foi defendido ou golo.
    if (resultado === RESULTADO_REMATE.DEFENDIDO) {
      const o = await perguntarOnde(ui, {
        titulo: t('partilhado.registos.enquadradoFoi', quem(p)),
        opcoes: [RESULTADO_REMATE.DEFENDIDO, RESULTADO_REMATE.GOLO].map((id) => ({
          id,
          rotulo: t(`registos.resultado.${id}`),
          cor: COR_RESULTADO[id],
        })),
        semCampo: true,
      });
      if (!o) return;
      resultado = o.opcao;
      if (resultado === RESULTADO_REMATE.GOLO) {
        await marcarGolo(p, {
          comRemate: (st, goloEventId) =>
            registar(st, { registo: REGISTO.REMATE, playerId: p.playerId, resultado, x, y, goloEventId }),
        });
        return;
      }
    }
    await commit(registar(state, { registo: REGISTO.REMATE, playerId: p.playerId, resultado, x, y }));
  }

  /**
   * Remate do adversário: o que aconteceu (golo, defesa do nosso GR,
   * bloqueado, fora, poste) e de onde rematou, na nossa metade — o que o
   * escalão pedir. Golo é golo sofrido: corre primeiro o fluxo de sempre e o
   * remate fica preso a esse golo, como nos nossos.
   */
  async function registarRemateAdv() {
    const { eles } = nomes();
    const r = await perguntar(REGISTO.REMATE_ADV, {
      titulo: t('registos.remateAdvDe', { equipa: eles }),
      subtitulo: opcoesDe(REGISTO.REMATE_ADV).zona !== false ? t('registos.remateAdvSub') : null,
      opcoes: opcoesRemate(COR_RESULTADO_ADV, 'resultadoAdv'),
      destaque: 'nossa',
    });
    if (!r) return;
    const dados = { registo: REGISTO.REMATE_ADV, resultado: r.opcao, x: r.x, y: r.y };
    if (r.opcao === RESULTADO_REMATE.GOLO) {
      await marcarGoloAdversario({
        comRemate: (st, goloEventId) => registar(st, { ...dados, goloEventId }),
      });
      return;
    }
    await commit(registar(state, dados));
  }

  /** O remate nosso da barra de cima: primeiro quem rematou, dos que estão em campo. */
  async function registarRemateBarra() {
    const playerId = await pickPlayer(ui, state, t('registos.quemRematou'));
    if (!playerId || !state.players[playerId]) return;
    await registarRemate(state.players[playerId]);
  }

  async function registarRecuperacao(p) {
    const r = await perguntar(REGISTO.RECUPERACAO, { titulo: t('registos.recuperacaoDe', quem(p)) });
    if (!r) return;
    await commit(registar(state, { registo: REGISTO.RECUPERACAO, playerId: p.playerId, x: r.x, y: r.y }));
  }

  async function registarDefesa(p) {
    const r = await perguntar(REGISTO.DEFESA_GR, {
      titulo: t('registos.defesaDe', quem(p)),
      subtitulo: t('registos.defesaSub'),
    });
    if (!r) return;
    await commit(registar(state, { registo: REGISTO.DEFESA_GR, playerId: p.playerId, x: r.x, y: r.y }));
  }

  // Lançamento do guarda-redes: com a zona (a omissão), toca-se para onde
  // lançou; sem ela, um toque e fica contado.
  async function registarLancamentoGR(p) {
    const r = await perguntar(REGISTO.LANCAMENTO_GR, {
      titulo: t('registos.lancamentoGRDe', quem(p)),
      subtitulo: opcoesDe(REGISTO.LANCAMENTO_GR).zona !== false ? t('registos.lancamentoGRSub') : null,
    });
    if (!r) return;
    await commit(registar(state, { registo: REGISTO.LANCAMENTO_GR, playerId: p.playerId, x: r.x, y: r.y }));
  }

  // Sem zona (a omissão) é um toque e fica, como as ações; com a zona ligada
  // no escalão, pergunta onde perdeu a bola, como a recuperação.
  async function registarPerda(p) {
    const r = await perguntar(REGISTO.PERDA_BOLA, { titulo: t('registos.perdaDe', quem(p)) });
    if (!r) return;
    await commit(registar(state, { registo: REGISTO.PERDA_BOLA, playerId: p.playerId, x: r.x, y: r.y }));
  }

  async function registarPasse(p) {
    await commit(registar(state, { registo: REGISTO.PASSE_FALHADO, playerId: p.playerId }));
  }

  /** O passe falhado da barra de cima: primeiro quem falhou, dos que estão em campo. */
  async function registarPasseBarra() {
    const playerId = await pickPlayer(ui, state, t('registos.quemFalhouPasse'));
    if (!playerId) return;
    await commit(registar(state, { registo: REGISTO.PASSE_FALHADO, playerId }));
  }

  async function registarAcao(p, resultado) {
    await commit(registar(state, { registo: REGISTO.ACAO, playerId: p.playerId, resultado }));
  }

  async function registarFora(equipa) {
    const { nos, eles } = nomes();
    const r = await perguntar(REGISTO.FORA, {
      titulo: t('registos.foraDe', { equipa: equipa === 'US' ? nos : eles }),
      subtitulo: t('registos.foraSub'),
      lateral: true,
    });
    if (!r) return;
    await commit(registar(state, { registo: REGISTO.FORA, equipa, x: r.x, y: r.y }));
  }

  async function registarCanto(equipa) {
    await commit(registar(state, { registo: REGISTO.CANTO, equipa }));
  }

  async function registarLancamento(equipa) {
    await commit(registar(state, { registo: REGISTO.LANCAMENTO_BALIZA, equipa }));
  }

  /** Os botões do resultado de um penálti (ou de um livre de 10 m). */
  const opcoesPenalti = (cores, resultados, chave) =>
    resultados.map((o) => ({ id: o, rotulo: t(`registos.${chave}.${o}`), cor: cores[o] }));

  /**
   * Penálti nosso: quem bateu (pode ficar por dizer) e o que aconteceu. Golo
   * corre o fluxo do golo, com o tipo "penálti" já posto e sem assistência.
   */
  async function registarPenalti() {
    const playerId = await pickPlayer(ui, state, t('registos.quemBateuPenalti'), {
      allowNone: true,
      noneLabel: t('acao.naoRegistar'),
    });
    if (playerId === undefined) return;
    const p = playerId ? state.players[playerId] : null;
    const r = await perguntarOnde(ui, {
      titulo: p ? t('registos.penaltiDe', quem(p)) : t('registos.nome.penalti'),
      opcoes: opcoesPenalti(COR_PENALTI, Object.values(RESULTADO_PENALTI), 'resultadoPenalti'),
      semCampo: true,
    });
    if (!r) return;
    const dados = { registo: REGISTO.PENALTI, playerId, resultado: r.opcao };
    if (r.opcao === RESULTADO_PENALTI.GOLO) {
      await marcarGolo(p, {
        tipo: GOAL_TYPE.PENALTI,
        comRemate: (st, goloEventId) => registar(st, { ...dados, goloEventId }),
      });
      return;
    }
    await commit(registar(state, dados));
  }

  /** Penálti do adversário: o que aconteceu. Golo é golo sofrido, já com o tipo. */
  async function registarPenaltiAdv() {
    const { eles } = nomes();
    const r = await perguntarOnde(ui, {
      titulo: t('registos.penaltiAdvDe', { equipa: eles }),
      opcoes: opcoesPenalti(COR_PENALTI_ADV, Object.values(RESULTADO_PENALTI), 'resultadoPenaltiAdv'),
      semCampo: true,
    });
    if (!r) return;
    const dados = { registo: REGISTO.PENALTI_ADV, resultado: r.opcao };
    if (r.opcao === RESULTADO_PENALTI.GOLO) {
      await marcarGoloAdversario({
        tipo: GOAL_TYPE.PENALTI,
        comRemate: (st, goloEventId) => registar(st, { ...dados, goloEventId }),
      });
      return;
    }
    await commit(registar(state, dados));
  }

  /**
   * O livre de 10 metros (todos os escalões): depois de uma falta da 6.ª em
   * diante, foi golo ou não. `equipa` é quem bate. "Registar depois" fecha sem
   * gravar. Num golo nosso pergunta-se quem marcou; o tipo do golo vem posto.
   *
   * @param {object} st  o estado depois da falta
   */
  async function perguntarLivre10(st, { equipa, n }) {
    const { nos, eles } = nomes();
    const cores = equipa === 'US' ? COR_PENALTI : COR_PENALTI_ADV;
    const r = await perguntarOnde(ui, {
      titulo: t('dialogo.livre10', { equipa: equipa === 'US' ? nos : eles }),
      subtitulo: t('dialogo.faltaN', { n, equipa: equipa === 'US' ? eles : nos }),
      opcoes: Object.values(RESULTADO_10M).map((o) => ({
        id: o,
        rotulo: t(`registos.resultado10m.${o}`),
        cor: cores[o],
      })),
      semCampo: true,
      fechar: t('registos.registarDepois'),
    });
    if (!r) return;
    const dados = { registo: REGISTO.LIVRE_10M, equipa, resultado: r.opcao };
    if (r.opcao !== RESULTADO_10M.GOLO) {
      await commit(registar(st, dados));
      return;
    }
    if (equipa === 'THEM') {
      await marcarGoloAdversario({
        base: st,
        tipo: GOAL_TYPE.LIVRE_10M,
        comRemate: (s, goloEventId) => registar(s, { ...dados, goloEventId }),
      });
      return;
    }
    const playerId = await pickPlayer(ui, st, t('acao.quemMarcou'), {
      allowNone: true,
      noneLabel: t('acao.naoRegistar'),
    });
    if (playerId === undefined) return;
    await marcarGolo(playerId ? st.players[playerId] : null, {
      base: st,
      tipo: GOAL_TYPE.LIVRE_10M,
      comRemate: (s, goloEventId) => registar(s, { ...dados, playerId, goloEventId }),
    });
  }

  /**
   * O remate que um golo leva consigo quando o escalão não pede o resultado
   * dos remates: assim "remates" nunca fica abaixo dos golos. Devolve a função
   * `comRemate` para o fluxo do golo, ou null se não for caso disso.
   */
  function remateDoGolo(equipa, playerId = null) {
    const registo = equipa === 'US' ? REGISTO.REMATE : REGISTO.REMATE_ADV;
    if (!ligados?.has(registo) || opcoesDe(registo).resultado !== false) return null;
    if (equipa === 'US' && !playerId) return null;
    return (st, goloEventId) =>
      registar(st, { registo, playerId, resultado: RESULTADO_REMATE.GOLO, goloEventId });
  }

  /**
   * O "−" dos contadores da barra: tira o último registo deste tipo (e desta
   * equipa, nos que têm as duas). Fica marcado como desfeito, como no
   * DESFAZER. Um registo preso a um golo não sai por aqui — tirá-lo deixava o
   * golo sem o seu remate ou penálti, ou mexia no resultado: corrige-se o golo.
   */
  async function tirarUltimo(registo, equipa = null) {
    const lista = registosDoJogo(state).filter(
      (r) => r.registo === registo && (!equipa || r.equipa === equipa)
    );
    if (!lista.length) return;
    const alvo = [...lista].reverse().find((r) => r.resultado !== RESULTADO_REMATE.GOLO);
    if (!alvo) {
      ui.toast(t('registos.tirarPeloGolo'), 'error');
      return;
    }
    const ev = (state.events || []).find((e) => e.id === alvo.eventId);
    if (!ev) return;
    await events.markUndone(ev.id, null, { sync: 'defer' });
    await commit(A.undoEvent(state, ev));
    ui.toast(t('registos.tirado', { registo: t(`registos.nome.${registo}`) }), 'ok');
  }

  function verRegistos() {
    const { nos, eles } = nomes();
    abrirPainelRegistos(ui, { state, ourName: nos, opponentName: eles });
  }

  /**
   * O que o DESFAZER leva consigo. Um remate (ou penálti, ou 10 m) com GOLO
   * foi gravado junto com o golo, por isso desfaz-se com ele: tirar só o
   * registo deixava um golo que ninguém pediu para ficar.
   */
  function alvosDoDesfazer(evento) {
    if (!evento) return [];
    const md = evento.metadata || {};
    if (
      evento.eventType === EVENT.STAT_RECORDED &&
      levaGolo(md.registo) &&
      md.resultado === RESULTADO_REMATE.GOLO &&
      md.goloEventId
    ) {
      const golo = (state?.events || []).find((e) => e.id === md.goloEventId);
      if (golo) return [evento, golo];
    }
    return [evento];
  }

  return {
    ligados,
    on: {
      registarRemate,
      registarRemateCom,
      registarRemateBarra,
      registarRecuperacao,
      registarDefesa,
      registarLancamentoGR,
      registarPerda,
      registarPasse,
      registarPasseBarra,
      registarAcao,
      registarFora,
      registarCanto,
      registarLancamento,
      registarRemateAdv,
      registarPenalti,
      registarPenaltiAdv,
      tirarUltimo,
      verRegistos,
    },
    perguntarLivre10,
    remateDoGolo,
    alvosDoDesfazer,
  };
}
