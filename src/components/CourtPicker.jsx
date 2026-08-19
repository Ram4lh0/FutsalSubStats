'use client';

// components/CourtPicker.jsx — selector de cinco inicial, usado pelo assistente
// de criação, pela preparação e pelo intervalo.
//
// O gesto é o mesmo das substituições no jogo ao vivo: tocar num jogador marca-o
// e ilumina os destinos possíveis; o segundo toque conclui. Um só vocabulário
// para toda a aplicação — quem aprendeu a substituir já sabe montar o cinco.

import { useState } from 'react';
import { POSITIONS } from '@/domain/constants.js';
import { positionShort } from '@/lib/format.js';
import { useT } from '@/lib/i18n/index.js';
import useArrasto from '@/lib/arrastar.js';

export function countFilled(lineup) {
  return Object.values(lineup).filter(Boolean).length;
}

export default function CourtPicker({ candidates, lineup, onChange }) {
  const t = useT();
  const [sel, setSel] = useState(null); // { kind: 'bench', playerId } | { kind: 'slot', pos }

  // O mesmo gesto do jogo: arrastar em vez de tocar duas vezes. Aqui não há
  // validação nenhuma a fazer — montar o cinco é mexer num objecto — por isso
  // reaproveitam-se directamente o `colocar` e o `trocar`.
  const arrasto = useArrasto((origem, destino) => {
    if (destino?.tipo !== 'slot') return;
    setSel(null);
    if (origem.tipo === 'bench') return onChange(colocar(lineup, destino.pos, origem.playerId));
    if (origem.tipo === 'slot' && origem.pos !== destino.pos) {
      return onChange(trocar(lineup, origem.pos, destino.pos));
    }
  });

  const usados = new Set(Object.values(lineup).filter(Boolean));
  const banco = candidates.filter((c) => !usados.has(c.playerId));

  /** Um jogador só pode ocupar uma posição: sai de onde estivesse antes. */
  function colocar(atual, pos, playerId) {
    const proximo = { ...atual };
    for (const p of POSITIONS) if (proximo[p] === playerId) delete proximo[p];
    proximo[pos] = playerId;
    return proximo;
  }

  function trocar(atual, a, b) {
    const proximo = { ...atual };
    const pa = proximo[a];
    const pb = proximo[b];
    if (pb) proximo[a] = pb;
    else delete proximo[a];
    if (pa) proximo[b] = pa;
    else delete proximo[b];
    return proximo;
  }

  function tocarPosicao(pos) {
    if (sel?.kind === 'bench') {
      onChange(colocar(lineup, pos, sel.playerId));
      return setSel(null);
    }
    if (sel?.kind === 'slot') {
      if (sel.pos === pos) return setSel(null);
      onChange(trocar(lineup, sel.pos, pos));
      return setSel(null);
    }
    setSel({ kind: 'slot', pos });
  }

  function tocarBanco(playerId) {
    if (sel?.kind === 'slot') {
      onChange(colocar(lineup, sel.pos, playerId));
      return setSel(null);
    }
    if (sel?.kind === 'bench' && sel.playerId === playerId) return setSel(null);
    setSel({ kind: 'bench', playerId });
  }

  const dica =
    sel?.kind === 'bench'
      ? t('campo.dicaBanco')
      : sel?.kind === 'slot'
        ? lineup[sel.pos]
          ? t('campo.dicaSlotCheio')
          : t('campo.dicaSlotVazio')
        : t('campo.dicaInicial');

  return (
    <div className="courtpick">
      <div className="courtpick__court">
        <div className="court__bg" />
        {POSITIONS.map((pos) => {
          const pid = lineup[pos];
          const p = candidates.find((c) => c.playerId === pid);
          const selecionado = sel?.kind === 'slot' && sel.pos === pos;
          const alvo = sel?.kind === 'bench' || (sel?.kind === 'slot' && sel.pos !== pos);
          // Um lugar é as duas coisas: arrasta-se para trocar com outro, e
          // recebe quem vier do banco.
          const pega = p ? arrasto.pegar({ tipo: 'slot', playerId: p.playerId, pos }) : {};
          const solta = arrasto.alvo({ tipo: 'slot', pos });
          return (
            <button
              key={pos}
              type="button"
              className={[
                'slot',
                `slot--${pos.toLowerCase()}`,
                p ? 'is-filled' : 'is-empty',
                selecionado ? 'is-selected' : '',
                alvo ? 'is-target' : '',
                pega.className || '',
                solta.className,
                arrasto.origem?.pos === pos ? 'is-a-arrastar' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-largar={solta['data-largar']}
              onPointerDown={pega.onPointerDown}
              onPointerMove={pega.onPointerMove}
              onPointerUp={pega.onPointerUp}
              onPointerCancel={pega.onPointerCancel}
              onClickCapture={pega.onClickCapture}
              onClick={() => tocarPosicao(pos)}
            >
              <span className="slot__pos">{positionShort(pos)}</span>
              {p ? (
                <span className="slot__player">
                  <strong>{p.number}</strong>
                  <span>{p.name}</span>
                </span>
              ) : (
                <span className="slot__empty">
                  {sel?.kind === 'bench' ? t('campo.colocarAqui') : t('campo.tocarParaEscolher')}
                </span>
              )}
              {p ? (
                <span
                  className="slot__clear"
                  title={t('campo.retirarDoCinco')}
                  onClick={(e) => {
                    e.stopPropagation();
                    const proximo = { ...lineup };
                    delete proximo[pos];
                    setSel(null);
                    onChange(proximo);
                  }}
                >
                  ✕
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="courtpick__bench">
        <h3 className="section section--tight">{t('campo.banco', { n: banco.length })}</h3>
        <div className="chiprow">
          {banco.length ? (
            banco.map((p) => {
              const pega = arrasto.pegar({ tipo: 'bench', playerId: p.playerId });
              return (
              <button
                key={p.playerId}
                type="button"
                className={[
                  'chip',
                  sel?.kind === 'bench' && sel.playerId === p.playerId ? 'is-selected' : '',
                  sel?.kind === 'slot' ? 'is-target' : '',
                  pega.className,
                  arrasto.origem?.playerId === p.playerId ? 'is-a-arrastar' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onPointerDown={pega.onPointerDown}
                onPointerMove={pega.onPointerMove}
                onPointerUp={pega.onPointerUp}
                onPointerCancel={pega.onPointerCancel}
                onClickCapture={pega.onClickCapture}
                onClick={() => tocarBanco(p.playerId)}
              >
                <strong>{p.number}</strong> {p.name}
              </button>
              );
            })
          ) : (
            <span className="muted">{t('campo.todosEmCampo')}</span>
          )}
        </div>
        <p className="courtpick__hint">{dica}</p>
      </div>
    </div>
  );
}
