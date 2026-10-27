'use client';

// components/registos/useAcoesRegistos.js — os toques dos registos extra no
// jogo ao vivo: remate, recuperação, defesa, perda de bola, ação +/−, fora,
// canto e remate do adversário.
//
// Vive fora do `Live()` de propósito: o ecrã do jogo já é grande, e isto é um
// bloco que só existe para os escalões com registos ligados. A página passa o
// que já tem — o estado, o `commit` que grava e recalcula, o fluxo do golo —
// e recebe de volta os handlers para pôr no `on`.

import { useUI } from '@/lib/ui.jsx';
import { EVENT } from '@/domain/constants.js';
import {
  COR_RESULTADO,
  COR_RESULTADO_ADV,
  REGISTO,
  RESULTADO_REMATE,
  marcadores,
  registar,
} from '@/domain/registos.js';
import { t } from '@/lib/i18n/index.js';
import { perguntarOnde } from './CampoToque.jsx';
import { abrirPainelRegistos } from './PainelRegistos.jsx';

/**
 * @param {object} o
 * @param {object} o.state     o estado do jogo, como está agora
 * @param {Set}    o.ligados   os registos ligados para este escalão
 * @param {Function} o.commit  grava um evento e devolve o estado novo
 * @param {Function} o.marcarGolo  o fluxo normal do golo de um jogador; recebe
 *   `(p, { comRemate })` e chama `comRemate(st, goloEventId)` logo depois de o
 *   golo subir ao marcador, antes de perguntar a assistência
 * @param {Function} o.marcarGoloAdversario  o fluxo do golo sofrido; recebe
 *   `({ comRemate })`, com o mesmo `comRemate(st, goloEventId)`
 * @param {Function} o.nomes   devolve `{ nos, eles }` (os nomes curtos)
 */
export default function useAcoesRegistos({ state, ligados, commit, marcarGolo, marcarGoloAdversario, nomes }) {
  const ui = useUI();

  const quem = (p) => ({ numero: p.number, nome: p.name });
  const pontos = (registo) => (state ? marcadores(state, { registos: [registo] }) : []);

  async function registarRemate(p) {
    const r = await perguntarOnde(ui, {
      titulo: t('registos.remateDe', quem(p)),
      opcoes: Object.values(RESULTADO_REMATE).map((o) => ({
        id: o,
        rotulo: t(`registos.resultado.${o}`),
        cor: COR_RESULTADO[o],
      })),
      markers: pontos(REGISTO.REMATE),
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
   * Remate do adversário: o que aconteceu (golo, defesa do nosso GR,
   * bloqueado, fora, poste) e de onde rematou, na nossa metade. Golo é golo
   * sofrido: corre primeiro o fluxo de sempre (marcador, sanções, tipo do
   * golo) e o remate fica preso a esse golo, como nos nossos.
   */
  async function registarRemateAdv() {
    const { eles } = nomes();
    const r = await perguntarOnde(ui, {
      titulo: t('registos.remateAdvDe', { equipa: eles }),
      subtitulo: t('registos.remateAdvSub'),
      opcoes: Object.values(RESULTADO_REMATE).map((o) => ({
        id: o,
        rotulo: t(`registos.resultadoAdv.${o}`),
        cor: COR_RESULTADO_ADV[o],
      })),
      markers: pontos(REGISTO.REMATE_ADV),
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

  async function registarRecuperacao(p) {
    const r = await perguntarOnde(ui, {
      titulo: t('registos.recuperacaoDe', quem(p)),
      markers: pontos(REGISTO.RECUPERACAO),
    });
    if (!r) return;
    await commit(registar(state, { registo: REGISTO.RECUPERACAO, playerId: p.playerId, x: r.x, y: r.y }));
  }

  async function registarDefesa(p) {
    const r = await perguntarOnde(ui, {
      titulo: t('registos.defesaDe', quem(p)),
      subtitulo: t('registos.defesaSub'),
      markers: pontos(REGISTO.DEFESA_GR),
    });
    if (!r) return;
    await commit(registar(state, { registo: REGISTO.DEFESA_GR, playerId: p.playerId, x: r.x, y: r.y }));
  }

  // Sem zona, como as ações: um toque e fica. Engano desfaz-se no DESFAZER.
  async function registarPerda(p) {
    await commit(registar(state, { registo: REGISTO.PERDA_BOLA, playerId: p.playerId }));
  }

  async function registarAcao(p, resultado) {
    await commit(registar(state, { registo: REGISTO.ACAO, playerId: p.playerId, resultado }));
  }

  async function registarFora(equipa) {
    const { nos, eles } = nomes();
    const r = await perguntarOnde(ui, {
      titulo: t('registos.foraDe', { equipa: equipa === 'US' ? nos : eles }),
      subtitulo: t('registos.foraSub'),
      markers: pontos(REGISTO.FORA),
      lateral: true,
    });
    if (!r) return;
    await commit(registar(state, { registo: REGISTO.FORA, equipa, x: r.x, y: r.y }));
  }

  async function registarCanto(equipa) {
    await commit(registar(state, { registo: REGISTO.CANTO, equipa }));
  }

  function verRegistos() {
    const { nos, eles } = nomes();
    abrirPainelRegistos(ui, { state, ourName: nos, opponentName: eles });
  }

  /**
   * O que o DESFAZER leva consigo. Um remate com GOLO foi gravado junto com o
   * golo, por isso desfaz-se com ele: tirar só o remate deixava um golo que
   * ninguém pediu para ficar.
   */
  function alvosDoDesfazer(evento) {
    if (!evento) return [];
    const md = evento.metadata || {};
    if (
      evento.eventType === EVENT.STAT_RECORDED &&
      (md.registo === REGISTO.REMATE || md.registo === REGISTO.REMATE_ADV) &&
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
      registarRecuperacao,
      registarDefesa,
      registarPerda,
      registarAcao,
      registarFora,
      registarCanto,
      registarRemateAdv,
      verRegistos,
    },
    alvosDoDesfazer,
  };
}
