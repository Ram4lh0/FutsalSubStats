'use client';

// components/stats/RelatorioPosJogo.jsx — o relatório pós-jogo (add-on
// 'relatorio-pos-jogo', 19/11/2026, Leões de Porto Salvo):
//
//  1. "Nós vs adversário": uma tabela espelhada, frente a frente — golos,
//     oportunidades criadas, remates (à baliza, fora, bloqueados, ao poste),
//     oportunidades falhadas, faltas, cartões e duelos ganhos. Cada linha tem
//     uma barra partida ao meio, para se ver de relance quem dominou.
//  2. "Desempenho individual": G, A, remates, oportunidades criadas,
//     recuperações, perdas, duelos, oportunidades falhadas (e defesas, se houver).
//
// As contas vivem em domain/analise.js. Uma linha (ou coluna) só aparece se
// houver dados, ou se o registo estiver ligado no escalão (zero é zero).

import DataTable from '@/components/DataTable.jsx';
import { espelhoDoJogo, desempenhoIndividual } from '@/domain/analise.js';
import { deQuantos } from '@/domain/registos.js';
import { fmt } from '@/domain/clock.js';
import { useT } from '@/lib/i18n/index.js';

/** As linhas em que ter mais é mau (faltas, cartões, oportunidades falhadas). */
const MAU = new Set(['faltas', 'amarelos', 'vermelhos', 'opFalhadas']);

export function TabelaEspelho({ linhas, ourName, opponentName }) {
  const t = useT();
  return (
    <div className="espelho" role="table" aria-label={t('relatorio.espelhoTitulo', { nos: ourName, eles: opponentName })}>
      <div className="espelho__cab" role="row">
        <span className="espelho__eq espelho__eq--nos" role="columnheader">{ourName}</span>
        <span role="columnheader" />
        <span className="espelho__eq espelho__eq--eles" role="columnheader">{opponentName}</span>
      </div>
      {linhas.map((l) => {
        const a = l.US ?? 0;
        const b = l.THEM ?? 0;
        const soma = a + b;
        const pNos = soma ? (a / soma) * 100 : 50;
        const mau = MAU.has(l.id);
        // As sublinhas dos remates não levam cor: mais remates ao poste não é
        // melhor nem pior.
        const cor = (x, y) => (!l.sub && x > y ? (mau ? 'is-pior' : 'is-melhor') : '');
        return (
          <div key={l.id} className={`espelho__linha ${l.sub ? 'espelho__linha--sub' : ''}`} role="row">
            <span
              className={`espelho__v espelho__v--nos ${cor(a, b)}`}
              role="cell"
            >
              {l.US ?? '—'}
            </span>
            <span className="espelho__meio" role="rowheader">
              <span className="espelho__rot">{t(`relatorio.linha.${l.id}`)}</span>
              {/* 0–0: só o fundo da barra, sem lado nenhum pintado. */}
              {!l.sub && l.US != null && l.THEM != null && soma === 0 ? (
                <span className="espelho__barra" aria-hidden="true" />
              ) : null}
              {!l.sub && l.US != null && l.THEM != null && soma > 0 ? (
                <span className="espelho__barra" aria-hidden="true">
                  <span className={`espelho__barra-nos ${mau ? 'is-mau' : ''}`} style={{ width: `${pNos}%` }} />
                  <span className={`espelho__barra-eles ${mau ? 'is-mau' : ''}`} style={{ width: `${100 - pNos}%` }} />
                </span>
              ) : null}
            </span>
            <span
              className={`espelho__v espelho__v--eles ${cor(b, a)}`}
              role="cell"
            >
              {l.THEM ?? '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TabelaIndividual({ dados }) {
  const t = useT();
  const { colunas, jogadores } = dados;
  if (!jogadores.length) return <p className="muted">{t('stats.semDados')}</p>;
  const num = (v) => (v ? v : '–');
  return (
    <DataTable players tight>
      <thead>
        <tr>
          <th>{t('stats.numero')}</th>
          <th>{t('stats.jogador')}</th>
          <th className="num">{t('relatorio.col.min')}</th>
          <th className="num" title={t('stats.golos')}>{t('relatorio.col.g')}</th>
          <th className="num" title={t('stats.assistencias')}>{t('relatorio.col.a')}</th>
          {colunas.remates ? <th className="num" title={t('relatorio.linha.remates')}>{t('relatorio.col.remates')}</th> : null}
          {colunas.opCriadas ? <th className="num" title={t('relatorio.linha.opCriadas')}>{t('relatorio.col.opCriadas')}</th> : null}
          {colunas.recuperacoes ? <th className="num" title={t('registos.total.recuperacao')}>{t('relatorio.col.recup')}</th> : null}
          {colunas.perdas ? <th className="num" title={t('registos.total.perda_bola')}>{t('relatorio.col.perdas')}</th> : null}
          {colunas.duelos ? <th className="num" title={t('relatorio.col.duelosTitulo')}>{t('relatorio.col.duelos')}</th> : null}
          {colunas.opFalhadas ? <th className="num" title={t('relatorio.linha.opFalhadas')}>{t('relatorio.col.opFalhadas')}</th> : null}
          {colunas.defesas ? <th className="num" title={t('registos.total.defesa_gr')}>{t('relatorio.col.defesas')}</th> : null}
        </tr>
      </thead>
      <tbody>
        {jogadores.map((j) => (
          <tr key={j.playerId}>
            <td className="num mono">{j.number}</td>
            <td>{j.name}</td>
            <td className="num mono">{fmt(j.courtMs)}</td>
            <td className="num mono">{num(j.golos)}</td>
            <td className="num mono">{num(j.assistencias)}</td>
            {colunas.remates ? <td className="num mono">{num(j.remates)}</td> : null}
            {colunas.opCriadas ? <td className="num mono">{num(j.opCriadas)}</td> : null}
            {colunas.recuperacoes ? <td className="num mono">{num(j.recuperacoes)}</td> : null}
            {colunas.perdas ? <td className="num mono">{num(j.perdas)}</td> : null}
            {colunas.duelos ? <td className="num mono">{deQuantos(j.duelosGanhos, j.duelos) || '–'}</td> : null}
            {colunas.opFalhadas ? <td className="num mono">{num(j.opFalhadas)}</td> : null}
            {colunas.defesas ? <td className="num mono">{num(j.defesas)}</td> : null}
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

/** Os dois blocos, como aparecem no resumo do jogo. */
export default function RelatorioPosJogo({ state, ligados, ourName, opponentName }) {
  const t = useT();
  const linhas = espelhoDoJogo(state, { ligados });
  const individual = desempenhoIndividual(state, { ligados });
  return (
    <>
      <h2 className="section">{t('relatorio.espelhoTitulo', { nos: ourName, eles: opponentName })}</h2>
      <div className="card">
        <TabelaEspelho linhas={linhas} ourName={ourName} opponentName={opponentName} />
        {linhas.some((l) => l.id === 'remates') ? (
          <p className="muted small espelho__nota">{t('relatorio.notaRemates')}</p>
        ) : null}
      </div>
      <h2 className="section">{t('relatorio.individualTitulo')}</h2>
      <TabelaIndividual dados={individual} />
    </>
  );
}
