'use client';

// components/bits.jsx — peças pequenas que aparecem em quase todos os ecrãs.

import { useRouter, usePathname } from 'next/navigation';
import { statusLabel, statusKind } from '@/lib/format.js';

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
