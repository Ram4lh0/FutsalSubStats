'use client';

// components/treino/EstatisticasPresencas.jsx — a assiduidade do escalão.
//
// Quatro cartões (época, últimos 30, 14 e 7 dias) e uma tabela por jogador.
// Tocar num cartão escolhe o período da tabela e abre o detalhe: quem faltou,
// por tipo de falta e com as datas, e quem foi a todos.
// As faltas injustificadas aparecem à parte e a vermelho porque são
// as que o treinador quer ver de relance; justificadas e lesões contam-se,
// mas não se pintam.
//
// Só contam treinos que já aconteceram, não cancelados, e com presenças
// marcadas — um treino de ontem sem ninguém marcado não é "toda a gente
// faltou".

import { useMemo, useState } from 'react';
import { StatCard, Empty } from '@/components/bits.jsx';
import DataTable from '@/components/DataTable.jsx';
import LegendaPresencas from './LegendaPresencas.jsx';
import { PRESENCA, deIsoDia, detalhePresencas, estatisticasPresencas, periodosDePresenca } from '@/domain/treino.js';
import { useUI, Dialog } from '@/lib/ui.jsx';
import { useLocale, useT } from '@/lib/i18n/index.js';

const LIMITE_BAIXO = 70;

const pct = (v) => (v == null ? '—' : `${v}%`);

export default function EstatisticasPresencas({ treinos, presencas, jogadores, hoje }) {
  const t = useT();
  const ui = useUI();
  const [periodo, setPeriodo] = useState('epoca');
  const [ordem, setOrdem] = useState('assiduidade');

  const periodos = useMemo(() => periodosDePresenca(hoje), [hoje]);
  const contas = useMemo(() => {
    const saida = {};
    for (const [chave, p] of Object.entries(periodos)) {
      saida[chave] = estatisticasPresencas({ treinos, presencas, de: p.de, ate: p.ate });
    }
    return saida;
  }, [treinos, presencas, periodos]);

  const atual = contas[periodo];

  const linhas = useMemo(() => {
    const lista = jogadores
      .map((j) => ({ jogador: j, s: atual.porJogador.get(j.id) }))
      .filter((l) => l.s || l.jogador.isActive !== false);
    const valor = (l) => {
      if (ordem === 'numero') return Number(l.jogador.shirtNumber) || 999;
      if (ordem === 'faltas') return -(l.s?.[PRESENCA.FALTA_INJUSTIFICADA] || 0);
      return l.s?.assiduidade ?? 101;
    };
    return lista.sort((a, b) => valor(a) - valor(b) || (a.jogador.name || '').localeCompare(b.jogador.name || ''));
  }, [jogadores, atual, ordem]);

  const cartao = (chave, rotulo) => {
    const c = contas[chave];
    return (
      <StatCard
        key={chave}
        label={rotulo}
        value={pct(c.assiduidade)}
        hint={t(c.treinos === 1 ? 'treino.cartaoHintUm' : 'treino.cartaoHint', {
          treinos: c.treinos,
          fi: c.equipa[PRESENCA.FALTA_INJUSTIFICADA],
          fj: c.equipa[PRESENCA.FALTA_JUSTIFICADA],
          l: c.equipa[PRESENCA.LESAO],
        })}
        kind={chave === periodo ? 'win' : undefined}
        onClick={() => {
          setPeriodo(chave);
          const p = periodos[chave];
          const detalhe = detalhePresencas({ treinos, presencas, de: p.de, ate: p.ate });
          ui.open((close) => (
            <DetalhePeriodo
              titulo={rotulo}
              contas={c}
              detalhe={detalhe}
              jogadores={jogadores}
              onFechar={close}
            />
          ));
        }}
      />
    );
  };

  return (
    <section className="tpres">
      <h2 className="section">{t('treino.presencas')}</h2>
      <div className="grid grid--stats">
        {cartao('epoca', t('treino.periodo.epoca'))}
        {cartao('mes', t('treino.periodo.mes'))}
        {cartao('quinzena', t('treino.periodo.quinzena'))}
        {cartao('semana', t('treino.periodo.semana'))}
      </div>
      <LegendaPresencas />
      <p className="muted tpres__nota">{t('treino.tocaNoCartao')}</p>

      {atual.treinos === 0 ? (
        <Empty>{t('treino.semPresencasNoPeriodo')}</Empty>
      ) : (
        <>
          <div className="tpres__barra">
            <span className="muted">
              {t(atual.treinos === 1 ? 'treino.tabelaDeUm' : 'treino.tabelaDe', {
                periodo: t(`treino.periodo.${periodo}`),
                n: atual.treinos,
              })}
            </span>
            <span className="toolbar__spacer" />
            <label className="tpres__ordem">
              <span className="muted">{t('treino.ordenar')}</span>
              <select className="input input--tiny" value={ordem} onChange={(e) => setOrdem(e.target.value)}>
                <option value="assiduidade">{t('treino.ordem.assiduidade')}</option>
                <option value="faltas">{t('treino.ordem.faltas')}</option>
                <option value="numero">{t('treino.ordem.numero')}</option>
              </select>
            </label>
          </div>
          <DataTable players>
            <thead>
              <tr>
                <th>{t('stats.numero')}</th>
                <th>{t('stats.jogador')}</th>
                <th className="num">{t('treino.colAssiduidade')}</th>
                <th className="num" title={t('treino.presenca.PRESENTE')}>{t('treino.curto.PRESENTE')}</th>
                <th className="num" title={t('treino.presenca.FALTA_INJUSTIFICADA')}>{t('treino.curto.FALTA_INJUSTIFICADA')}</th>
                <th className="num" title={t('treino.presenca.FALTA_JUSTIFICADA')}>{t('treino.curto.FALTA_JUSTIFICADA')}</th>
                <th className="num" title={t('treino.presenca.LESAO')}>{t('treino.curto.LESAO')}</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ jogador, s }) => (
                <tr key={jogador.id}>
                  <td>{jogador.shirtNumber ?? ''}</td>
                  <td>{jogador.name}</td>
                  <td className={`num ${s?.assiduidade != null && s.assiduidade < LIMITE_BAIXO ? 'tpres__baixo' : ''}`}>
                    <strong>{pct(s?.assiduidade)}</strong>
                  </td>
                  <td className="num">{s?.[PRESENCA.PRESENTE] ?? 0}</td>
                  <td className={`num ${s?.[PRESENCA.FALTA_INJUSTIFICADA] ? 'tpres__fi' : ''}`}>
                    {s?.[PRESENCA.FALTA_INJUSTIFICADA] ?? 0}
                  </td>
                  <td className="num">{s?.[PRESENCA.FALTA_JUSTIFICADA] ?? 0}</td>
                  <td className="num">{s?.[PRESENCA.LESAO] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <p className="muted tpres__nota">{t('treino.notaAssiduidade', { limite: LIMITE_BAIXO })}</p>
        </>
      )}
    </section>
  );
}

