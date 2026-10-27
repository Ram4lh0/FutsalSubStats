'use client';

// components/registos/PainelRegistos.jsx — as estatísticas avançadas de um
// jogo: totais, mapa no campo e tabela por jogador. Usado no jogo ao vivo
// (numa janela), no intervalo e no resumo.
//
// O que aparece decide-se pelos eventos do jogo, não pela config do escalão:
// um bloco só se mostra se o jogo tiver registos desse tipo. Desligar um
// registo a meio da época não esconde o que já foi feito.

import { useState } from 'react';
import { Dialog } from '@/lib/ui.jsx';
import { CampoSvg } from './CampoToque.jsx';
import {
  COR_REGISTO,
  COR_RESULTADO,
  COR_RESULTADO_ADV,
  REGISTO,
  RESULTADO_REMATE,
  marcadores,
  resumoRegistos,
} from '@/domain/registos.js';
import { fmt } from '@/domain/clock.js';
import { t } from '@/lib/i18n/index.js';

/** Os registos com ponto no campo, pela ordem dos filtros do mapa. */
const NO_MAPA = [REGISTO.REMATE, REGISTO.REMATE_ADV, REGISTO.RECUPERACAO, REGISTO.DEFESA_GR, REGISTO.FORA];

export default function PainelRegistos({ state, ourName, opponentName, now }) {
  const r = resumoRegistos(state, now);
  const filtros = NO_MAPA.filter((id) => r.tipos.has(id));
  const [escolhido, setFiltro] = useState(null);
  const [jogador, setJogador] = useState(null);
  const filtro = filtros.includes(escolhido) ? escolhido : filtros[0] || null;

  if (!r.total) return <p className="muted">{t('registos.nadaApontado')}</p>;

  const tem = (id) => r.tipos.has(id);
  const marcas = filtro
    ? marcadores(state, { registos: [filtro] }).filter((m) => !jogador || m.playerId === jogador)
    : [];
  const porJogador = r.jogadores.some(
    (j) => j.remates || j.recuperacoes || j.defesas || j.perdas || j.positivas || j.negativas
  );

  return (
    <div className="regpainel">
      <div className="regpainel__totais">
        {tem(REGISTO.REMATE) ? (
          <Total
            rotulo={t('registos.total.remate')}
            valor={r.remates}
            extra={t('registos.aBalizaDe', { n: r.rematesBaliza, total: r.remates })}
          />
        ) : null}
        {tem(REGISTO.REMATE_ADV) ? (
          <Total
            rotulo={t('registos.total.remate_adv')}
            valor={r.rematesAdv}
            extra={t('registos.aBalizaDe', { n: r.rematesAdvBaliza, total: r.rematesAdv })}
          />
        ) : null}
        {tem(REGISTO.RECUPERACAO) ? (
          <Total rotulo={t('registos.total.recuperacao')} valor={r.recuperacoes} />
        ) : null}
        {tem(REGISTO.DEFESA_GR) ? <Total rotulo={t('registos.total.defesa_gr')} valor={r.defesas} /> : null}
        {tem(REGISTO.PERDA_BOLA) ? <Total rotulo={t('registos.total.perda_bola')} valor={r.perdas} /> : null}
        {tem(REGISTO.FORA) ? (
          <Total
            rotulo={t('registos.total.fora')}
            valor={`${r.foras.US} – ${r.foras.THEM}`}
            extra={`${ourName} – ${opponentName}`}
          />
        ) : null}
        {tem(REGISTO.CANTO) ? (
          <Total
            rotulo={t('registos.total.canto')}
            valor={`${r.cantos.US} – ${r.cantos.THEM}`}
            extra={`${ourName} – ${opponentName}`}
          />
        ) : null}
        {tem(REGISTO.ACAO) ? (
          <Total rotulo={t('registos.total.acao')} valor={`+${r.acoes.positivas} / −${r.acoes.negativas}`} />
        ) : null}
      </div>

      {r.remates ? (
        <div className="regpainel__legenda">
          {Object.values(RESULTADO_REMATE).map((o) => (
            <span key={o} className="regpainel__item" style={{ '--cor': COR_RESULTADO[o] }}>
              <span className="regzona__bola" /> {t(`registos.resultado.${o}`)} <strong>{r.porResultado[o]}</strong>
            </span>
          ))}
        </div>
      ) : null}

      {filtros.length ? (
        <>
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
            {jogador ? (
              <button type="button" className="regzona__opcao is-on" onClick={() => setJogador(null)}>
                #{state.players[jogador]?.number} {state.players[jogador]?.name} ✕
              </button>
            ) : null}
          </div>
          <div className="regpainel__mapa">
            <CampoSvg markers={marcas} />
          </div>
          <Legenda filtro={filtro} r={r} />
        </>
      ) : null}

      {porJogador ? (
        <div className="regpainel__tabela">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('registos.col.jogador')}</th>
                <th>{t('registos.col.tempo')}</th>
                {tem(REGISTO.REMATE) ? (
                  <>
                    <th>{t('registos.col.remates')}</th>
                    <th>{t('registos.col.aBaliza')}</th>
                  </>
                ) : null}
                {tem(REGISTO.RECUPERACAO) ? (
                  <>
                    <th>{t('registos.col.recuperacoes')}</th>
                    <th title={t('registos.col.recup10Titulo')}>{t('registos.col.recup10')}</th>
                  </>
                ) : null}
                {tem(REGISTO.DEFESA_GR) ? <th>{t('registos.col.defesas')}</th> : null}
                {tem(REGISTO.PERDA_BOLA) ? (
                  <>
                    <th>{t('registos.col.perdas')}</th>
                    <th title={t('registos.col.perdas10Titulo')}>{t('registos.col.perdas10')}</th>
                  </>
                ) : null}
                {tem(REGISTO.ACAO) ? <th>{t('registos.col.acoes')}</th> : null}
              </tr>
            </thead>
            <tbody>
              {r.jogadores.map((j) => (
                <tr
                  key={j.playerId}
                  className={`regpainel__linha ${jogador === j.playerId ? 'is-on' : ''}`}
                  onClick={() => setJogador(jogador === j.playerId ? null : j.playerId)}
                >
                  <td>{j.number}</td>
                  <td>{j.name}</td>
                  <td>{fmt(j.courtMs)}</td>
                  {tem(REGISTO.REMATE) ? (
                    <>
                      <td>{j.remates || '–'}</td>
                      <td>{j.remates ? j.rematesBaliza : '–'}</td>
                    </>
                  ) : null}
                  {tem(REGISTO.RECUPERACAO) ? (
                    <>
                      <td>{j.recuperacoes || '–'}</td>
                      <td>{j.recup10 == null ? '–' : j.recup10.toFixed(1)}</td>
                    </>
                  ) : null}
                  {tem(REGISTO.DEFESA_GR) ? <td>{j.defesas || '–'}</td> : null}
                  {tem(REGISTO.PERDA_BOLA) ? (
                    <>
                      <td>{j.perdas || '–'}</td>
                      <td>{j.perdas10 == null ? '–' : j.perdas10.toFixed(1)}</td>
                    </>
                  ) : null}
                  {tem(REGISTO.ACAO) ? (
                    <td>{j.positivas || j.negativas ? `+${j.positivas} / −${j.negativas}` : '–'}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {filtros.length ? <p className="muted regpainel__nota">{t('registos.tabelaNota')}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Abrir o painel numa janela (botão "Ver estatísticas" do jogo ao vivo). */
export function abrirPainelRegistos(ui, { state, ourName, opponentName }) {
  return ui.open((close) => (
    <Dialog title={t('registos.titulo')} onClose={() => close(null)} wide>
      <PainelRegistos state={state} ourName={ourName} opponentName={opponentName} />
    </Dialog>
  ));
}

function Total({ rotulo, valor, extra = null }) {
  return (
    <div className="regpainel__total">
      <span className="regpainel__totalRot">{rotulo}</span>
      <strong className="regpainel__totalVal">{valor}</strong>
      {extra ? <span className="regpainel__totalExtra">{extra}</span> : null}
    </div>
  );
}

function Legenda({ filtro, r }) {
  // Nos remates as cores já estão nos contadores de cima.
  if (!filtro || filtro === REGISTO.REMATE) return null;
  // Nos do adversário, o mesmo código de cores, com as contagens deles.
  if (filtro === REGISTO.REMATE_ADV) {
    return (
      <div className="regpainel__legenda">
        {Object.values(RESULTADO_REMATE).map((o) => (
          <span key={o} className="regpainel__item regpainel__item--anel" style={{ '--cor': COR_RESULTADO_ADV[o] }}>
            <span className="regzona__bola" /> {t(`registos.resultadoAdv.${o}`)}{' '}
            <strong>{r?.porResultadoAdv?.[o] ?? 0}</strong>
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
