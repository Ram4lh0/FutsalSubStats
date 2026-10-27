'use client';

// components/ImportarCalendario.jsx — explicar o ficheiro do calendário antes de o pedir.
//
// O mesmo desenho da janela do plantel (ImportarPlantel.jsx), mais curto, com
// um aviso à parte: a competição tem de estar escrita exatamente como na aba
// Competições. Por isso a janela mostra os nomes tal e qual estão definidos —
// é mais fácil copiar do que adivinhar onde está a maiúscula ou o acento.
//
// Quando se importa a partir de uma competição (`competicaoFixa`), o aviso não
// faz sentido: todos os jogos entram nela, e o ficheiro só precisa de quatro
// colunas.
//
// O fluxo inteiro (licença, janela, ficheiro, confirmar, criar) está em
// `useImportarCalendario`, para o mesmo botão poder viver nos Jogos, no
// Plantel, nas Competições e logo a seguir a criar uma competição.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, useUI } from '@/lib/ui.jsx';
import { download, pickFile } from '@/lib/data/exporter.js';
import { calendarioExemploCsv, lerCalendarioCsv } from '@/lib/data/calendarioCsv.js';
import { clubs, competitions, matches, loadTeamMatchStates } from '@/lib/data/repository.js';
import { canCreateMatch } from '@/lib/entitlements.js';
import { rotas } from '@/lib/routes.js';
import { useAuth } from '@/lib/auth.jsx';
import * as sync from '@/lib/data/sync.js';
import { useT } from '@/lib/i18n/index.js';

export default function ImportarCalendario({ competicoes, competicaoFixa, onEscolher, onClose }) {
  const t = useT();
  const nomes = competicoes.map((c) => c.name).filter(Boolean);
  const exemplo = competicaoFixa ? [competicaoFixa] : competicoes;

  return (
    <Dialog title={t('calendarioCsv.titulo')} onClose={onClose}>
      <div className="prose">
        {competicaoFixa ? (
          <>
            <p>{t('calendarioCsv.formatoFixo')}</p>
            <p className="muted">{t('calendarioCsv.opcionais')}</p>
            <div className="card card--inset ccal__aviso">
              <p>{t('calendarioCsv.todosNaCompeticao', { nome: competicaoFixa.name })}</p>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}

        <div className="card card--inset">
          <p className="muted small">{t('calendarioCsv.semFicheiro')}</p>
          <button
            className="btn btn--ghost"
            onClick={() =>
              download(
                t('calendarioCsv.exemploNome'),
                calendarioExemploCsv(exemplo, { fixa: !!competicaoFixa }),
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
        <button
          className="btn btn--primary"
          onClick={onEscolher}
          disabled={!competicaoFixa && !nomes.length}
        >
          {t('calendarioCsv.escolher')}
        </button>
      </footer>
    </Dialog>
  );
}

/**
 * Importar o calendário de um CSV.
 *
 * As mesmas paragens do plantel: explicar o formato, ler e mostrar o que se
 * percebeu (com as linhas más e porquê), e só então criar os jogos.
 *
 * Só com licença ativa. Sem licença, o servidor conta cada jogo **criado** como
 * um dos quatro grátis — importar um calendário gastava-os todos de uma vez e
 * deixava o resto da fila encalhada a ser recusado.
 *
 * Os jogos e as competições são lidos na hora, e não passados por quem chama:
 * a seguir a criar uma competição, ela ainda não está em nenhuma lista.
 *
 * @returns {{ importar: (opcoes?: {competicaoFixa?: object}) => Promise<boolean>, aImportar: boolean }}
 *   `importar` devolve `true` se chegou a criar jogos.
 */
export function useImportarCalendario({ clubId, teamId }) {
  const t = useT();
  const router = useRouter();
  const { open, confirmar, toast } = useUI();
  const { userId, user } = useAuth();
  const [aImportar, setAImportar] = useState(false);

  async function importar({ competicaoFixa = null } = {}) {
    if (aImportar) return false;
    const permissao = await canCreateMatch();
    if (!permissao.licensed && !permissao.licenseActive) {
      const ir = await confirmar(t('calendarioCsv.precisaLicenca'), {
        okLabel: t('calendarioCsv.verLicencas'),
        danger: false,
        title: t('calendarioCsv.titulo'),
      });
      if (ir) router.push(`${rotas.conta()}#licencas`);
      return false;
    }

    const [entries, provas] = await Promise.all([
      loadTeamMatchStates(teamId),
      competitions.listByTeam(teamId),
    ]);

    const quer = await open((close) => (
      <ImportarCalendario
        competicoes={provas}
        competicaoFixa={competicaoFixa}
        onEscolher={() => close(true)}
        onClose={() => close(false)}
      />
    ));
    if (!quer) return false;

    const bruto = await pickFile('.csv,text/csv');
    if (!bruto) return false;

    const { jogos, repetidos, problemas } = lerCalendarioCsv(bruto, {
      competicoes: provas,
      existentes: entries.map((e) => e.match),
      competicaoFixa,
    });

    const listaProblemas = problemas.length
      ? '\n\n' +
        t('calendarioCsv.problemasTitulo', { n: problemas.length }) +
        '\n' +
        problemas
          .map((p) => `${p.linha ? t('plantelCsv.linhaN', { linha: p.linha }) + ' ' : ''}${t(p.chave, p.valores)}`)
          .join('\n')
      : '';
    const textoRepetidos = repetidos ? ' ' + t('calendarioCsv.repetidos', { n: repetidos }) : '';

    if (!jogos.length) {
      toast(t('calendarioCsv.nadaAImportar') + textoRepetidos + listaProblemas, 'error', 9000);
      return false;
    }

    const ok = await confirmar(
      t(jogos.length === 1 ? 'calendarioCsv.lidosUm' : 'calendarioCsv.lidos', { n: jogos.length }) +
        textoRepetidos +
        listaProblemas,
      { okLabel: t('calendarioCsv.importar'), danger: false, title: t('calendarioCsv.confirmarTitulo') }
    );
    if (!ok) return false;

    setAImportar(true);
    try {
      const clube = await clubs.get(clubId);
      for (const j of jogos) {
        await matches.create(teamId, {
          opponentName: j.opponentName,
          competitionId: j.competitionId,
          homeOrAway: j.homeOrAway,
          scheduledAt: j.scheduledAt,
          season: clube?.currentSeason || null,
        });
      }
      toast(t('calendarioCsv.importados', { n: jogos.length }), 'ok', 4000);
      sync.saveNow(userId, user?.email);
      return true;
    } finally {
      setAImportar(false);
    }
  }

  return { importar, aImportar };
}
