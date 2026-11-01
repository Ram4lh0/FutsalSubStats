'use client';

// components/JanelaTempo.jsx — a barra para escolher o início e o fim do
// tempo a analisar: duas pegas numa linha que vai do início ao fim do jogo,
// com a marca do intervalo, e atalhos (jogo todo, partes, quartos).
//
// Trabalha em minutos inteiros na linha do tempo "nominal" (a 2.ª parte
// começa onde acaba a 1.ª). `janela` é `{ de, ate }` em minutos, ou `null`
// para o jogo todo.

import { useT } from '@/lib/i18n/index.js';

export default function JanelaTempo({ parteMin, janela, aoMudar }) {
  const t = useT();
  const max = parteMin * 2;
  const de = janela?.de ?? 0;
  const ate = janela?.ate ?? max;
  const quarto = Math.max(1, Math.round(parteMin / 2));

  const definir = (novoDe, novoAte) => {
    const d = Math.max(0, Math.min(novoDe, max - 1));
    const a = Math.min(max, Math.max(novoAte, d + 1));
    aoMudar(d <= 0 && a >= max ? null : { de: d, ate: a });
  };

  const atalhos = [
    [t('painelv.todoOJogo'), 0, max],
    [t('painelv.primeiraParte'), 0, parteMin],
    [t('painelv.segundaParte'), parteMin, max],
  ];
  for (let ini = 0; ini < max; ini += quarto) {
    atalhos.push([`${ini}′–${Math.min(max, ini + quarto)}′`, ini, Math.min(max, ini + quarto)]);
  }

  return (
    <div className="janela no-print">
      <div className="janela__atalhos">
        {atalhos.map(([nome, a, b]) => (
          <button
            key={nome}
            type="button"
            className={`chip ${de === a && ate === b ? 'is-on' : ''}`}
            onClick={() => definir(a, b)}
          >
            {nome}
          </button>
        ))}
      </div>

      <div className="janela__barra">
        {/* Os trilhos ficam recuados meia pega, para a pega parar sobre a linha. */}
        <div className="janela__trilhos">
          <div className="janela__trilho" />
          <div
            className="janela__cheio"
            style={{ left: `${(de / max) * 100}%`, right: `${100 - (ate / max) * 100}%` }}
          />
          <div className="janela__intervalo" style={{ left: '50%' }} title={t('painelv.intervalo')} />
        </div>
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={de}
          // Perto do fim a pega do início fica por cima, senão não se apanha.
          style={{ zIndex: de > max / 2 ? 3 : 1 }}
          aria-label={t('painelv.janelaDe')}
          onChange={(e) => definir(Number(e.target.value), ate)}
        />
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={ate}
          aria-label={t('painelv.janelaAte')}
          onChange={(e) => definir(de, Number(e.target.value))}
        />
      </div>

      <div className="janela__eixo">
        <span>0′</span>
        <span>{parteMin}′</span>
        <span>{max}′</span>
      </div>
      <p className="janela__texto">
        {janela ? t('painelv.janelaTexto', { de, ate }) : t('painelv.janelaJogoTodo')}
      </p>
    </div>
  );
}
