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
import MapasCalorRemates from './MapasCalorRemates.jsx';
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
const NO_MAPA = [REGISTO.REMATE, REGISTO.REMATE_ADV, REGISTO.RECUPERACAO, REGISTO.PERDA_BOLA, REGISTO.DEFESA_GR, REGISTO.LANCAMENTO_GR, REGISTO.FORA];

export default function PainelRegistos({ state, ourName, opponentName, now }) {
  const r = resumoRegistos(state, now);
  // Só os registos com pontos no campo: sem zona (opção do escalão) não há mapa.
  const filtros = NO_MAPA.filter((id) => r.tipos.has(id) && marcadores(state, { registos: [id] }).length);
  const [escolhido, setFiltro] = useState(null);
  const [jogador, setJogador] = useState(null);
  const filtro = filtros.includes(escolhido) ? escolhido : filtros[0] || null;

  if (!r.total) return <p className="muted">{t('registos.nadaApontado')}</p>;

  const tem = (id) => r.tipos.has(id);
  const calorNos = marcadores(state, { registos: [REGISTO.REMATE] });
  const calorEles = marcadores(state, { registos: [REGISTO.REMATE_ADV] });
  // Só remates: o mapa dos remates (com legenda que filtra) já os mostra, e o
  // campo de cima ficava repetido, com um único botão "Remates".
  const soRemates =
    filtros.length > 0 &&
    filtros.every((f) => f === REGISTO.REMATE || f === REGISTO.REMATE_ADV) &&
    (calorNos.length > 0 || calorEles.length > 0) &&
    !jogador;
  const marcas = filtro
    ? marcadores(state, { registos: [filtro] }).filter((m) => !jogador || m.playerId === jogador)
    : [];
  const porJogador = r.jogadores.some(
    (j) => j.remates || j.recuperacoes || j.defesas || j.lancamentosGR || j.perdas || j.passes || j.positivas || j.negativas
  );
  // "À baliza" só quer dizer alguma coisa se todos os remates tiverem resultado
  // (o escalão pode não o pedir).
  const rematesComTudo = r.remates > 0 && r.rematesComResultado === r.remates;
  const advComTudo = r.rematesAdv > 0 && r.rematesAdvComResultado === r.rematesAdv;
  const golosEm = (b) => t('registos.golosEm', { golos: b.golos, total: b.total });

  return (
    <div className="regpainel">
      <div className="regpainel__totais">
        {tem(REGISTO.REMATE) ? (
          <Total
            rotulo={t('registos.total.remate')}
            valor={r.remates}
            extra={rematesComTudo ? t('registos.aBalizaDe', { n: r.rematesBaliza, total: r.remates }) : null}
          />
        ) : null}
        {tem(REGISTO.REMATE_ADV) ? (
          <Total
            rotulo={t('registos.total.remate_adv')}
            valor={r.rematesAdv}
            extra={advComTudo ? t('registos.aBalizaDe', { n: r.rematesAdvBaliza, total: r.rematesAdv }) : null}
          />
        ) : null}
        {tem(REGISTO.REMATE_ADV_SIMPLES) ? (
          <Total rotulo={t('registos.total.remate_adv_simples')} valor={r.rematesAdvSimples} />
        ) : null}
        {tem(REGISTO.RECUPERACAO) ? (
          <Total rotulo={t('registos.total.recuperacao')} valor={r.recuperacoes} />
        ) : null}
        {tem(REGISTO.DEFESA_GR) ? <Total rotulo={t('registos.total.defesa_gr')} valor={r.defesas} /> : null}
        {tem(REGISTO.LANCAMENTO_GR) ? (
          <Total rotulo={t('registos.total.lancamento_gr')} valor={r.lancamentosGR} />
        ) : null}
        {tem(REGISTO.PERDA_BOLA) ? <Total rotulo={t('registos.total.perda_bola')} valor={r.perdas} /> : null}
        {tem(REGISTO.PASSE_FALHADO) ? (
          <Total rotulo={t('registos.total.passe_falhado')} valor={r.passes} />
        ) : null}
        {tem(REGISTO.PENALTI) ? (
          <Total rotulo={t('registos.total.penalti')} valor={r.penaltis.total} extra={golosEm(r.penaltis)} />
        ) : null}
        {tem(REGISTO.PENALTI_ADV) ? (
          <Total rotulo={t('registos.total.penalti_adv')} valor={r.penaltisAdv.total} extra={golosEm(r.penaltisAdv)} />
        ) : null}
        {tem(REGISTO.LIVRE_10M) ? (
          <Total
            rotulo={t('registos.total.livre_10m')}
            valor={`${r.livres10.US.golos}/${r.livres10.US.total} – ${r.livres10.THEM.golos}/${r.livres10.THEM.total}`}
            extra={`${ourName} – ${opponentName}`}
          />
        ) : null}
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
            extra={
              r.golosCanto.US || r.golosCanto.THEM
                ? `${ourName} – ${opponentName} · ${t('registos.bp.golosCanto')}: ${r.golosCanto.US} – ${r.golosCanto.THEM}`
                : `${ourName} – ${opponentName}`
            }
          />
        ) : null}
        {tem(REGISTO.LANCAMENTO_BALIZA) ? (
          <Total
            rotulo={t('registos.total.lancamento_baliza')}
            valor={`${r.lancamentos.US} – ${r.lancamentos.THEM}`}
            extra={`${ourName} – ${opponentName}`}
          />
        ) : null}
        {tem(REGISTO.ACAO) ? (
          <Total rotulo={t('registos.total.acao')} valor={`+${r.acoes.positivas} / −${r.acoes.negativas}`} />
        ) : null}
      </div>

      {r.rematesComResultado && !soRemates ? (
        <div className="regpainel__legenda">
          {Object.values(RESULTADO_REMATE).map((o) => (
            <span key={o} className="regpainel__item" style={{ '--cor': COR_RESULTADO[o] }}>
              <span className="regzona__bola" /> {t(`registos.resultado.${o}`)} <strong>{r.porResultado[o]}</strong>
            </span>
          ))}
        </div>
      ) : null}

      {filtros.length && !soRemates ? (
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

      {calorNos.length || calorEles.length ? (
        <div className="regpainel__calor">
          <h4 className="regpainel__subtitulo">{t('registos.calor.titulo')}</h4>
          <MapasCalorRemates
            nossos={calorNos}
            deles={calorEles}
            rotuloNos={ourName || t('registos.calor.nos')}
            rotuloEles={opponentName || t('registos.calor.eles')}
          />
        </div>
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
                {tem(REGISTO.LANCAMENTO_GR) ? <th>{t('registos.col.lancamentosGR')}</th> : null}
                {tem(REGISTO.PERDA_BOLA) ? (
                  <>
                    <th>{t('registos.col.perdas')}</th>
                    <th title={t('registos.col.perdas10Titulo')}>{t('registos.col.perdas10')}</th>
                  </>
                ) : null}
                {tem(REGISTO.PASSE_FALHADO) ? (
                  <>
                    <th>{t('registos.col.passes')}</th>
                    <th title={t('registos.col.passes10Titulo')}>{t('registos.col.passes10')}</th>
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
                      <td>{j.remates && rematesComTudo ? j.rematesBaliza : '–'}</td>
                    </>
                  ) : null}
                  {tem(REGISTO.RECUPERACAO) ? (
                    <>
                      <td>{j.recuperacoes || '–'}</td>
                      <td>{j.recup10 == null ? '–' : j.recup10.toFixed(1)}</td>
                    </>
                  ) : null}
                  {tem(REGISTO.DEFESA_GR) ? <td>{j.defesas || '–'}</td> : null}
                  {tem(REGISTO.LANCAMENTO_GR) ? <td>{j.lancamentosGR || '–'}</td> : null}
                  {tem(REGISTO.PERDA_BOLA) ? (
                    <>
                      <td>{j.perdas || '–'}</td>
                      <td>{j.perdas10 == null ? '–' : j.perdas10.toFixed(1)}</td>
                    </>
                  ) : null}
                  {tem(REGISTO.PASSE_FALHADO) ? (
                    <>
                      <td>{j.passes || '–'}</td>
                      <td>{j.passes10 == null ? '–' : j.passes10.toFixed(1)}</td>
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
        : filtro === REGISTO.LANCAMENTO_GR
        ? [[COR_REGISTO.lancamento_gr, t('registos.legenda.lancamentosGR')]]
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
