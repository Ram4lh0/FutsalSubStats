'use client';

// Aba Jogos do escalão.
//
// Em cima, "Importar calendário": o calendário da associação, de uma folha de
// cálculo, para não escrever vinte jogos à mão (ver lib/data/calendarioCsv.js).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import MatchList from '@/components/MatchList.jsx';
import ImportarCalendario from '@/components/ImportarCalendario.jsx';
import { Empty } from '@/components/bits.jsx';
import { rotas } from '@/lib/routes.js';
import { useAuth } from '@/lib/auth.jsx';
import { useUI } from '@/lib/ui.jsx';
import { clubs, matches } from '@/lib/data/repository.js';
import { pickFile } from '@/lib/data/exporter.js';
import { lerCalendarioCsv } from '@/lib/data/calendarioCsv.js';
import { canCreateMatch } from '@/lib/entitlements.js';
import * as sync from '@/lib/data/sync.js';
import { useT } from '@/lib/i18n/index.js';

export default function TeamMatchesPage() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const t = useT();
  const { clubId, teamId } = useRouteParams();
  const router = useRouter();
  const { userId } = useAuth();
  const soLeitura = useSoLeitura(teamId);

  useEffect(() => {
    if (!userId) return;
    sync.pull(userId, { repararJogosIncompletos: true }).catch(() => {
      /* sem rede: a lista fica com o que o dispositivo já tem */
    });
  }, [userId]);

  return (
    <TeamShell clubId={clubId} teamId={teamId}>
      {({ entries, competitions }) => (
        <>
          {soLeitura ? null : (
            <BarraImportar clubId={clubId} teamId={teamId} entries={entries} competitions={competitions} />
          )}
          {entries.length ? (
            <Jogos entries={entries} competitions={competitions} clubId={clubId} teamId={teamId} />
          ) : (
            <Empty
              action={
                <button
                  className="btn btn--primary"
                  data-tour="create-match"
                  onClick={() => router.push(rotas.jogoNovo(clubId, teamId))}
                >
                  {t('escalao.criarJogo')}
                </button>
              }
            >
              {t('escalao.semJogos')}
            </Empty>
          )}
        </>
      )}
    </TeamShell>
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
 */
function BarraImportar({ clubId, teamId, entries, competitions }) {
  const t = useT();
  const router = useRouter();
  const { open, confirmar, toast } = useUI();
  const { userId, user } = useAuth();
  const [aImportar, setAImportar] = useState(false);

  async function importar() {
    if (aImportar) return;
    const permissao = await canCreateMatch();
    if (!permissao.licensed && !permissao.licenseActive) {
      const ir = await confirmar(t('calendarioCsv.precisaLicenca'), {
        okLabel: t('calendarioCsv.verLicencas'),
        danger: false,
        title: t('calendarioCsv.titulo'),
      });
      if (ir) router.push(`${rotas.conta()}#licencas`);
      return;
    }

    const quer = await open((close) => (
      <ImportarCalendario
        competicoes={competitions}
        onEscolher={() => close(true)}
        onClose={() => close(false)}
      />
    ));
    if (!quer) return;

    const bruto = await pickFile('.csv,text/csv');
    if (!bruto) return;

    const { jogos, repetidos, problemas } = lerCalendarioCsv(bruto, {
      competicoes: competitions,
      existentes: entries.map((e) => e.match),
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
      return;
    }

    const ok = await confirmar(
      t(jogos.length === 1 ? 'calendarioCsv.lidosUm' : 'calendarioCsv.lidos', { n: jogos.length }) +
        textoRepetidos +
        listaProblemas,
      { okLabel: t('calendarioCsv.importar'), danger: false, title: t('calendarioCsv.confirmarTitulo') }
    );
    if (!ok) return;

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
    } finally {
      setAImportar(false);
    }
  }

  return (
    <div className="area-actions area-actions--compact">
      <span className="toolbar__spacer" />
      <button className="btn btn--ghost btn--tiny" onClick={importar} disabled={aImportar}>
        {t('calendarioCsv.botao')}
      </button>
    </div>
  );
}

function Jogos({ entries, competitions, clubId, teamId }) {
  const router = useRouter();
  const t = useT();
  const [mostrarTudo, setMostrarTudo] = useState(false);
  const limite = 7;
  const temMais = entries.length > limite;

  return (
    <>
      <MatchList
        entries={entries}
        competitions={competitions}
        backPath={rotas.jogos(clubId, teamId)}
        limit={mostrarTudo ? null : limite}
      />
      {temMais && !mostrarTudo ? (
        <div className="matches-showmore">
          <button className="btn btn--ghost btn--tiny" onClick={() => setMostrarTudo(true)}>
            {t('lista.mostrarMais')}
          </button>
        </div>
      ) : null}
      <div className="form__actions matches-actions">
        {temMais && mostrarTudo ? (
          <button className="btn btn--ghost btn--tiny" onClick={() => setMostrarTudo(false)}>
            {t('lista.mostrarMenos')}
          </button>
        ) : null}
        <span className="toolbar__spacer" />
        <button
          className="btn btn--primary btn--tiny"
          data-tour="create-match"
          onClick={() => router.push(rotas.jogoNovo(clubId, teamId))}
        >
          {t('escalao.novoJogo')}
        </button>
      </div>
    </>
  );
}
