'use client';

// components/stats/graficos.jsx — os gráficos do painel, desenhados à mão.
//
// ## Porquê sem biblioteca
//
// Uma biblioteca de gráficos são centenas de kilobytes para o que aqui são umas
// dezenas de linhas de SVG. Três razões pesaram, por esta ordem:
//
//   1. A app tem de caber e abrir dentro de um pavilhão. Cada kilobyte é
//      código que o service worker tem de guardar e o telemóvel tem de ler.
//   2. Nenhuma delas desenha o que aqui é preciso sem se lhe torcer o braço —
//      uma linha de média por cima de barras, duas séries encostadas por faixa
//      de tempo, uma fita de resultados. Configurar isso costuma dar mais
//      trabalho do que escrever o `path`.
//   3. As cores e os tipos de letra vêm todos das variáveis do tema. Uma
//      biblioteca traz as suas, e depois passa-se a vida a lutar contra elas.
//
// ## Tudo em `viewBox`, nada em píxeis
//
// Os gráficos são desenhados numa grelha de coordenadas própria e esticados por
// CSS. Assim funcionam de um telemóvel ao alto a um portátil deitado sem
// medirem nada nem ouvirem o redimensionamento da janela.

import { useT } from '@/lib/i18n/index.js';

/** Uma escala linear de valores para píxeis do desenho. */
const escala = (max, comprimento) => (v) => (max > 0 ? (v / max) * comprimento : 0);

/* ------------------------------------------------------ barras horizontais */

/**
 * Barras horizontais com uma linha de referência.
 *
 * Horizontais e não verticais por causa dos nomes: catorze nomes de pessoas
 * debaixo de catorze colunas ou ficam de lado ou ficam cortados, e uma barra de
 * minutos que não se sabe de quem é não serve de nada.
 *
 * ## Porque é que isto não é SVG, ao contrário dos outros
 *
 * Era, e num telemóvel não se lia. Um SVG tem um sistema de coordenadas próprio
 * que é esticado para a largura disponível — e **o texto é esticado com ele**.
 * Num ecrã de 390px, um nome desenhado a 13 unidades saía a 9 píxeis. O gráfico
 * ficava certo e ilegível ao mesmo tempo.
 *
 * Uma barra horizontal não precisa de desenho nenhum: é um nome, um carril, um
 * preenchimento com uma percentagem de largura e um número. Tudo isso o HTML faz
 * melhor — o texto é texto a sério, no tamanho que o CSS diz, com reticências
 * quando não cabe e a mudar de sítio no telemóvel sem que ninguém tenha de
 * recalcular coordenadas.
 *
 * Os outros gráficos continuam em SVG porque têm mesmo formas: colunas
 * espelhadas em torno de um eixo, uma linha quebrada. Aí o desenho é o conteúdo.
 *
 * @param {{rotulo: string, valor: number, texto: string, alerta?: boolean}[]} linhas
 * @param {number} referencia  Valor da linha tracejada (a média), ou 0 para não a desenhar.
 */
