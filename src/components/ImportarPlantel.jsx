'use client';

// components/ImportarPlantel.jsx — a janela que explica o ficheiro antes de o pedir.
//
// Porque não abre logo o selector de ficheiros: a primeira pergunta de quem
// carrega em "Importar" não é "qual ficheiro?" mas "que formato é que isto
// quer?". Abrir a janela do sistema sem responder a isso manda a pessoa
// adivinhar, e o mais provável é voltar com um ficheiro que não serve.
//
// A resposta está em três partes, por ordem de utilidade:
//
//   1. O que as colunas são — e que é o mesmo ficheiro que sai do "Exportar".
//   2. Um exemplo para descarregar, porque mostrar poupa a explicação toda.
//   3. O aviso do que a importação faz ao plantel que já lá está.
//
// O exemplo é uma equipa inventada com uma linha por posição. Abre no Excel,
// trocam-se os nomes, importa-se — que é exactamente o percurso de quem tem o
// plantel escrito numa folha e o quer meter aqui sem o escrever outra vez.

import { Dialog } from '@/lib/ui.jsx';
import { download } from '@/lib/data/exporter.js';
import { plantelExemploCsv } from '@/lib/data/plantelCsv.js';
import { useT } from '@/lib/i18n/index.js';

export default function ImportarPlantel({ onEscolher, onClose }) {
  const t = useT();

  return (
    <Dialog title={t('plantelCsv.titulo')} onClose={onClose}>
      <div className="prose">
        <p>{t('plantelCsv.formato')}</p>
        <p className="muted">{t('plantelCsv.opcionais')}</p>

        <div className="card card--inset">
          <p className="muted small">{t('plantelCsv.semFicheiro')}</p>
          <button
            className="btn btn--ghost"
            onClick={() =>
              download(
                t('plantelCsv.exemploNome'),
                plantelExemploCsv(),
                'text/csv;charset=utf-8'
              )
            }
          >
            {t('plantelCsv.exemplo')}
          </button>
        </div>

        <p className="muted">{t('plantelCsv.aviso')}</p>
      </div>

      <footer className="modal__actions">
        <button className="btn btn--ghost" onClick={onClose}>
          {t('comum.cancelar')}
        </button>
        <button className="btn btn--primary" onClick={onEscolher}>
          {t('plantelCsv.escolher')}
        </button>
      </footer>
    </Dialog>
  );
}
