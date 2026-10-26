'use client';

// components/registos/CampoToque.jsx — campo de futsal na horizontal, para
// tocar onde aconteceu o lance (ver domain/registos.js).
//
// 40 m × 20 m desenhados a 10 unidades por metro. Atacamos para a direita.

import { useRef, useState } from 'react';
import { Dialog } from '@/lib/ui.jsx';
import { aLinhaLateral } from '@/domain/registos.js';
import { t } from '@/lib/i18n/index.js';

const W = 400;
const H = 200;

/** Área de 6 m do futsal: dois quartos de círculo a partir dos postes, unidos. */
function area(lado) {
  const r = 60;
  const c1 = 100 - 15.8; // centro do arco de cima (poste + metade da linha recta de 3,16 m)
  const c2 = 100 + 15.8;
  if (lado === 'esq') {
    return `M 0 ${c1 - r} A ${r} ${r} 0 0 1 ${r} ${c1} L ${r} ${c2} A ${r} ${r} 0 0 1 0 ${c2 + r}`;
  }
  return `M ${W} ${c1 - r} A ${r} ${r} 0 0 0 ${W - r} ${c1} L ${W - r} ${c2} A ${r} ${r} 0 0 0 ${W} ${c2 + r}`;
}

/** Um ponto no campo: quadrado na defesa, losango no fora, bola no resto. */
function Marca({ m }) {
  const x = m.x * W;
  const y = m.y * H;
  if (m.registo === 'defesa_gr') {
    return <rect x={x - 5} y={y - 5} width={10} height={10} fill={m.cor} />;
  }
  if (m.registo === 'fora') {
    return <path d={`M ${x} ${y - 6} L ${x + 6} ${y} L ${x} ${y + 6} L ${x - 6} ${y} Z`} fill={m.cor} />;
  }
  const golo = m.resultado === 'GOLO';
  // Remate do adversário: um anel da cor do resultado, para não se confundir
  // com os nossos no mesmo mapa. O golo sofrido vai cheio.
  if (m.registo === 'remate_adv') {
    return (
      <circle
        cx={x}
        cy={y}
        r={golo ? 7 : 5.5}
        fill={golo ? m.cor : 'rgba(0, 0, 0, 0.35)'}
        stroke={golo ? '#ffffff' : m.cor}
        strokeWidth={golo ? 2.5 : 3}
      />
    );
  }
  return (
    <circle
      cx={x}
      cy={y}
      r={golo ? 7 : 5.5}
      fill={m.cor}
      stroke={golo ? '#fff' : 'none'}
      strokeWidth={2}
    />
  );
}

