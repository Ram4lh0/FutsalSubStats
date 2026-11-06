'use client';

// components/registos/MapasCalorRemates.jsx — os remates em dois campos: um
// para os nossos e outro para os do adversário, lado a lado.
//
// Cada remate é um ponto onde foi marcado, com a cor do que aconteceu (os do
// adversário em anel, como no resto da app). Só aparece o campo de quem tiver
// remates com sítio marcado (o escalão pode não pedir a zona).
//
// A legenda filtra, como num painel de BI: toca-se numa categoria (ex.:
// "Bloqueado") e ficam só esses pontos; tocam-se mais para juntar, outra vez
// para tirar. Sem nada escolhido vê-se tudo. A escolha vale para os dois
// campos ao mesmo tempo ("Defendido" nos nossos é "Defesa do GR" nos deles).

import { useMemo, useState } from 'react';
import { CampoSvg } from './CampoToque.jsx';
import { COR_RESULTADO, COR_RESULTADO_ADV, REGISTO, RESULTADO_REMATE } from '@/domain/registos.js';
import { useT } from '@/lib/i18n/index.js';

const RESULTADOS = Object.values(RESULTADO_REMATE);

/**
 * `nossos` e `deles`: os pontos dos remates (de `marcadores`/`mapaDaEpoca`).
 * `rotuloNos`/`rotuloEles`: o título de cada campo.
 */
export default function MapasCalorRemates({ nossos = [], deles = [], rotuloNos, rotuloEles }) {
  const t = useT();
  const [escolhidos, setEscolhidos] = useState(() => new Set());
  const comResultado = useMemo(() => [...nossos, ...deles].some((p) => p.resultado), [nossos, deles]);

  if (!nossos.length && !deles.length) return null;

  function alternar(o) {
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(o)) novo.delete(o);
      else novo.add(o);
      return novo;
    });
  }
  const props = { escolhidos, alternar, legenda: comResultado };

  return (
    <div className="regcalor">
      {comResultado ? (
        <div className="regcalor__dica">
          <span className="muted small">{t('registos.calor.dica')}</span>
          {escolhidos.size ? (
            <button type="button" className="btn btn--tiny" onClick={() => setEscolhidos(new Set())}>
              {t('registos.calor.limpar')}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="regcalor__campos">
        {nossos.length ? <Campo titulo={rotuloNos} pontos={nossos} registo={REGISTO.REMATE} {...props} /> : null}
        {deles.length ? <Campo titulo={rotuloEles} pontos={deles} registo={REGISTO.REMATE_ADV} {...props} /> : null}
      </div>
      <p className="muted small">{t('registos.calor.nota')}</p>
    </div>
  );
}

function Campo({ titulo, pontos, registo, escolhidos, alternar, legenda }) {
  const t = useT();
  const adv = registo === REGISTO.REMATE_ADV;
  const visiveis = escolhidos.size ? pontos.filter((p) => escolhidos.has(p.resultado)) : pontos;
  const golos = visiveis.filter((p) => p.resultado === RESULTADO_REMATE.GOLO).length;
  const contagem = (o) => pontos.filter((p) => p.resultado === o).length;
  const cores = adv ? COR_RESULTADO_ADV : COR_RESULTADO;
  return (
    <figure className="regcalor__campo">
      <figcaption className="regcalor__titulo">
        {titulo}
        <span className="regcalor__conta">
          {t(adv ? 'registos.calor.contaAdv' : 'registos.calor.conta', { n: visiveis.length, golos })}
        </span>
      </figcaption>
      <div className="regpainel__mapa">
        <CampoSvg markers={visiveis} />
      </div>
      {legenda ? (
        <div className="regpainel__legenda regcalor__legenda">
          {RESULTADOS.map((o) => {
            const on = escolhidos.has(o);
            const apagado = escolhidos.size > 0 && !on;
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                className={`regpainel__item regcalor__cat ${adv ? 'regpainel__item--anel' : ''} ${on ? 'is-on' : ''} ${apagado ? 'is-apagado' : ''}`}
                style={{ '--cor': cores[o] }}
                onClick={() => alternar(o)}
              >
                <span className="regzona__bola" /> {t(`registos.${adv ? 'resultadoAdv' : 'resultado'}.${o}`)}{' '}
                <strong>{contagem(o)}</strong>
              </button>
            );
          })}
        </div>
      ) : null}
    </figure>
  );
}
