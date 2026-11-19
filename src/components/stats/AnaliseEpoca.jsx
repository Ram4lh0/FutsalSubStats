'use client';

// components/stats/AnaliseEpoca.jsx — a análise no painel da época (add-ons
// 'analise-indicadores' e 'analise-posicoes', 19/11/2026, Leões de Porto
// Salvo). As contas vivem em domain/analise.js; aqui só se desenha.
//
//  - IndicadoresEquipa: eficácia de finalização, duelos ganhos e recuperações
//    por 40', cada um com o rácio e o melhor jogador.
//  - IndicadoresAtleta: com um jogador escolhido, a eficácia, a conversão de
//    oportunidades, os duelos e os remates por 40' (e, no GR, minutos,
//    defesas, golos sofridos por 40' e percentagem de defesas).
//  - AnalisePosicoes: a tabela por posição e pé (alas canhotos, destros, …).
//
// Recebem as `entries` já filtradas (competição, tipo, últimos N jogos, jogo,
// período) e o `Bloco` do painel, para ficarem com a mesma cara.

import { useMemo, useState } from 'react';
import DataTable from '@/components/DataTable.jsx';
import { StatCard } from '@/components/bits.jsx';
import { useUI, Dialog } from '@/lib/ui.jsx';
import {
  GRUPOS_PE,
  GRUPOS_POSICAO,
  MINIMOS,
  analisePorPosicao,
  indicadoresDaEquipa,
  indicadoresDoAtleta,
} from '@/domain/analise.js';
import { fmt } from '@/domain/clock.js';
import { footLabel, positionShort } from '@/lib/format.js';
import { useT } from '@/lib/i18n/index.js';

