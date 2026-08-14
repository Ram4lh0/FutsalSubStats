'use client';

// components/bits.jsx — peças pequenas que aparecem em quase todos os ecrãs.

import { useRouter, usePathname } from 'next/navigation';
import { statusLabel, statusKind } from '@/lib/format.js';
import { useT } from '@/lib/i18n/index.js';
import { rotas } from '@/lib/routes.js';
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
  return (
    <nav className="tabs">
      {items.map((it) => (
        <button
          key={it.to}
          className={`tab ${pathname === it.to ? 'is-active' : ''}`}
          onClick={() => router.push(it.to)}
        >
          {it.label}
        </button>
      ))}
    </nav>
  );
}
