'use client';

// components/penaltis/Baliza.jsx — a baliza dividida em 9 zonas (3 × 3), vista
// de quem remata, com a faixa "Fora" à volta.
//
// Serve para as duas coisas: escolher uma zona (penálti a registar) e mostrar
// onde foram os penáltis (resumo), com uma marca por penálti dentro da zona.

import { ZONAS_BALIZA, ZONA_FORA } from '@/domain/prolongamento.js';
import { useT } from '@/lib/i18n/index.js';

/**
 * @param {string|null} escolhida  zona selecionada
 * @param {function} [onEscolher]   sem ele a baliza é só para ver
 * @param {Array<{zona:string, tipo:'golo'|'defendido'|'fora'|'gr', rotulo?:string}>} [marcas]
 * @param {boolean} [comFora]       mostra (e deixa escolher) a faixa de fora
 * @param {'bola'|'gr'} [modo]      cor da seleção: bola ou mergulho do GR
 */
export default function Baliza({ escolhida = null, onEscolher, marcas = [], comFora = true, modo = 'bola', titulo }) {
  const t = useT();
  const interativa = typeof onEscolher === 'function';
  const marcasDe = (zona) => marcas.filter((m) => m.zona === zona);

  const Marca = ({ m, i }) => (
    <span key={i} className={`baliza__marca baliza__marca--${m.tipo}`} title={m.rotulo || ''}>
      {m.texto ?? ''}
    </span>
  );

  return (
    <div className={`baliza ${interativa ? 'baliza--escolher' : ''} baliza--${modo}`}>
      {titulo ? <span className="baliza__titulo">{titulo}</span> : null}
      <div
        className={`baliza__fora ${comFora ? '' : 'baliza__fora--sem'} ${escolhida === ZONA_FORA ? 'is-on' : ''}`}
        role={interativa && comFora ? 'button' : undefined}
        tabIndex={interativa && comFora ? 0 : undefined}
        aria-label={comFora ? t('penaltis.zona.FORA') : undefined}
        onClick={interativa && comFora ? () => onEscolher(ZONA_FORA) : undefined}
      >
        {comFora ? (
          <span className="baliza__foratexto">
            {t('penaltis.zona.FORA')}
            {marcasDe(ZONA_FORA).map((m, i) => (
              <Marca key={i} m={m} i={i} />
            ))}
          </span>
        ) : null}
        <div className="baliza__quadro">
          {ZONAS_BALIZA.map((zona) => {
            const conteudo = marcasDe(zona).map((m, i) => <Marca key={i} m={m} i={i} />);
            return interativa ? (
              <button
                key={zona}
                type="button"
                className={`baliza__zona ${escolhida === zona ? 'is-on' : ''}`}
                aria-label={t(`penaltis.zona.${zona}`)}
                aria-pressed={escolhida === zona}
                onClick={(e) => {
                  e.stopPropagation();
                  onEscolher(escolhida === zona ? null : zona);
                }}
              >
                {conteudo}
              </button>
            ) : (
              <span key={zona} className="baliza__zona" title={t(`penaltis.zona.${zona}`)}>
                {conteudo}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