export function CampoSvg({ markers = [], onPick = null, destaque = null, lateral = false }) {
  const ref = useRef(null);

  function tocar(e) {
    if (!onPick || !ref.current) return;
    const svg = ref.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = pt.matrixTransform(ctm.inverse());
    const x = p.x / W;
    const y = p.y / H;
    // Um toque mesmo fora das linhas (ex.: um fora) conta, encostado à linha.
    if (x < -0.04 || x > 1.04 || y < -0.06 || y > 1.06) return;
    const xx = Math.min(1, Math.max(0, x));
    // Um fora só pode ser numa linha lateral: o toque vale a mais próxima,
    // mantendo a posição ao longo dela.
    const yy = lateral ? aLinhaLateral(y) : Math.min(1, Math.max(0, y));
    onPick({ x: xx, y: yy });
  }

  return (
    <svg
      ref={ref}
      className={`regcampo ${onPick ? 'is-pickable' : ''}`}
      viewBox={`-16 -14 ${W + 32} ${H + 28}`}
      onClick={tocar}
      role={onPick ? 'button' : 'img'}
      aria-label={t('registos.campoAria')}
    >
      <rect
        x={0}
        y={0}
        width={W / 2}
        height={H}
        className={`regcampo__metade ${destaque === 'nossa' ? 'is-on' : ''}`.trim()}
      />
      <rect
        x={W / 2}
        y={0}
        width={W / 2}
        height={H}
        className={`regcampo__metade regcampo__metade--deles ${destaque === 'deles' ? 'is-on' : ''}`}
      />
      <g className="regcampo__linhas">
        <rect x={0} y={0} width={W} height={H} />
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
        <circle cx={W / 2} cy={H / 2} r={30} />
        <path d={area('esq')} />
        <path d={area('dir')} />
        <rect x={-10} y={85} width={10} height={30} />
        <rect x={W} y={85} width={10} height={30} />
      </g>
      <g className="regcampo__pontos-fixos">
        <circle cx={W / 2} cy={H / 2} r={2} />
        <circle cx={60} cy={H / 2} r={2} />
        <circle cx={100} cy={H / 2} r={2} />
        <circle cx={W - 60} cy={H / 2} r={2} />
        <circle cx={W - 100} cy={H / 2} r={2} />
      </g>
      <text x={W * 0.25} y={-4} className="regcampo__rotulo">
        {t('registos.meioCampoNosso')}
      </text>
      <text x={W * 0.75} y={-4} className="regcampo__rotulo regcampo__rotulo--deles">
        {t('registos.meioCampoAdversario')} →
      </text>

      {lateral ? (
        <g className="regcampo__lateral" aria-hidden="true">
          <line x1={0} y1={0} x2={W} y2={0} />
          <line x1={0} y1={H} x2={W} y2={H} />
        </g>
      ) : null}

      {markers.map((m) => (
        <g key={m.id} className="regcampo__marca">
          <Marca m={m} />
        </g>
      ))}
    </svg>
  );
}

/**
 * Perguntar onde foi, e (se houver) escolher uma opção antes.
 *
 * Um só ecrã para os dois passos: carrega-se na opção (ex.: "Defendido") e
 * depois no campo — dois toques, sem abrir janela nova. Sem opções, basta
 * tocar no campo.
 *
 * Resolve com { opcao, x, y } (x/y a null em "sem zona"), ou null se fechar.
 */
export function perguntarOnde(
  ui,
  { titulo, subtitulo = null, opcoes = null, markers = [], destaque = null, lateral = false }
) {
  return ui.open((close) => (
    <OndeDialog
      titulo={titulo}
      subtitulo={subtitulo}
      opcoes={opcoes}
      markers={markers}
      destaque={destaque}
      lateral={lateral}
      close={close}
    />
  ));
}

function OndeDialog({ titulo, subtitulo, opcoes, markers, destaque, lateral, close }) {
  const [opcao, setOpcao] = useState(null);
  const precisaOpcao = Boolean(opcoes?.length);
  const pronto = !precisaOpcao || opcao;

  return (
    <Dialog title={titulo} onClose={() => close(null)} wide>
      {subtitulo ? <p className="regzona__sub">{subtitulo}</p> : null}
      {precisaOpcao ? (
        <div className="regzona__opcoes">
          {opcoes.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`regzona__opcao ${opcao === o.id ? 'is-on' : ''}`}
              style={o.cor ? { '--cor': o.cor } : undefined}
              onClick={() => setOpcao(o.id)}
            >
              {o.cor ? <span className="regzona__bola" /> : null}
              {o.rotulo}
            </button>
          ))}
        </div>
      ) : null}
      <div className={`regzona__campo ${pronto ? '' : 'is-espera'}`}>
        <CampoSvg
          markers={markers}
          destaque={destaque}
          lateral={lateral}
          onPick={pronto ? ({ x, y }) => close({ opcao, x, y }) : null}
        />
        {!pronto ? <div className="regzona__aviso">{t('registos.escolheResultadoPrimeiro')}</div> : null}
      </div>
      <footer className="modal__actions">
        <span className="regzona__dica">{pronto ? t('registos.tocaNoCampo') : ''}</span>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={!pronto}
          onClick={() => close({ opcao, x: null, y: null })}
        >
          {t('registos.semZona')}
        </button>
      </footer>
    </Dialog>
  );
}
