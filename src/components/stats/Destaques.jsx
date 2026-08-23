'use client';

// components/stats/Destaques.jsx — os melhores da época, e o 5v4.
//
// A tabela por jogador tem catorze colunas e responde a tudo. O problema é que
// não responde a nada de relance: para saber quem marcou mais é preciso
// percorrê-la com o dedo e comparar números à mão.
//
// Estes cartões são a leitura rápida que faltava. Três nomes por categoria, que
// é o que se guarda de cabeça, e um botão para a lista inteira quando o terceiro
// não chega.

import { StatCard, DiffCard } from '@/components/bits.jsx';
import { useUI, Dialog } from '@/lib/ui.jsx';
import { fmt } from '@/domain/clock.js';
import { useT } from '@/lib/i18n/index.js';

/**
 * As quatro categorias, por esta ordem.
 *
 * `golos` e `assistencias` são mérito individual; as participações são o que a
 * equipa produziu com aquele jogador em campo. Ficam a seguir, e não à frente,
 * porque são o número que mais se presta a ser mal lido.
 *
 * As participações em golos sofridos são uma lista de "esteve lá quando
 * aconteceu", não de culpados — daí a etiqueta por extenso em vez da abreviatura
 * da tabela.
 */
const CATEGORIAS = [
  { chave: 'goals', etiqueta: 'stats.topGolos' },
  { chave: 'assists', etiqueta: 'stats.topAssistencias' },
  { chave: 'goalShare', etiqueta: 'stats.topPartG' },
  { chave: 'concededShare', etiqueta: 'stats.topPartGS' },
];

/** Ordena por uma coluna, com o número da camisola a desempatar. */
function ordenar(linhas, chave) {
  return [...linhas]
    .filter((p) => (p[chave] || 0) > 0)
    .sort((a, b) => (b[chave] || 0) - (a[chave] || 0) || a.number - b.number);
}

function Lugar({ i, p, valor }) {
  return (
    <li className="destaque__linha">
      <span className="destaque__pos">{i + 1}</span>
      <span className="destaque__nome">{p.name}</span>
      <span className="destaque__valor mono">{valor}</span>
    </li>
  );
}

/**
 * Um top 3 de uma coluna qualquer.
 *
 * Exportado porque o painel de gráficos precisa exactamente do mesmo cartão
 * para as faltas e os cartões: mesma forma, mesmo `+` para a lista inteira. Duas
 * cópias do mesmo desenho divergiam à terceira alteração.
 *
 * Serve qualquer lista cujos elementos tenham `playerId`, `name`, `number` e a
 * coluna pedida.
 */
/**
 * Pinta a última palavra do título com a cor do cartão.
 *
 * "Mais amarelos" com tudo amarelo lê-se como um aviso; o que se quer é que a
 * palavra *amarelos* seja da cor dos cartões de que fala, e o resto do título
 * fique como qualquer outro. Vai sempre a última palavra porque é aí que a cor
 * está nas três línguas — "Mais amarelos", "Most yellows", "Más amarillas".
 */
function comCor(titulo, cor) {
  if (!cor) return titulo;
  const i = titulo.lastIndexOf(' ');
  if (i < 0) return <span className={`cartao-cor cartao-cor--${cor}`}>{titulo}</span>;
  return (
    <>
      {titulo.slice(0, i + 1)}
      <span className={`cartao-cor cartao-cor--${cor}`}>{titulo.slice(i + 1)}</span>
    </>
  );
}

