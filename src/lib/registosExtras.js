// lib/registosExtras.js — as linhas das tabelas de registos extra (de um
// atleta ou da equipa), partilhadas pelo ecrã (components/registos/
// ExtrasRegistos.jsx) e pelos PDF (lib/pdf/registos.js). Recebem o `t` de
// quem as chama.

import { CATALOGO, REGISTO, REGISTOS } from '../domain/registos.js';

/** As linhas da tabela de um jogador: `{id, nome, r: {n, porJogo, por10}, detalhe}`. */
export function linhasExtrasAtleta(extras, t) {
  if (!extras) return [];
  const { por, remates, acoes, penaltis, duelos } = extras;
  const linhas = [];
  for (const id of REGISTOS) {
    const r = por[id];
    if (!r || !r.jogos) continue;
    // Os do guarda-redes (defesas, lançamentos) só para quem os fez.
    if (CATALOGO[id]?.soGR && !r.n) continue;
    let detalhe = '';
    if (id === REGISTO.REMATE && remates.comResultado) {
      detalhe = t('registos.ext.rematesDetalhe', {
        baliza: remates.aBaliza,
        pctBaliza: remates.percentagemBaliza,
        golos: remates.golos,
        pctGolo: remates.percentagemGolo,
      });
    } else if (id === REGISTO.ACAO) {
      detalhe = t('registos.ext.acoesDetalhe', { pos: acoes.positivas, neg: acoes.negativas });
    } else if (id === REGISTO.PENALTI) {
      detalhe = t('registos.ext.penaltisDetalhe', { golos: penaltis.golos, total: r.n });
    } else if (id === REGISTO.DUELO_DEF && r.n && duelos) {
      detalhe = t('registos.ext.duelosDetalhe', { ganhos: duelos.ganhos, pct: duelos.percentagem });
    }
    linhas.push({ id, nome: t(`registos.total.${id}`), r, detalhe });
  }
  return linhas;
}

/** As linhas da tabela-resumo da equipa: `{id, nome, total, porJogo, detalhe}`. */
export function linhasExtrasEquipa(extras, tipos, t) {
  return REGISTOS.filter((id) => tipos.has(id) && extras.por[id]).map((id) => {
    const a = extras.por[id];
    const total = a.US + a.THEM;
    let detalhe = '';
    if (id === REGISTO.REMATE && extras.remates.comResultado) {
      detalhe = t('registos.ext.rematesDetalhe', {
        baliza: extras.remates.aBaliza,
        pctBaliza: extras.remates.percentagemBaliza,
        golos: extras.remates.golos,
        pctGolo: extras.remates.percentagemGolo,
      });
    } else if (id === REGISTO.ACAO) {
      detalhe = t('registos.ext.acoesDetalhe', { pos: extras.acoes.positivas, neg: extras.acoes.negativas });
    } else if (id === REGISTO.DUELO_DEF && total) {
      const ganhos = a.res?.GANHO || 0;
      detalhe = t('registos.ext.duelosDetalhe', { ganhos, pct: Math.round((ganhos / total) * 100) });
    } else if (id === REGISTO.PRESSAO_ALTA && total) {
      const rec = a.res?.RECUPERADA || 0;
      detalhe = t('registos.ext.pressaoDetalhe', { rec, pct: Math.round((rec / total) * 100) });
    } else if (id === REGISTO.BOLA_PARADA) {
      detalhe = t('registos.ext.bolaParadaDetalhe', { golos: a.res?.GOLO || 0, fin: a.res?.FINALIZACAO || 0 });
    } else if (a.US && a.THEM) {
      detalhe = t('registos.ext.nosEles', { nos: a.US, eles: a.THEM });
    }
    return { id, nome: t(`registos.total.${id}`), total, porJogo: a.jogos ? total / a.jogos : 0, detalhe };
  });
}
