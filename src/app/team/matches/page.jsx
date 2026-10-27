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
import { useImportarCalendario } from '@/components/ImportarCalendario.jsx';
import JogosAoVivo from '@/components/JogosAoVivo.jsx';
import { Empty } from '@/components/bits.jsx';
import { rotas } from '@/lib/routes.js';
import { useAuth } from '@/lib/auth.jsx';
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
            <BarraImportar clubId={clubId} teamId={teamId} />
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
          {/* Add-on 'ao-vivo': só aparece se houver algum jogo para acompanhar. */}
          <JogosAoVivo />
        </>
      )}
    </TeamShell>
  );
}

/** O botão de importar o calendário (o fluxo está em ImportarCalendario.jsx). */
function BarraImportar({ clubId, teamId }) {
  const t = useT();
  const { importar, aImportar } = useImportarCalendario({ clubId, teamId });

  return (
    <div className="area-actions area-actions--compact">
      <span className="toolbar__spacer" />
      <button className="btn btn--ghost btn--tiny" onClick={() => importar()} disabled={aImportar}>
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