export function BarrasH({ linhas, referencia = 0, rotuloReferencia = '' }) {
  const maximo = Math.max(referencia, ...linhas.map((l) => l.valor), 1);
  const pct = (v) => `${(v / maximo) * 100}%`;

  return (
    <div className="barras">
      <ul className="barras__lista">
        {linhas.map((l, i) => (
          <li className="barras__linha" key={l.rotulo + i}>
            <span className="barras__nome" title={l.rotulo}>
              {l.rotulo}
            </span>
            {/* O carril mostra a barra vazia: sem ele, quem tem zero minutos
                desaparece do gráfico em vez de aparecer com nada. */}
            <span
              className={`barras__carril ${referencia > 0 ? 'is-ref' : ''}`}
              style={referencia > 0 ? { '--ref': pct(referencia) } : undefined}
            >
              <span
                className={`barras__cheio ${l.alerta ? 'is-alerta' : ''}`}
                // Três píxeis de mínimo para quem tem alguma coisa mas pouca:
                // sem isso, um jogador com dois minutos numa época desaparecia
                // e lia-se como zero.
                style={{ width: l.valor > 0 ? `max(3px, ${pct(l.valor)})` : 0 }}
              />
            </span>
            <span className="barras__valor mono">{l.texto}</span>
          </li>
        ))}
      </ul>
      {referencia > 0 && rotuloReferencia ? (
        <p className="barras__legenda">{rotuloReferencia}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------ colunas duplas por faixa */

/**
 * Duas séries por faixa de tempo: marcados para cima, sofridos para baixo.
 *
 * A alternativa era pôr as duas para cima, lado a lado. Espelhadas é melhor
 * aqui: o eixo do meio é o zero e a forma da coisa responde à pergunta sem se
 * ler um número — mancha em cima é uma equipa que marca naquele período, mancha
 * em baixo é uma que sofre.
 */
export function ColunasEspelhadas({
  faixas,
  etiquetas,
  aoEscolher,
  escolhida = null,
  chaveA = 'marcados',
  chaveB = 'sofridos',
  classeA = 'marcados',
  classeB = 'sofridos',
}) {
  const LARGURA = 480;
  const temBaixo = Boolean(chaveB);
  const META = 74; // altura de cada metade
  const EIXO = META + (temBaixo ? 12 : 8);
  const ALTURA = temBaixo ? META * 2 + 16 : META + 16;
  const passo = LARGURA / Math.max(1, faixas.length);
  const largura = Math.max(6, passo - 10);
  const maximo = Math.max(
    1,
    ...faixas.map((f) => Math.max(f[chaveA] || 0, temBaixo ? f[chaveB] || 0 : 0))
  );
  const y = escala(maximo, META - 6);

  return (
    <div className={`colunas ${temBaixo ? '' : 'colunas--simples'}`.trim()}>
    <svg className="graf" viewBox={`0 0 ${LARGURA} ${ALTURA}`} role="img" preserveAspectRatio="none">
      <line x1={0} x2={LARGURA} y1={EIXO} y2={EIXO} className="graf__eixo" />
      {faixas.map((f, i) => {
        const cx = i * passo + passo / 2;
        const valorA = f[chaveA] || 0;
        const valorB = temBaixo ? f[chaveB] || 0 : 0;
        const hA = y(valorA);
        const hC = y(valorB);
        const activa = escolhida === i;
        return (
          <g
            key={i}
            className={`graf__faixaG ${activa ? 'is-activa' : ''}`}
            onPointerEnter={() => aoEscolher?.(i)}
            onPointerLeave={() => aoEscolher?.(null)}
            onClick={() => aoEscolher?.(activa ? null : i)}
          >
            {/* Uma zona sensível de altura toda por cima de cada faixa. Sem
                ela, apanhar com o dedo uma coluna de três píxeis — ou uma faixa
                sem golo nenhum, que também tem uma média a dizer — era
                impossível. Invisível, mas é ela que recebe o toque. */}
            <rect
              x={i * passo}
              y={0}
              width={passo}
              height={ALTURA}
              className="graf__toque"
            />
            {valorA > 0 ? (
              <rect
                x={cx - largura / 2}
                y={EIXO - hA}
                width={largura}
                height={hA}
                rx={3}
                className={`graf__${classeA}`}
              />
            ) : null}
            {temBaixo && valorB > 0 ? (
              <rect
                x={cx - largura / 2}
                y={EIXO}
                width={largura}
                height={hC}
                rx={3}
                className={`graf__${classeB}`}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
      {/* As etiquetas do tempo saíram do desenho e passaram a texto a sério,
          numa grelha com o mesmo número de colunas iguais. Dentro do SVG eram
          esticadas com ele e num telemóvel saíam a sete píxeis. */}
      <ol
        className="colunas__eixo"
        style={{ '--n': String(faixas.length) }}
        aria-hidden="true"
      >
        {etiquetas.map((e, i) => (
          <li key={i} className={escolhida === i ? 'is-activa' : ''}>
            {e}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* -------------------------------------------------------------- linha */

/**
 * A escada da forma: sobe com uma vitória, desce com uma derrota, mantém-se com
 * um empate.
 *
 * Sem números no eixo, de propósito. O valor não quer dizer nada sozinho — é
 * relativo ao ponto de partida, e pô-lo à vista só convidava a lê-lo como
 * pontos, que não são. O que se lê aqui é a inclinação.
 */
export function EscadaForma({ pontos }) {
  const LARGURA = 480;
  const ALTURA = 130;
  const MARGEM = 16;
  if (pontos.length < 2) return null;

  const niveis = pontos.map((p) => p.nivel).concat(0);
  const cima = Math.max(...niveis);
  const baixo = Math.min(...niveis);
  // Amplitude mínima de 2 para uma série de empates não sair como uma linha
  // colada ao topo do desenho.
  const amplitude = Math.max(2, cima - baixo);
  const passo = LARGURA / pontos.length;
  const px = (i) => passo * i + passo / 2;
  const py = (v) => MARGEM + ((cima - v) / amplitude) * (ALTURA - MARGEM * 2);

  const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${px(i)},${py(p.nivel)}`).join(' ');

  return (
    <svg className="graf" viewBox={`0 0 ${LARGURA} ${ALTURA}`} role="img" preserveAspectRatio="xMidYMin meet">
      <line x1={0} x2={LARGURA} y1={py(0)} y2={py(0)} className="graf__eixo" />
      <path d={linha} className="graf__linha" />
      {pontos.map((p, i) => (
        <circle
          key={p.matchId || i}
          cx={px(i)}
          cy={py(p.nivel)}
          r={4}
          className={`graf__ponto ${p.resultado === 'W' ? 'is-v' : p.resultado === 'L' ? 'is-d' : 'is-e'}`}
        >
          <title>{`${p.adversario} · ${p.resultado}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------ fita de forma */

/**
 * Os últimos resultados, cada um um quadrado com o resultado por baixo.
 *
 * O quadrado abre o resumo do jogo. Vem de olhar para a fita e reparar num
 * vermelho: a pergunta seguinte é sempre «esse foi qual?», e o caminho era sair
 * do painel, ir aos jogos e procurar pela data. Agora é um toque — e é onde a
 * pessoa já está a olhar.
 */
export function FitaForma({ jogos, onAbrir }) {
  const t = useT();
  const letra = { W: t('painelv.v'), D: t('painelv.e'), L: t('painelv.d') };
  return (
    <ol className="fita" style={{ '--n': String(jogos.length) }}>
      {jogos.map((j) => (
        <li key={j.matchId} className="fita__item">
          <button
            type="button"
            className={`fita__marca is-${j.resultado === 'W' ? 'v' : j.resultado === 'L' ? 'd' : 'e'}`}
            title={`${j.adversario} ${j.nossos}–${j.deles}`}
            aria-label={t('painelv.verJogo', {
              adversario: j.adversario,
              nossos: j.nossos,
              deles: j.deles,
            })}
            onClick={() => onAbrir?.(j.matchId)}
          >
            {letra[j.resultado]}
          </button>
          <span className="fita__placar mono">
            {j.nossos}–{j.deles}
          </span>
          {/* A casa de cada jogo. É uma bolinha e não a palavra "Casa": numa
              fita de oito jogos, oito palavras tapavam os resultados. */}
          <span className={`fita__onde ${j.casa ? 'is-casa' : ''}`} aria-hidden="true" />
          <span className="fita__adv">{j.adversario}</span>
        </li>
      ))}
    </ol>
  );
}