const um = (v) => (v == null ? '—' : v.toFixed(1));
const pctTxt = (v) => (v == null ? '—' : `${v}%`);
const assinado = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`);
const quem = (j) => `${j.number != null ? `#${j.number} ` : ''}${j.name}`;
const minutos = (ms) => Math.round((ms || 0) / 60_000);

/* ------------------------------------------------------ equipa */

export function IndicadoresEquipa({ entries, Bloco }) {
  const t = useT();
  const ui = useUI();
  const ind = useMemo(() => indicadoresDaEquipa(entries), [entries]);
  const { finalizacao: f, duelos: d, recuperacoes: r } = ind;
  const semNada = !f.jogos && !d.jogos && !r.jogos;

  function verPorJogador() {
    const porId = new Map();
    const juntar = (lista, campos) => {
      for (const l of lista) porId.set(l.playerId, { ...(porId.get(l.playerId) || { number: l.number, name: l.name }), ...campos(l) });
    };
    juntar(f.jogadores, (l) => ({ golos: l.golos, remates: l.remates, finPct: l.pct }));
    juntar(d.jogadores, (l) => ({ duelos: l.duelos, ganhos: l.ganhos, duelosPct: l.pct }));
    juntar(r.jogadores, (l) => ({ recuperacoes: l.recuperacoes, recup40: l.por40, courtMs: l.courtMs }));
    const linhas = [...porId.values()].sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
    ui.open((close) => (
      <Dialog title={t('analise.porJogadorTitulo')} onClose={() => close(null)} wide>
        <DataTable players tight>
          <thead>
            <tr>
              <th>{t('stats.numero')}</th>
              <th>{t('stats.jogador')}</th>
              {f.jogos ? (
                <>
                  <th className="num">{t('analise.col.golosRemates')}</th>
                  <th className="num">{t('analise.col.eficacia')}</th>
                </>
              ) : null}
              {d.jogos ? (
                <>
                  <th className="num">{t('analise.col.duelos')}</th>
                  <th className="num">{t('analise.col.duelosPct')}</th>
                </>
              ) : null}
              {r.jogos ? (
                <>
                  <th className="num">{t('analise.col.recup')}</th>
                  <th className="num">{t('analise.col.recup40')}</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={`${l.number}-${l.name}`}>
                <td className="num mono">{l.number}</td>
                <td>{l.name}</td>
                {f.jogos ? (
                  <>
                    <td className="num mono">{l.remates ? `${l.golos}/${l.remates}` : '–'}</td>
                    <td className="num mono">{pctTxt(l.finPct)}</td>
                  </>
                ) : null}
                {d.jogos ? (
                  <>
                    <td className="num mono">{l.duelos ? `${l.ganhos}/${l.duelos}` : '–'}</td>
                    <td className="num mono">{pctTxt(l.duelosPct)}</td>
                  </>
                ) : null}
                {r.jogos ? (
                  <>
                    <td className="num mono">{l.recuperacoes ?? '–'}</td>
                    <td className="num mono">{um(l.recup40)}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </DataTable>
        <p className="muted small">{t('analise.notaMinimos', { remates: MINIMOS.remates, duelos: MINIMOS.duelos, min: minutos(MINIMOS.minutosRecup) })}</p>
        <footer className="modal__actions">
          <button className="btn btn--ghost" onClick={() => close(null)}>
            {t('comum.fechar')}
          </button>
        </footer>
      </Dialog>
    ));
  }

  return (
    <Bloco titulo={t('analise.indicadoresTitulo')} className="painelv__bloco--analise">
      {semNada ? (
        <p className="muted">{t('analise.semRegistos')}</p>
      ) : (
        <>
          <div className="grid grid--stats analise__cartoes">
            <div className="analise__ind">
              <StatCard
                label={t('analise.eficacia')}
                value={pctTxt(f.pct)}
                hint={f.jogos ? t('analise.golosRemates', { golos: f.golos, remates: f.remates }) : t('analise.semDados')}
              />
              {f.melhor ? (
                <p className="analise__melhor">
                  {t('analise.melhor', { quem: quem(f.melhor), valor: `${f.melhor.pct}%`, detalhe: `${f.melhor.golos}/${f.melhor.remates}` })}
                </p>
              ) : null}
            </div>
            <div className="analise__ind">
              <StatCard
                label={t('analise.duelosGanhos')}
                value={pctTxt(d.pct)}
                hint={d.jogos ? t('analise.ganhosTotal', { ganhos: d.ganhos, total: d.total }) : t('analise.semDados')}
              />
              {d.melhor ? (
                <p className="analise__melhor">
                  {t('analise.melhor', { quem: quem(d.melhor), valor: `${d.melhor.pct}%`, detalhe: `${d.melhor.ganhos}/${d.melhor.duelos}` })}
                </p>
              ) : null}
            </div>
            <div className="analise__ind">
              <StatCard
                label={t('analise.recup40')}
                value={um(r.por40)}
                hint={r.jogos ? t('analise.totalEmJogos', { total: r.total, jogos: r.jogos }) : t('analise.semDados')}
              />
              {r.melhor ? (
                <p className="analise__melhor">
                  {t('analise.melhor', { quem: quem(r.melhor), valor: um(r.melhor.por40), detalhe: t('analise.recupTotal', { n: r.melhor.recuperacoes }) })}
                </p>
              ) : null}
            </div>
          </div>
          <div className="form__actions form__actions--left">
            <button className="btn btn--ghost" onClick={verPorJogador}>
              {t('analise.verPorJogador')}
            </button>
          </div>
          <p className="muted small">{t('analise.notaEquipa')}</p>
        </>
      )}
    </Bloco>
  );
}

/* ----------------------------------------------------- atleta */

export function IndicadoresAtleta({ entries, roster, playerId, Bloco }) {
  const t = useT();
  const a = useMemo(() => indicadoresDoAtleta(entries, roster, playerId), [entries, roster, playerId]);
  if (!a) return null;
  const { finalizacao: f, conversao: c, duelos: d, gr } = a;
  return (
    <>
      <Bloco titulo={t('analise.atletaTitulo')} className="painelv__bloco--analise-atleta">
        <div className="grid grid--stats">
          <StatCard
            label={t('analise.eficacia')}
            value={pctTxt(f.pct)}
            hint={f.jogos ? t('analise.golosRemates', { golos: f.golos, remates: f.remates }) : t('analise.semDados')}
          />
          <StatCard
            label={t('analise.conversao')}
            value={pctTxt(c.pct)}
            hint={
              c.jogos
                ? t('analise.conversaoDetalhe', { golos: c.golos, total: c.golos + c.falhadas })
                : t('analise.semDados')
            }
          />
          <StatCard
            label={t('analise.duelosGanhos')}
            value={pctTxt(d.pct)}
            hint={d.jogos ? t('analise.ganhosTotal', { ganhos: d.ganhos, total: d.total }) : t('analise.semDados')}
          />
          <StatCard
            label={t('analise.remates40')}
            value={um(f.por40)}
            hint={f.jogos ? t('analise.rematesTotal', { n: f.remates }) : t('analise.semDados')}
          />
        </div>
        <p className="muted small">{t('analise.notaAtleta')}</p>
      </Bloco>
      {a.guardaRedes ? (
        <Bloco titulo={t('analise.grTitulo')} className="painelv__bloco--analise-gr">
          <div className="grid grid--stats">
            <StatCard label={t('analise.minutosJogados')} value={fmt(a.minutosMs)} hint={t('painelv.emJogos', { n: a.jogos })} />
            <StatCard
              label={t('analise.totalDefesas')}
              value={gr.jogosDefesas ? gr.defesas : '—'}
              hint={gr.jogosDefesas ? t('painelv.emJogos', { n: gr.jogosDefesas }) : t('analise.semDados')}
            />
            <StatCard
              label={t('analise.sofridos40')}
              value={gr.sofridos40 == null ? '—' : gr.sofridos40.toFixed(2)}
              hint={t('analise.sofridosTotal', { n: gr.sofridos })}
            />
            <StatCard
              label={t('analise.pctDefesas')}
              value={pctTxt(gr.pctDefesas)}
              hint={
                gr.jogosDefesas
                  ? t('analise.defesasDetalhe', { defesas: gr.defesas, total: gr.defesas + gr.sofridosComDefesas })
                  : t('analise.semDados')
              }
            />
          </div>
        </Bloco>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------- posições */

export function AnalisePosicoes({ entries, roster, Bloco }) {
  const t = useT();
  const [posicao, setPosicao] = useState('TODAS');
  const [pe, setPe] = useState('TODOS');
  const dados = useMemo(() => analisePorPosicao(entries, roster, { posicao, pe }), [entries, roster, posicao, pe]);
  const rotuloPos = (g) =>
    g === 'TODAS' ? t('analise.pos.todas') : g === 'ALA' ? t('analise.pos.alas') : t(`posicao.${g}`);
  const rotuloPe = (g) => (g === 'TODOS' ? t('analise.pe.todos') : t(`analise.pe.${g}`));
  const tot = dados.total;

  return (
    <Bloco titulo={t('analise.posicoesTitulo')} className="painelv__bloco--analise-pos">
      <div className="filtros analise__filtros">
        <div className="filtros__grupo">
          <span className="filtros__rotulo">{t('analise.posicao')}</span>
          {GRUPOS_POSICAO.map((g) => (
            <button key={g} type="button" className={`chip ${posicao === g ? 'is-on' : ''}`} onClick={() => setPosicao(g)}>
              {rotuloPos(g)}
            </button>
          ))}
        </div>
        <div className="filtros__grupo">
          <span className="filtros__rotulo">{t('analise.pePref')}</span>
          {GRUPOS_PE.map((g) => (
            <button key={g} type="button" className={`chip ${pe === g ? 'is-on' : ''}`} onClick={() => setPe(g)}>
              {rotuloPe(g)}
            </button>
          ))}
        </div>
      </div>
      {dados.linhas.length ? (
        <DataTable players tight>
          <thead>
            <tr>
              <th>{t('stats.numero')}</th>
              <th>{t('stats.jogador')}</th>
              <th>{t('analise.col.pos')}</th>
              <th>{t('analise.col.pe')}</th>
              <th className="num">{t('analise.col.minutos')}</th>
              <th className="num">{t('analise.col.golos')}</th>
              <th className="num" title={t('analise.col.golos40Titulo')}>{t('analise.col.golos40')}</th>
              <th className="num" title={t('analise.col.gmTitulo')}>{t('analise.col.gm')}</th>
              <th className="num" title={t('analise.col.gsTitulo')}>{t('analise.col.gs')}</th>
              <th className="num" title={t('analise.col.dif40Titulo')}>{t('analise.col.dif40')}</th>
            </tr>
          </thead>
          <tbody>
            {dados.linhas.map((l) => (
              <tr key={l.playerId}>
                <td className="num mono">{l.number}</td>
                <td>{l.name}</td>
                <td>{positionShort(l.posicao)}</td>
                <td>{footLabel(l.pe)}</td>
                <td className="num mono">{minutos(l.courtMs)}</td>
                <td className="num mono">{l.golos}</td>
                <td className="num mono">{l.golos40 == null ? '—' : l.golos40.toFixed(2)}</td>
                <td className="num mono">{l.gm}</td>
                <td className="num mono">{l.gs}</td>
                <td className={`num mono ${l.dif40 > 0 ? 'is-win' : l.dif40 < 0 ? 'is-loss' : ''}`}>{assinado(l.dif40)}</td>
              </tr>
            ))}
            <tr className="analise__total">
              <td />
              <td>{t('analise.totalGrupo', { n: tot.jogadores })}</td>
              <td />
              <td />
              {/* A soma dos minutos já arredondados de cada linha, para bater certo à vista. */}
              <td className="num mono">{dados.linhas.reduce((n, l) => n + minutos(l.courtMs), 0)}</td>
              <td className="num mono">{tot.golos}</td>
              <td className="num mono">{tot.golos40 == null ? '—' : tot.golos40.toFixed(2)}</td>
              <td className="num mono">{tot.gm}</td>
              <td className="num mono">{tot.gs}</td>
              <td className={`num mono ${tot.dif40 > 0 ? 'is-win' : tot.dif40 < 0 ? 'is-loss' : ''}`}>{assinado(tot.dif40)}</td>
            </tr>
          </tbody>
        </DataTable>
      ) : (
        <p className="muted">{t('analise.semJogadoresGrupo')}</p>
      )}
      <p className="muted small">{t('analise.notaPosicoes')}</p>
    </Bloco>
  );
}
