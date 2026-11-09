'use client';

// components/registos/ExtrasRegistos.jsx — os registos extra de um jogador ou
// da equipa inteira: a tabela por baixo das estatísticas base, os cartões do
// painel do atleta e a legenda do mapa da época.
//
// Cada linha ou bloco só aparece se houver jogos com esse registo, como no
// resto dos registos: um escalão sem registos não vê nada de novo.

import { useMemo, useState } from 'react';
import { StatCard } from '@/components/bits.jsx';
import DataTable from '@/components/DataTable.jsx';
import { CampoSvg } from './CampoToque.jsx';
import {
  COR_REGISTO,
  COR_RESULTADO,
  COR_RESULTADO_ADV,
  REGISTO,
  RESULTADO_REMATE,
} from '@/domain/registos.js';
import { mapaDoAtleta } from '@/domain/dashboard.js';
import { linhasExtrasAtleta, linhasExtrasEquipa } from '@/lib/registosExtras.js';
import { useT } from '@/lib/i18n/index.js';

const um = (n) => (n == null ? '—' : n.toFixed(1));

/** O que cada cor do mapa quer dizer, para o registo escolhido. */
export function LegendaMapa({ filtro }) {
  const t = useT();
  if (!filtro) return null;
  if (filtro === REGISTO.REMATE || filtro === REGISTO.REMATE_ADV) {
    const adv = filtro === REGISTO.REMATE_ADV;
    return (
      <div className="regpainel__legenda">
        {Object.values(RESULTADO_REMATE).map((o) => (
          <span
            key={o}
            className={`regpainel__item ${adv ? 'regpainel__item--anel' : ''}`}
            style={{ '--cor': (adv ? COR_RESULTADO_ADV : COR_RESULTADO)[o] }}
          >
            <span className="regzona__bola" /> {t(`registos.${adv ? 'resultadoAdv' : 'resultado'}.${o}`)}
          </span>
        ))}
      </div>
    );
  }
  const itens =
    filtro === REGISTO.FORA
      ? [
          [COR_REGISTO.fora_US, t('registos.legenda.forasNossos')],
          [COR_REGISTO.fora_THEM, t('registos.legenda.forasDeles')],
        ]
      : filtro === REGISTO.DEFESA_GR
        ? [[COR_REGISTO.defesa_gr, t('registos.legenda.defesas')]]
        : filtro === REGISTO.PERDA_BOLA
          ? [[COR_REGISTO.perda_bola, t('registos.legenda.perdas')]]
          : [[COR_REGISTO.recuperacao, t('registos.legenda.recuperacoes')]];
  return (
    <div className="regpainel__legenda">
      {itens.map(([cor, txt]) => (
        <span key={txt} className="regpainel__item" style={{ '--cor': cor }}>
          <span className="regzona__bola" /> {txt}
        </span>
      ))}
    </div>
  );
}

/** A tabela por baixo da linha das estatísticas base, na ficha do jogador. */
export function TabelaExtrasAtleta({ extras }) {
  const t = useT();
  const linhas = useMemo(() => linhasExtrasAtleta(extras, t), [extras, t]);
  if (!linhas.length) return null;
  return (
    <>
      <h2 className="section">{t('registos.ext.titulo')}</h2>
      <DataTable>
        <thead>
          <tr>
            <th>{t('registos.ext.registo')}</th>
            <th className="num">{t('registos.ext.total')}</th>
            <th className="num">{t('registos.ext.porJogo')}</th>
            <th className="num">{t('registos.ext.por10')}</th>
            <th>{t('registos.ext.detalhe')}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ id, nome, r, detalhe }) => (
            <tr key={id}>
              <td>{nome}</td>
              <td className="num mono">{r.n}</td>
              <td className="num mono">{um(r.porJogo)}</td>
              <td className="num mono">{um(r.por10)}</td>
              <td className="muted">{detalhe}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <p className="muted small">{t('registos.ext.nota')}</p>
    </>
  );
}