export function CartaoTop({ etiqueta, linhas, chave, cor }) {
  const t = useT();
  const ui = useUI();
  const ordenadas = ordenar(linhas, chave);
  const titulo = t(etiqueta);

  function verTodos() {
    ui.open((close) => (
      <Dialog title={titulo} onClose={() => close(null)}>
        {ordenadas.length ? (
          <ol className="destaque__lista destaque__lista--completa">
            {ordenadas.map((p, i) => (
              <Lugar key={p.playerId} i={i} p={p} valor={p[chave]} />
            ))}
          </ol>
        ) : (
          <p className="muted">{t('stats.semDados')}</p>
        )}
      </Dialog>
    ));
  }

  return (
    <div className="card destaque">
      <div className="destaque__topo">
        <span className="stat__label">{comCor(titulo, cor)}</span>
        {/* O `+` só aparece quando há mais do que os três à vista. Sem isso era
            um botão que abre uma janela a repetir o que já está no cartão. */}
        {ordenadas.length > 3 ? (
          <button
            className="btn btn--tiny btn--plus"
            onClick={verTodos}
            title={t('stats.verTodos')}
            aria-label={t('stats.verTodosDe', { categoria: titulo })}
          >
            +
          </button>
        ) : null}
      </div>
      {ordenadas.length ? (
        <ol className="destaque__lista">
          {ordenadas.slice(0, 3).map((p, i) => (
            <Lugar key={p.playerId} i={i} p={p} valor={p[chave]} />
          ))}
        </ol>
      ) : (
        <p className="muted small">{t('stats.semDados')}</p>
      )}
    </div>
  );
}

/**
 * O cartão do 5v4, com o detalhe atrás.
 *
 * Fica ao lado dos tops e não dentro deles porque não é um ranking: é uma
 * situação de jogo, e o que interessa saber dela é se compensa.
 */
function Cartao5v4({ pp }) {
  const t = useT();
  const ui = useUI();

  function verDetalhes() {
    ui.open((close) => (
      <Dialog title={t('stats.detalhes5v4')} onClose={() => close(null)} wide>
        {pp.periodos ? (
          <>
            <div className="grid grid--stats">
              <StatCard label={t('stats.golosEm5v4')} value={pp.golosA} />
              <StatCard label={t('stats.sofridosEm5v4')} value={pp.golosContra} />
              {/* A diferença é o número que decide se a jogada compensa, e por
                  isso é a única pintada: verde acima de zero, vermelho abaixo. */}
              <DiffCard label={t('stats.diferenca')} value={pp.saldo} />
              <StatCard
                label={t('stats.mediaPorJogo5v4')}
                value={fmt(pp.mediaPorJogoMs)}
                hint={t('stats.emJogos', { n: pp.jogosCom })}
              />
              {/* Com que frequência se recorre a isto. Dois treinadores com o
                  mesmo tempo total podem ter chegado lá de maneiras opostas:
                  um pouco em muitos jogos, ou muito em dois. */}
              <StatCard
                label={t('stats.percentagem5v4')}
                value={`${pp.percentagemJogos}%`}
                hint={t('stats.deJogos', { com: pp.jogosCom, total: pp.jogosTotal })}
              />
            </div>

            <h3 className="section">{t('stats.tempoPorJogador5v4')}</h3>
            <ol className="destaque__lista destaque__lista--completa">
              {pp.jogadores.map((j, i) => (
                <Lugar key={j.playerId} i={i} p={j} valor={fmt(j.ms)} />
              ))}
            </ol>
          </>
        ) : (
          <p className="muted">{t('stats.sem5v4')}</p>
        )}
      </Dialog>
    ));
  }

  return (
    <div className="card destaque">
      <div className="destaque__topo">
        <span className="stat__label">{t('stats.cincoQuatro')}</span>
      </div>
      <p className="stat__value">{fmt(pp.totalMs)}</p>
      <p className="muted small">
        {t('stats.periodos5v4', { n: pp.periodos, jogos: pp.jogosCom })}
      </p>
      <button className="btn btn--ghost btn--block" onClick={verDetalhes}>
        {t('stats.verDetalhes5v4')}
      </button>
    </div>
  );
}

export default function Destaques({ linhas, pp }) {
  return (
    <div className="grid grid--destaques">
      {CATEGORIAS.map((c) => (
        <CartaoTop key={c.chave} etiqueta={c.etiqueta} chave={c.chave} linhas={linhas} />
      ))}
      <Cartao5v4 pp={pp} />
    </div>
  );
}
