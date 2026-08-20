'use client';

// components/bits.jsx — peças pequenas que aparecem em quase todos os ecrãs.

import { useRouter, usePathname } from 'next/navigation';
import { statusLabel, statusKind } from '@/lib/format.js';
import { useT } from '@/lib/i18n/index.js';
import { rotas, abaActiva } from '@/lib/routes.js';
import PageHead from './PageHead.jsx';

export function Empty({ children, action }) {
  return (
    <div className="empty">
      <p>{children}</p>
      {action || null}
    </div>
  );
}

export function Badge({ children, kind = '' }) {
  return <span className={`badge ${kind ? `badge--${kind}` : ''}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  return <Badge kind={statusKind(status)}>{statusLabel(status)}</Badge>;
}

/**
 * Vitórias, empates e derrotas.
 *
 * Era um texto só — `${wins} / ${draws} / ${losses}` — e lia-se mal em qualquer
 * largura: três números iguais, separados por barras do mesmo peso, sem nada
 * que dissesse qual é qual. Num telemóvel ainda podia partir a meio.
 *
 * Aqui cada número tem a sua cor — a mesma convenção de qualquer classificação
 * — e as barras ficam ténues, que é o papel delas. A cor não é a única pista:
 * a ordem V/E/D mantém-se e o cabeçalho continua lá, para quem não distinga
 * verde de vermelho.
 *
 * Com `head`, é o cabeçalho da tabela: as mesmas caixas, com as letras em vez
 * dos números e sem cor própria. É o que faz o V cair por cima das vitórias e o
 * D por cima das derrotas — antes era um texto solto que aterrava onde calhava.
 */
export function Ved({ v, e, d, head = false }) {
  return (
    <span className={`ved ${head ? 'ved--head' : ''}`}>
      <b className="ved__v">{v}</b>
      <i>/</i>
      <b className="ved__e">{e}</b>
      <i>/</i>
      <b className="ved__d">{d}</b>
    </span>
  );
}

/** `kind` pinta o cartão: 'win' | 'draw' | 'loss'. */
/** Com `onClick` o cartão passa a botão — para os que abrem o detalhe por trás. */

export function StatCard({ label, value, hint, kind, onClick }) {
  const conteudo = (
    <>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {hint ? <span className="stat__hint">{hint}</span> : null}
    </>
  );
  const classe = `stat ${kind ? `stat--${kind}` : ''}`;
  return onClick ? (
    <button type="button" className={`${classe} stat--clickable`} onClick={onClick}>
      {conteudo}
    </button>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

/**
 * Diferença de golos: com sinal e pintada.
 *
 * É o único número destas grelhas que tem lado bom e lado mau — os outros são
 * contagens, e um 12 não é melhor nem pior do que um 3 sem se saber de quê. Aqui
 * o zero é a fronteira, e a cor poupa a leitura do sinal.
 *
 * O `+` à frente das positivas é a outra metade: sem ele, um 3 e um −3 só se
 * distinguem por um traço fino que se perde de relance.
 */
export function DiffCard({ label, value, hint }) {
  return (
    <StatCard
      label={label}
      value={value > 0 ? `+${value}` : value}
      hint={hint}
      kind={value > 0 ? 'win' : value < 0 ? 'loss' : undefined}
    />
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

/**
 * O que se mostra a quem tenta editar durante o jogo de experiência.
 *
 * Estava escrito por extenso em quatro formulários — clube, escalão, competição
 * e jogador — palavra por palavra igual. Com três idiomas isso passaria a doze
 * cópias do mesmo parágrafo, e bastava uma ficar para trás.
 *
 * Esconder o botão de editar não chega: quem escrever o endereço à mão chega ao
 * formulário à mesma. É aqui que se trava.
 */
export function SoLeitura({ titulo }) {
  const router = useRouter();
  const t = useT();
  return (
    <>
      <PageHead title={titulo} backTo={rotas.dashboard()} />
      <Empty
        action={
          <button className="btn btn--primary" onClick={() => router.push(rotas.login())}>
            {t('soLeitura.criarConta')}
          </button>
        }
      >
        {t('soLeitura.texto')}
      </Empty>
    </>
  );
}

export function Tabs({ items }) {
  const router = useRouter();
  const pathname = usePathname();
  // Comparar o caminho actual com o destino da aba não é um `===`: um traz a
  // barra no fim e o outro traz os ids colados. A explicação está no
  // `abaActiva`, e é ela que faz a aba acender — antes disto não acendia
  // nenhuma, em ecrã nenhum.
  const activa = abaActiva(pathname, items.map((it) => it.to));
  return (
    <nav className="tabs">
      {items.map((it, i) => (
        <button
          key={it.to}
          className={`tab ${i === activa ? 'is-active' : ''}`}
          aria-current={i === activa ? 'page' : undefined}
          onClick={() => router.push(it.to)}
        >
          {it.label}
        </button>
      ))}
    </nav>
  );
}
