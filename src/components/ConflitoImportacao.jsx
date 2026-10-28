'use client';

// components/ConflitoImportacao.jsx — o jogador que sai e cujo número fica a outro.
//
// A importação dá o número de alguém que nunca foi convocado a um jogador do
// ficheiro. O antigo sai do plantel de qualquer maneira; o que se pergunta é
// como: deixá-lo inativo (continua na lista de inativos) ou apagá-lo de vez.

import { Dialog } from '@/lib/ui.jsx';
import { useT } from '@/lib/i18n/index.js';

export default function ConflitoImportacao({ conflito, onEscolher, onClose }) {
  const t = useT();
  return (
    <Dialog title={t('plantelCsv.conflitoTitulo')} onClose={onClose}>
      <div className="prose">
        <p>
          {t('plantelCsv.conflitoTexto', {
            n: conflito.numero,
            antigo: conflito.antigo.name,
            novo: conflito.novoNome,
          })}
        </p>
      </div>
      <footer className="modal__actions">
        <button className="btn btn--ghost" onClick={onClose}>
          {t('comum.cancelar')}
        </button>
        <button className="btn btn--danger btn--ghost" onClick={() => onEscolher('apagar')}>
          {t('plantelCsv.conflitoApagar')}
        </button>
        <button className="btn btn--primary" onClick={() => onEscolher('inativo')}>
          {t('plantelCsv.conflitoInativo')}
        </button>
      </footer>
    </Dialog>
  );
}
