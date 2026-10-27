'use client';

// components/registos/BotoesRegistos.jsx — os botões dos registos extra no
// cartão do jogador em campo: ação + e −, defesa (só no guarda-redes), remate,
// recuperação e perda de bola, cada um só se o escalão o tiver ligado, e o G
// no fim.
//
// São `span` como o G e o F: o cartão inteiro já é um botão, e um botão dentro
// de outro não é HTML válido.

import { REGISTO, RESULTADO_ACAO } from '@/domain/registos.js';
import { t } from '@/lib/i18n/index.js';

// Um toque nos botões não pode começar a arrastar o cartão.
const PARAR = {
  'data-no-drag': true,
  onPointerDown: (e) => e.stopPropagation(),
  onPointerUp: (e) => e.stopPropagation(),
  onPointerCancel: (e) => e.stopPropagation(),
};

/**
 * Este cartão leva botões? Só se houver um registo de jogador ligado que faça
 * sentido nesta posição (a defesa é só do guarda-redes). Com foras e cantos
 * apenas, os cartões ficam como sempre.
 */
export function temBotoesNoCartao(ligados, pos) {
  if (!ligados?.size) return false;
  return (
    ligados.has(REGISTO.REMATE) ||
    ligados.has(REGISTO.RECUPERACAO) ||
    ligados.has(REGISTO.PERDA_BOLA) ||
    ligados.has(REGISTO.ACAO) ||
    (pos === 'GOALKEEPER' && ligados.has(REGISTO.DEFESA_GR))
  );
}

export default function BotoesRegistos({ pos, p, ligados, contagem, on, golo }) {
  const c = contagem || {};
  const botao = (classe, rotulo, titulo, quantos, fazer) => (
    <span
      className={`pcard__regbtn pcard__regbtn--${classe}`}
      role="button"
      aria-label={titulo}
      title={titulo}
      {...PARAR}
      onClick={(e) => {
        e.stopPropagation();
        fazer();
      }}
    >
      {rotulo}
      {quantos ? <b>{quantos}</b> : null}
    </span>
  );

  return (
    <div className="pcard__registos">
      {ligados.has(REGISTO.ACAO) ? (
        <>
          {botao('positiva', <Polegar />, t('registos.acaoPositiva'), c.positivas, () =>
            on.registarAcao(p, RESULTADO_ACAO.POSITIVA)
          )}
          {botao('negativa', <Polegar baixo />, t('registos.acaoNegativa'), c.negativas, () =>
            on.registarAcao(p, RESULTADO_ACAO.NEGATIVA)
          )}
        </>
      ) : null}
      {pos === 'GOALKEEPER' && ligados.has(REGISTO.DEFESA_GR)
        ? botao('defesa', t('registos.btn.defesa_gr'), t('registos.nome.defesa_gr'), c.defesa_gr, () =>
            on.registarDefesa(p)
          )
        : null}
      {ligados.has(REGISTO.REMATE)
        ? botao('remate', t('registos.btn.remate'), t('registos.nome.remate'), c.remate, () =>
            on.registarRemate(p)
          )
        : null}
      {ligados.has(REGISTO.RECUPERACAO)
        ? botao('recup', t('registos.btn.recuperacao'), t('registos.nome.recuperacao'), c.recuperacao, () =>
            on.registarRecuperacao(p)
          )
        : null}
      {ligados.has(REGISTO.PERDA_BOLA)
        ? botao('perda', t('registos.btn.perda_bola'), t('registos.nome.perda_bola'), c.perda_bola, () =>
            on.registarPerda(p)
          )
        : null}
      {golo}
    </div>
  );
}

/** Polegar para cima (verde) ou para baixo (vermelho). */
function Polegar({ baixo = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      style={baixo ? { transform: 'rotate(180deg)' } : undefined}
    >
      <path
        fill="currentColor"
        d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
      />
    </svg>
  );
}