const ORDEM_FALTAS = [PRESENCA.FALTA_INJUSTIFICADA, PRESENCA.FALTA_JUSTIFICADA, PRESENCA.LESAO];

/** O detalhe de um período: quem faltou, por tipo, e quem foi sempre. */
function DetalhePeriodo({ titulo, contas, detalhe, jogadores, onFechar }) {
  const t = useT();
  const locale = useLocale();
  const porId = new Map(jogadores.map((j) => [j.id, j]));
  const nome = (id) => {
    const j = porId.get(id);
    return j ? `${j.shirtNumber != null ? `${j.shirtNumber} · ` : ''}${j.name}` : '—';
  };
  const dia = (d) => deIsoDia(d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  const semFaltas = ORDEM_FALTAS.every((e) => !detalhe.faltas[e].length);

  return (
    <Dialog title={t('treino.detalheTitulo', { periodo: titulo })} onClose={() => onFechar()}>
      {detalhe.treinos === 0 ? (
        <p className="modal__text">{t('treino.semPresencasNoPeriodo')}</p>
      ) : (
        <div className="tdet">
          <p className="muted">
            {t(detalhe.treinos === 1 ? 'treino.detalheResumoUm' : 'treino.detalheResumo', {
              n: detalhe.treinos,
              pct: contas.assiduidade ?? '—',
            })}
          </p>
          {semFaltas ? <p className="tdet__ok">{t('treino.semFaltas')}</p> : null}
          {ORDEM_FALTAS.map((e) =>
            detalhe.faltas[e].length ? (
              <section key={e} className={`tdet__grupo tdet__grupo--${e}`}>
                <h3 className="tdet__titulo">
                  {t(`treino.presenca.${e}`)} <span className="muted">({detalhe.faltas[e].length})</span>
                </h3>
                <ul className="tdet__lista">
                  {detalhe.faltas[e].map((f) => (
                    <li key={f.playerId}>
                      <span className="tdet__nome">{nome(f.playerId)}</span>
                      <strong className="tdet__n">{f.datas.length}×</strong>
                      <span className="muted tdet__datas">{f.datas.map(dia).join(', ')}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null
          )}
          {detalhe.sempre.length ? (
            <section className="tdet__grupo tdet__grupo--PRESENTE">
              <h3 className="tdet__titulo">
                {t('treino.sempre')} <span className="muted">({detalhe.sempre.length})</span>
              </h3>
              <p className="tdet__sempre">{detalhe.sempre.map(nome).join(' · ')}</p>
            </section>
          ) : null}
        </div>
      )}
      <footer className="modal__actions">
        <button className="btn btn--primary" onClick={() => onFechar()}>
          {t('comum.fechar')}
        </button>
      </footer>
    </Dialog>
  );
}
