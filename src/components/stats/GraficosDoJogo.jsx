'use client';

// components/stats/GraficosDoJogo.jsx — os gráficos de um só jogo.
//
// Nasceram no intervalo e passaram a servir também o resumo do jogo: os mesmos
// blocos, pela mesma ordem, para o treinador não ter de reaprender a ler a
// mesma coisa em dois ecrãs. Quem os põe decide só o invólucro de cada bloco
// (`classeBloco`) e se quer os golos por período — que no intervalo não fazem
// sentido, porque o que lá está é meia parte e a cronologia dos golos mesmo
// por cima.

import { useT } from '@/lib/i18n/index.js';
import { fmt } from '@/domain/clock.js';
import { MATCH_STATUS } from '@/domain/constants.js';
import { golosPorFaixa } from '@/domain/dashboard.js';
import {
  amarelosAdversario,
  faltasPorJogador,
  golosPorTipoNoJogo,
  mediaEmCampo,
} from '@/domain/intervalo.js';
import { BarrasH, ColunasEspelhadas, Pizza } from '@/components/stats/graficos.jsx';

/**
 * @param {object}  state         estado do jogo (reconstruído dos eventos)
 * @param {array}   linhas        `playerMatchStats` de cada convocado
 * @param {string}  classeBloco   classe do invólucro de cada bloco
 * @param {number}  [parteMs]     duração de uma parte; com ela aparecem os golos por período
 */
export default function GraficosDoJogo({ state, linhas, classeBloco, parteMs = null }) {
  const t = useT();

  const porMinutos = [...linhas].sort((a, b) => b.courtMs - a.courtMs);
  const media = mediaEmCampo(linhas);
  const faltas = faltasPorJogador(linhas);
  const amarelos = amarelosAdversario(state);
  const tiposMarcados = golosPorTipoNoJogo(state, 'US');
  const tiposSofridos = golosPorTipoNoJogo(state, 'THEM');
  const haTiposDeGolo = [...tiposMarcados, ...tiposSofridos].some((f) => f.valor > 0);
  const comRotulo = (fatias) => fatias.map((f) => ({ ...f, rotulo: t(`golos.tipo.${f.chave}`) }));

  // As contas por faixa são as do painel da época, que só lê jogos terminados.
  // Aqui o jogo pode ainda estar a decorrer — os golos que já houve contam na
  // mesma — e por isso entra marcado como terminado só para esta leitura.
  const faixas = parteMs
    ? golosPorFaixa([{ state: { ...state, status: MATCH_STATUS.FINISHED } }], { parteMs })
    : null;
  const etiquetas = faixas ? faixas.primeira.map((f) => `${Math.round(f.deMs / 60_000)}'`) : [];

  return (
    <>
      {faixas?.comDados ? (
        <div className={classeBloco}>
          <h3 className="section section--tight">{t('painelv.quando')}</h3>
          <div className="painelv__partes">
            <div>
              <h4 className="painelv__parte">{t('painelv.primeiraParte')}</h4>
              <ColunasEspelhadas faixas={faixas.primeira} etiquetas={etiquetas} />
            </div>
            <div>
              <h4 className="painelv__parte">{t('painelv.segundaParte')}</h4>
              <ColunasEspelhadas faixas={faixas.segunda} etiquetas={etiquetas} />
            </div>
            <p className="legenda">
              <span className="legenda__cor legenda__cor--marcados" /> {t('painelv.marcados')}
              <span className="legenda__cor legenda__cor--sofridos" /> {t('painelv.sofridos')}
            </p>
          </div>
        </div>
      ) : null}

      <div className={classeBloco}>
        <h3 className="section section--tight">{t('intervalo.minutos')}</h3>
        <BarrasH
          linhas={porMinutos.map((l) => ({
            rotulo: `#${l.number} ${l.name}`,
            valor: l.courtMs,
            texto: fmt(l.courtMs),
          }))}
          referencia={media}
          rotuloReferencia={t('intervalo.mediaMinutos', { tempo: fmt(Math.round(media)) })}
        />
      </div>

      <div className={classeBloco}>
        <h3 className="section section--tight">{t('intervalo.faltasJogador')}</h3>
        {faltas.length ? (
          <>
            <BarrasH
              linhas={faltas.map((f) => ({
                rotulo: `#${f.number} ${f.name}`,
                valor: f.fouls,
                texto: String(f.fouls),
                alerta: f.emRisco,
              }))}
            />
            {faltas.some((f) => f.emRisco) ? (
              <p className="barras__legenda">{t('intervalo.faltasEmRisco')}</p>
            ) : null}
          </>
        ) : (
          <p className="muted">{t('intervalo.semFaltas')}</p>
        )}
      </div>

      {/* Só aparece se houver: um bloco vazio a dizer «sem cartões» gastava o
          espaço de um ecrã onde se está a deslizar à procura de outra coisa. */}
      {amarelos.length ? (
        <div className={classeBloco}>
          <h3 className="section section--tight">{t('intervalo.amarelosAdversario')}</h3>
          <ul className="adv-cartoes">
            {amarelos.map((a) => (
              <li
                key={a.number}
                className={`adv-cartoes__item ${a.expulso ? 'is-expulso' : 'is-amarelo'}`}
              >
                <span className="adv-cartoes__numero mono">#{a.number}</span>
                <span className="adv-cartoes__texto">
                  {a.expulso
                    ? t('intervalo.advExpulso', { tempo: fmt(a.amarelosMs[a.amarelosMs.length - 1]) })
                    : t('intervalo.advAmarelo', { tempo: fmt(a.amarelosMs[0]) })}
                </span>
              </li>
            ))}
          </ul>
          {amarelos.some((a) => !a.expulso) && state.status !== MATCH_STATUS.FINISHED ? (
            <p className="barras__legenda">{t('intervalo.advDica')}</p>
          ) : null}
        </div>
      ) : null}

      <div className={classeBloco}>
        <h3 className="section section--tight">{t('intervalo.tiposDeGolo')}</h3>
        {haTiposDeGolo ? (
          <div className="graf-jogo__pizzas">
            <div>
              <h4 className="graf-jogo__sub">{t('painelv.marcados')}</h4>
              <Pizza titulo={t('painelv.tiposDeGolo')} fatias={comRotulo(tiposMarcados)} />
            </div>
            <div>
              <h4 className="graf-jogo__sub">{t('painelv.sofridos')}</h4>
              <Pizza titulo={t('painelv.tiposDeGoloSofrido')} fatias={comRotulo(tiposSofridos)} />
            </div>
          </div>
        ) : (
          <p className="muted">{t('painelv.semGolosClassificados')}</p>
        )}
      </div>
    </>
  );
}
