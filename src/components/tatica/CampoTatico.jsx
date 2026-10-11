'use client';

// components/tatica/CampoTatico.jsx — o campo do quadro tático, com as peças.
//
// Serve três sítios com o mesmo desenho: o editor (peças arrastáveis), o leitor
// da app e a página pública do link. Só o editor passa `onMover`/`onLargar`.
//
// As posições chegam no sistema da jogada (0–1000 × 0–500, ver
// domain/jogada.js) e são desenhadas a 0,4: um campo de 400 × 200 unidades,
// as mesmas proporções 40 × 20 m de um campo de futsal.
//
// O arrasto é feito com eventos de ponteiro e `setPointerCapture`, como no
// `lib/arrastar.js` — o `draggable` do HTML não existe no toque.

import { useRef } from 'react';
import { TIPO, COMPRIMENTO, LARGURA } from '@/domain/jogada.js';
import { useT } from '@/lib/i18n/index.js';

import { K, W, H, R, area, caixa } from './geometria.js';

/**
 * Largura ÷ altura da moldura. Vai para o CSS (`--aspeto`) para o campo nunca
 * ficar mais alto do que o ecrã: num iPad, à largura toda, o meio-campo media
 * mais de um ecrã de altura e não se via a jogada inteira.
 */
function aspeto(campo) {
  const [, , w, h] = caixa(campo).split(' ').map(Number);
  return w / h;
}


function Peca({ peca, x, y, selecionada, fantasma = false }) {
  const classe = [
    'tpeca',
    `tpeca--${peca.tipo}`,
    peca.lado ? `tpeca--${peca.lado}` : '',
    selecionada ? 'is-sel' : '',
    fantasma ? 'is-fantasma' : '',
  ].join(' ');
  if (peca.tipo === TIPO.BOLA) {
    return (
      <g className={classe} transform={`translate(${x} ${y})`}>
        <circle r={5} />
        {selecionada ? <circle r={9} className="tpeca__anel" /> : null}
      </g>
    );
  }
  if (peca.tipo === TIPO.CONE) {
    return (
      <g className={classe} transform={`translate(${x} ${y})`}>
        <path d="M 0 -7 L 6 5 L -6 5 Z" />
        {selecionada ? <circle r={10} className="tpeca__anel" /> : null}
      </g>
    );
  }
  return (
    <g className={classe} transform={`translate(${x} ${y})`}>
      <circle r={R} />
      <text y={0.5} dominantBaseline="middle" textAnchor="middle">
        {peca.num ?? ''}
      </text>
      {peca.nome && !fantasma ? (
        <text y={R + 7} className="tpeca__nome" textAnchor="middle">
          {String(peca.nome).split(' ')[0]}
        </text>
      ) : null}
      {selecionada ? <circle r={R + 4} className="tpeca__anel" /> : null}
    </g>
  );
}

/**
 * @param {object} props
 * @param {object} props.data jogada normalizada
 * @param {Object<string,[number,number]>} props.posicoes onde desenhar cada peça
 * @param {Object<string,[number,number]>} [props.anteriores] posições do frame
 *   anterior — no editor desenham-se esbatidas, com o rasto até à atual
 * @param {string} [props.selecionada]
 * @param {(id: string|null) => void} [props.onSelecionar]
 * @param {(id: string, p: [number, number]) => void} [props.onMover] durante o arrasto
 * @param {(id: string, p: [number, number]) => void} [props.onLargar] no fim do arrasto
 */
