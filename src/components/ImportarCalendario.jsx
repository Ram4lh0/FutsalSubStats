'use client';

// components/ImportarCalendario.jsx — explicar o ficheiro do calendário antes de o pedir.
//
// O mesmo desenho da janela do plantel (ImportarPlantel.jsx), mais curto, com
// um aviso à parte: a competição tem de estar escrita exatamente como na aba
// Competições. Por isso a janela mostra os nomes tal e qual estão definidos —
// é mais fácil copiar do que adivinhar onde está a maiúscula ou o acento.

import { Dialog } from '@/lib/ui.jsx';
import { download } from '@/lib/data/exporter.js';
import { calendarioExemploCsv } from '@/lib/data/calendarioCsv.js';
import { useT } from '@/lib/i18n/index.js';

export default function ImportarCalendario({ competicoes, onEscolher, onClose }) {
  const t = useT();
  const nomes = competicoes.map((c) => c.name).filter(Boolean);

  return (
    <Dialog title={t('calendarioCsv.titulo')} onClose={onClose}>
      <div className="prose">
        <p>{t('calendarioCsv.formato')}</p>
        <p className="muted">{t('calendarioCsv.opcionais')}</p>

        <div className="card card--inset ccal__aviso">
          <p>
            <strong>⚠ {t('calendarioCsv.avisoTitulo')}</strong>
          </p>
          <p className="muted small">{t('calendarioCsv.avisoTexto')}</p>
          {nomes.length ? (
            <ul className="ccal__provas">
              {nomes.map((n) => (
                <li key={n}>
                  <code>{n}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small">{t('calendarioCsv.semCompeticoes')}</p>
          )}
        </div>

        <div className="card card--inset">
          <p className="muted small">{t('calendarioCsv.semFicheiro')}</p>
          <button
            className="btn btn--ghost"
            onClick={() =>
              download(
                t('calendarioCsv.exemploNome'),
                calendarioExemploCsv(competicoes),
                'text/csv;charset=utf-8'
              )
            }
          >
            {t('calendarioCsv.exemplo')}
          </button>
        </div>

        <p className="muted">{t('calendarioCsv.acrescenta')}</p>
      </div>

      <footer className="modal__actions">
        <button className="btn btn--ghost" onClick={onClose}>
          {t('comum.cancelar')}
        </button>
        <button className="btn btn--primary" onClick={onEscolher} disabled={!nomes.length}>
          {t('calendarioCsv.escolher')}
        </button>
      </footer>
    </Dialog>
  );
}
