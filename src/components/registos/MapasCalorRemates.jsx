'use client';

// components/registos/MapasCalorRemates.jsx — mapa de calor dos remates: um
// campo para os nossos e outro para os do adversário, lado a lado.
//
// Cada zona (5 m × 5 m) fica mais escura quanto mais remates saíram dali, com
// o número escrito por cima. Os nossos a azul (o verde perdia-se no campo),
// os deles a vermelho. Só
// aparece o campo de quem tiver remates com sítio marcado (o escalão pode não
// pedir a zona).
//
// Se houver remates com "o que aconteceu", dá para ver só os que foram à
// baliza ou só os golos.

import { useMemo, useState } from 'react';
import { CampoSvg } from './CampoToque.jsx';
import { A_BALIZA, RESULTADO_REMATE, zonasDeCalor } from '@/domain/registos.js';
import { useT } from '@/lib/i18n/index.js';

const W = 400;
const H = 200;
const COR_NOS = '#38bdf8';
const COR_ELES = '#f43f5e';

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
  const comResultado = useMemo(
    () => [...nossos, ...deles].some((p) => p.resultado),
    [nossos, deles]
  );
  const f = comResultado ? FILTROS[filtro] : FILTROS.todos;
  const nos = useMemo(() => zonasDeCalor(nossos.filter(f)), [nossos, f]);
  const eles = useMemo(() => zonasDeCalor(deles.filter(f)), [deles, f]);

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
          <Campo titulo={rotuloNos} zonas={nos} cor={COR_NOS} adv={false} />
        ) : null}
        {deles.length ? (
          <Campo titulo={rotuloEles} zonas={eles} cor={COR_ELES} adv />
        ) : null}
      </div>
      <p className="muted small">{t('registos.calor.nota')}</p>
    </div>
  );
}

function Campo({ titulo, zonas, cor, adv }) {
  const t = useT();
  const w = W / zonas.colunas;
  const h = H / zonas.linhas;
  const golos = zonas.celulas.reduce((s, c) => s + c.golos, 0);
  return (
    <figure className="regcalor__campo">
      <figcaption className="regcalor__titulo" style={{ '--cor': cor }}>
        <span className="regzona__bola" /> {titulo}
        <span className="regcalor__conta">
          {t(adv ? 'registos.calor.contaAdv' : 'registos.calor.conta', { n: zonas.total, golos })}
        </span>
      </figcaption>
      <div className="regpainel__mapa">
        <CampoSvg>
          <g className="regcalor__zonas" aria-hidden="true">
            {zonas.celulas.map((c) =>
              c.n ? (
                <g key={`${c.col}-${c.lin}`}>
                  <rect
                    x={c.col * w}
                    y={c.lin * h}
                    width={w}
                    height={h}
                    fill={cor}
                    fillOpacity={0.15 + 0.65 * (c.n / zonas.max)}
                  />
                  <text x={c.col * w + w / 2} y={c.lin * h + h / 2} className="regcalor__n">
                    {c.n}
                  </text>
                </g>
              ) : null
            )}
          </g>
        </CampoSvg>
      </div>
    </figure>
  );
}