export default function CampoTatico({
  data,
  posicoes,
  anteriores = null,
  selecionada = null,
  onSelecionar,
  onMover,
  onLargar,
}) {
  const t = useT();
  const ref = useRef(null);
  const arrasto = useRef(null);
  const editavel = Boolean(onMover);

  function ponto(e) {
    const svg = ref.current;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return [p.x / K, p.y / K];
  }

  function comecar(e, id) {
    if (!editavel) return;
    e.stopPropagation();
    const p = ponto(e);
    if (!p) return;
    const atual = posicoes[id] || [0, 0];
    // Guardar a distância entre o dedo e o centro da peça: sem isto a peça
    // saltava para debaixo do dedo ao primeiro movimento.
    arrasto.current = { id, dx: atual[0] - p[0], dy: atual[1] - p[1], ultimo: atual, mexeu: false };
    ref.current.setPointerCapture?.(e.pointerId);
    onSelecionar?.(id);
  }

  function mover(e) {
    const a = arrasto.current;
    if (!a) return;
    const p = ponto(e);
    if (!p) return;
    const novo = [
      Math.max(0, Math.min(COMPRIMENTO, p[0] + a.dx)),
      Math.max(0, Math.min(LARGURA, p[1] + a.dy)),
    ];
    a.ultimo = novo;
    a.mexeu = true;
    onMover(a.id, novo);
  }

  function largar() {
    const a = arrasto.current;
    arrasto.current = null;
    if (a?.mexeu) onLargar?.(a.id, a.ultimo);
  }

  // Ordem de desenho: cones por baixo, depois jogadores, a bola sempre por cima.
  const ordem = { [TIPO.CONE]: 0, [TIPO.GR]: 1, [TIPO.JOGADOR]: 1, [TIPO.BOLA]: 2 };
  const pecas = [...data.pecas].sort((a, b) => (ordem[a.tipo] ?? 1) - (ordem[b.tipo] ?? 1));

  return (
    <svg
      ref={ref}
      className={`tcampo ${editavel ? 'is-editavel' : ''}`}
      viewBox={caixa(data.campo)}
      style={{ '--aspeto': aspeto(data.campo) }}
      role="img"
      aria-label={t('tatica.campoAria')}
      onPointerMove={mover}
      onPointerUp={largar}
      onPointerCancel={largar}
      onPointerDown={() => editavel && onSelecionar?.(null)}
    >
      <rect x={-14} y={-12} width={W + 28} height={H + 24} className="tcampo__fundo" />
      <g className="tcampo__linhas">
        <rect x={0} y={0} width={W} height={H} />
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
        <circle cx={W / 2} cy={H / 2} r={30} />
        <path d={area('esq')} />
        <path d={area('dir')} />
        <rect x={-8} y={H / 2 - 15} width={8} height={30} />
        <rect x={W} y={H / 2 - 15} width={8} height={30} />
        <circle cx={W / 2} cy={H / 2} r={1.6} className="tcampo__ponto" />
        <circle cx={60} cy={H / 2} r={1.6} className="tcampo__ponto" />
        <circle cx={100} cy={H / 2} r={1.6} className="tcampo__ponto" />
        <circle cx={W - 60} cy={H / 2} r={1.6} className="tcampo__ponto" />
        <circle cx={W - 100} cy={H / 2} r={1.6} className="tcampo__ponto" />
      </g>

      {anteriores ? (
        <g className="tcampo__rastos" aria-hidden="true">
          {pecas.map((p) => {
            const a = anteriores[p.id];
            const b = posicoes[p.id];
            if (!a || !b || (a[0] === b[0] && a[1] === b[1])) return null;
            return (
              <g key={p.id}>
                <line x1={a[0] * K} y1={a[1] * K} x2={b[0] * K} y2={b[1] * K} className="tcampo__rasto" />
                <Peca peca={p} x={a[0] * K} y={a[1] * K} fantasma />
              </g>
            );
          })}
        </g>
      ) : null}

      {pecas.map((p) => {
        const pos = posicoes[p.id];
        if (!pos) return null;
        return (
          <g
            key={p.id}
            onPointerDown={(e) => comecar(e, p.id)}
            style={editavel ? { cursor: 'grab' } : undefined}
          >
            <Peca peca={p} x={pos[0] * K} y={pos[1] * K} selecionada={selecionada === p.id} />
          </g>
        );
      })}
    </svg>
  );
}
