'use client';

// components/registos/MapasCalorRemates.jsx — os remates em dois campos: um
// para os nossos e outro para os do adversário, lado a lado.
//
// Cada remate é um ponto onde foi marcado, com a cor do que aconteceu (os do
// adversário em anel, como no resto da app). Só aparece o campo de quem tiver
// remates com sítio marcado (o escalão pode não pedir a zona).
//
// Se houver remates com "o que aconteceu", dá para ver só os que foram à
// baliza ou só os golos.

import { useMemo, useState } from 'react';
import { CampoSvg } from './CampoToque.jsx';
import { LegendaMapa } from './ExtrasRegistos.jsx';
import { A_BALIZA, REGISTO, RESULTADO_REMATE } from '@/domain/registos.js';
import { useT } from '@/lib/i18n/index.js';

const FILTROS = {
  todos: () => true,
  baliza: (p) => A_BALIZA.has(p.resultado),
  golos: (p) => p.resultado === RESULTADO_REMATE.GOLO,
};

/**
 * `nossos` e `deles`: os pontos dos remates (de `marcadores`/`mapaDaEpoca`).
 * `rotuloNos`/`rotuloEles`: o título de cada campo.
 */
export default function MapasCalorRemates({ nossos = [], deles = [], rotuloNos, rotuloEles }) {
  const t = useT();
  const [filtro, setFiltro] = useState('todos');
  const comResultado = useMemo(() => [...nossos, ...deles].some((p) => p.resultado), [nossos, deles]);
  const f = comResultado ? FILTROS[filtro] : FILTROS.todos;
  const nos = useMemo(() => nossos.filter(f), [nossos, f]);
  const eles = useMemo(() => deles.filter(f), [deles, f]);

  if (!nossos.length && !deles.length) return null;

  return (
    <div className="regcalor">
      {comResultado ? (
        <div className="regpainel__filtros">
          {Object.keys(FILTROS).map((id) => (
            <button
              key={id}
              type="button"
              className={`regzona__opcao ${filtro === id ? 'is-on' : ''}`}
              onClick={() => setFiltro(id)}
            >
              {t(`registos.calor.filtro.${id}`)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="regcalor__campos">
        {nossos.length ? (
          <Campo titulo={rotuloNos} pontos={nos} registo={REGISTO.REMATE} legenda={comResultado} />
        ) : null}
        {deles.length ? (
          <Campo titulo={rotuloEles} pontos={eles} registo={REGISTO.REMATE_ADV} legenda={comResultado} />
        ) : null}
      </div>
      <p className="muted small">{t('registos.calor.nota')}</p>
    </div>
  );
}

function Campo({ titulo, pontos, registo, legenda }) {
  const t = useT();
  const adv = registo === REGISTO.REMATE_ADV;
  const golos = pontos.filter((p) => p.resultado === RESULTADO_REMATE.GOLO).length;
  return (
    <figure className="regcalor__campo">
      <figcaption className="regcalor__titulo">
        {titulo}
        <span className="regcalor__conta">
          {t(adv ? 'registos.calor.contaAdv' : 'registos.calor.conta', { n: pontos.length, golos })}
        </span>
      </figcaption>
      <div className="regpainel__mapa">
        <CampoSvg markers={pontos} />
      </div>
      {legenda ? <LegendaMapa filtro={registo} /> : null}
    </figure>
  );
}