/** Os cartões de cada registo extra, no painel de um atleta. */
export function BlocosExtrasAtleta({ extras, entries, playerId, Bloco }) {
  const t = useT();
  const { por, remates, acoes, penaltis } = extras;
  const tem = (id) => por[id]?.jogos > 0;
  const emJogos = (id) => t('painelv.emJogos', { n: por[id].jogos });

  // O mapa do atleta: remates, recuperações e defesas, que têm ponto no campo.
  const filtros = useMemo(
    () =>
      [REGISTO.REMATE, REGISTO.RECUPERACAO, REGISTO.PERDA_BOLA, REGISTO.DEFESA_GR].filter(
        (id) => por[id]?.jogos > 0 && mapaDoAtleta(entries, id, playerId).length
      ),
    [entries, playerId, por]
  );
  const [escolhido, setFiltro] = useState(null);
  const filtro = filtros.includes(escolhido) ? escolhido : filtros[0] || null;
  const pontos = useMemo(
    () => (filtro ? mapaDoAtleta(entries, filtro, playerId) : []),
    [entries, filtro, playerId]
  );

  // Os cartões "total, por jogo, por 10 min" de um registo simples.
  const simples = (id) =>
    tem(id) && !(id === REGISTO.DEFESA_GR && !por[id].n) ? (
      <Bloco titulo={t(`registos.total.${id}`)}>
        <div className="grid grid--stats">
          <StatCard label={t(`registos.total.${id}`)} value={por[id].n} hint={emJogos(id)} />
          <StatCard label={t('registos.ext.porJogo')} value={um(por[id].porJogo)} />
          <StatCard
            label={t('registos.ext.por10')}
            value={um(por[id].por10)}
            hint={t('registos.ext.por10Titulo')}
          />
        </div>
      </Bloco>
    ) : null;

  return (
    <>
      {tem(REGISTO.REMATE) ? (
        <Bloco titulo={t('registos.total.remate')}>
          <div className="grid grid--stats">
            <StatCard label={t('registos.total.remate')} value={por.remate.n} hint={emJogos('remate')} />
            <StatCard label={t('registos.epoca.rematesPorJogo')} value={um(por.remate.porJogo)} />
            {remates.comResultado ? (
              <>
                <StatCard
                  label={t('registos.col.aBaliza')}
                  value={remates.percentagemBaliza == null ? '—' : `${remates.percentagemBaliza}%`}
                  hint={t('registos.aBalizaDe', { n: remates.aBaliza, total: remates.comResultado })}
                />
                <StatCard
                  label={t('registos.ext.pctGolo')}
                  value={remates.percentagemGolo == null ? '—' : `${remates.percentagemGolo}%`}
                  hint={t('registos.golosEm', { golos: remates.golos, total: remates.comResultado })}
                />
              </>
            ) : null}
          </div>
        </Bloco>
      ) : null}

      {simples(REGISTO.RECUPERACAO)}
      {simples(REGISTO.DEFESA_GR)}
      {simples(REGISTO.PASSE_FALHADO)}

      {tem(REGISTO.ACAO) ? (
        <Bloco titulo={t('registos.total.acao')}>
          <div className="grid grid--stats">
            <StatCard
              label={t('registos.acaoPositiva')}
              value={acoes.positivas}
              kind={acoes.positivas ? 'win' : undefined}
              hint={emJogos('acao')}
            />
            <StatCard
              label={t('registos.acaoNegativa')}
              value={acoes.negativas}
              kind={acoes.negativas ? 'loss' : undefined}
            />
          </div>
        </Bloco>
      ) : null}

      {tem(REGISTO.PENALTI) && por.penalti.n ? (
        <Bloco titulo={t('registos.total.penalti')}>
          <div className="grid grid--stats">
            <StatCard
              label={t('registos.total.penalti')}
              value={`${penaltis.golos}/${por.penalti.n}`}
              hint={t('registos.golosEm', { golos: penaltis.golos, total: por.penalti.n })}
            />
          </div>
        </Bloco>
      ) : null}

      {filtros.length ? (
        <Bloco titulo={t('registos.ext.mapaAtleta')}>
          <div className="regpainel__filtros">
            {filtros.map((f) => (
              <button
                key={f}
                type="button"
                className={`regzona__opcao ${filtro === f ? 'is-on' : ''}`}
                onClick={() => setFiltro(f)}
              >
                {t(`registos.total.${f}`)}
              </button>
            ))}
          </div>
          <div className="regpainel__mapa">
            <CampoSvg markers={pontos} />
          </div>
          <LegendaMapa filtro={filtro} />
          <p className="muted small">{t('registos.epoca.pontos', { n: pontos.length })}</p>
        </Bloco>
      ) : null}
    </>
  );
}

/** A tabela-resumo da equipa: o total de cada registo, por jogo, nós e eles. */
export function TabelaExtrasEquipa({ extras, tipos }) {
  const t = useT();
  const linhas = linhasExtrasEquipa(extras, tipos, t);
  if (!linhas.length) return null;
  return (
    <>
      <DataTable>
        <thead>
          <tr>
            <th>{t('registos.ext.registo')}</th>
            <th className="num">{t('registos.ext.total')}</th>
            <th className="num">{t('registos.ext.porJogo')}</th>
            <th>{t('registos.ext.detalhe')}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ id, total, porJogo, detalhe }) => (
            <tr key={id}>
              <td>{t(`registos.total.${id}`)}</td>
              <td className="num mono">{total}</td>
              <td className="num mono">{um(porJogo)}</td>
              <td className="muted">{detalhe}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <p className="muted small">{t('registos.ext.notaEquipa')}</p>
    </>
  );
}
