'use client';

// Visão geral do clube: os seus escalões.
//
// O clube não tem estatísticas próprias — juntar um Sub-15 com os séniores não
// diz nada a ninguém. O que se vê aqui é a porta de entrada de cada escalão,
// com o pouco que ajuda a escolher: quantos jogadores, quantos jogos, como
// correu o último.

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import PageHead from '@/components/PageHead.jsx';
import Emblema from '@/components/Emblema.jsx';
import { Empty } from '@/components/bits.jsx';
import { clubs, teams, players, profile, loadTeamMatchStates } from '@/lib/data/repository.js';
import { DATA_UPDATED_EVENT } from '@/lib/data/sync.js';
import { matchResult } from '@/domain/stats.js';
import { MATCH_STATUS, timingOf } from '@/domain/constants.js';
import { timingShort, ultimoJogoLabel } from '@/lib/format.js';
import { rotas, comOrigem } from '@/lib/routes.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import useSouDono from '@/lib/useSouDono.js';
import { useT } from '@/lib/i18n/index.js';
import { setGuidedTutorialStepById } from '@/lib/tutorial.js';

export default function ClubPage() {
  return (
    <Pagina>
      <Escaloes />
    </Pagina>
  );
}

function Escaloes() {
  const { clubId } = useRouteParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const [dados, setDados] = useState(null);
  const soLeitura = useSoLeitura();
  const souDono = useSouDono(clubId);
  const mostrarEscaloes = searchParams.get('view') === 'teams';

  const carregar = useCallback(async () => {
    const club = await clubs.get(clubId);
    if (!club) return setDados({ club: null });
    const lista = await teams.listByClub(clubId);
    const cartoes = [];
    for (const team of lista) {
      const [plantel, entries] = await Promise.all([
        players.listByTeam(team.id),
        loadTeamMatchStates(team.id),
      ]);
      const terminados = entries.filter((e) => e.state.status === MATCH_STATUS.FINISHED);
      cartoes.push({
        team,
        ativos: plantel.filter((p) => p.isActive).length,
        jogos: entries.length,
        ultimo: terminados[0] || null,
      });
    }
    // A licença decide se o botão de criar escalão aparece. É a mesma regra do
    // clube: a de Treinador dá direito a um, e um botão que existe só para
    // recusar depois de a pessoa ter escrito o nome não é um botão, é uma
    // partida. Quem trava a sério continua a ser o gatilho `limite_de_escaloes`.
    const licenca = (await profile.get())?.licenca || 'treinador';
    setDados({ club, cartoes, licenca });
  }, [clubId]);

  useEffect(() => {
    carregar();
    const aoAtualizar = () => carregar();
    window.addEventListener(DATA_UPDATED_EVENT, aoAtualizar);
    return () => window.removeEventListener(DATA_UPDATED_EVENT, aoAtualizar);
  }, [carregar]);

  useEffect(() => {
    if (mostrarEscaloes || !dados?.cartoes?.length) return;
    router.replace(rotas.plantel(clubId, dados.cartoes[0].team.id));
  }, [clubId, dados, mostrarEscaloes, router]);

  if (!dados) return <p className="muted">{t('comum.aCarregar')}</p>;
  if (!dados.club) return <Empty>{t('clube.naoEncontrado')}</Empty>;

  const { club, cartoes, licenca } = dados;

  if (cartoes.length && !mostrarEscaloes) {
    return <p className="muted">{t('comum.aCarregar')}</p>;
  }

  // Com licença de Clube, os escalões que quiser. Com a de Treinador, um — e
  // depois de o ter, o botão desaparece em vez de prometer um segundo.
  const podeCriarEscalao = licenca === 'clube' || cartoes.length === 0;

  return (
    <>
      <PageHead
        title={club.name}
        subtitle={
          club.currentSeason
            ? t('escalao.epoca', { epoca: club.currentSeason })
            : t('clube.escaloesDoClube')
        }
        backTo={mostrarEscaloes ? null : rotas.dashboard()}
        // Mexer no clube e abrir escalões é de quem é dono do clube. Um
        // treinador associado vê esta página — são os escalões a que tem acesso
        // — mas não gere a estrutura.
        actions={
          mostrarEscaloes || soLeitura || !souDono ? null : (
            <>
              <button
                className="btn btn--ghost"
                onClick={() => router.push(comOrigem(rotas.clubeEditar(clubId), { atras: rotas.clube(clubId) }))}
              >
                {t('clube.editarTitulo')}
              </button>
              {podeCriarEscalao ? (
                <button
                  className="btn btn--primary"
                  data-tour="create-team"
                  onClick={() => router.push(rotas.escalaoNovo(clubId))}
                >
                  {t('clube.criarEscalao')}
                </button>
              ) : null}
            </>
          )
        }
      />

      {mostrarEscaloes && podeCriarEscalao && souDono ? (
        <div className="form__actions form__actions--left club-list-actions">
          <button
            className="btn btn--primary btn--tiny"
            data-tour="create-team"
            onClick={() => router.push(rotas.escalaoNovo(clubId))}
          >
            {t('clube.criarEscalao')}
          </button>
        </div>
      ) : null}

      {!cartoes.length ? (
        <Empty
          action={
            souDono ? (
              <button
                className="btn btn--primary"
                data-tour="create-team"
                onClick={() => router.push(rotas.escalaoNovo(clubId))}
              >
                {t('clube.primeiroEscalao')}
              </button>
            ) : null
          }
        >
          {/* Sem escalão nenhum e sem ser dono: está associado ao clube mas
              ainda não lhe deram acesso a nada. Dizer-lho é melhor do que uma
              página vazia com um botão que ele não pode usar. */}
          {souDono ? t('clube.semEscaloes') : t('clube.semAcessoAEscaloes')}
        </Empty>
      ) : (
        <div className={`grid grid--cards ${cartoes.length === 1 ? 'grid--um' : ''}`}>
          {cartoes.map(({ team, ativos, jogos, ultimo }) => (
            <article
              key={team.id}
              className="card club-card"
              style={{ borderTopColor: club.primaryColor || '#22c55e' }}
            >
              {/* O lápis a quem pode editar: o dono, e quem recebeu "Ver e
                  editar". Apagar o escalão continua a ser só do dono, e isso
                  decide-se lá dentro — aqui só se abre o formulário. */}
              {soLeitura || (!souDono && team.nivel === 'ver') ? null : (
                <button
                  className="card__edit"
                  title={t('clube.editarEscalao')}
                  aria-label={t('clube.editarNome', { nome: team.name })}
                  onClick={() =>
                    router.push(
                      comOrigem(rotas.escalaoEditar(clubId, team.id), { atras: rotas.clube(clubId) })
                    )
                  }
                >
                  {t('comum.editar')}
                </button>
              )}
              <header className="club-card__head">
                {/* O escalão mostra a sua foto se a tiver; se não, as iniciais
                    sobre a cor do clube, que é a que já usava. */}
                <Emblema
                  nome={team.shortName || team.name}
                  foto={team.logoUrl}
                  cor={club.primaryColor}
                />
                <div>
                  <h2>{team.name}</h2>
                  <p className="muted">{timingShort(timingOf(team))}</p>
                </div>
              </header>
              <dl className="club-card__stats">
                <div>
                  <dt>{t('painel.jogadoresAtivos')}</dt>
                  <dd>{ativos}</dd>
                </div>
                <div>
                  <dt>{t('painel.jogosRegistados')}</dt>
                  <dd>{jogos}</dd>
                </div>
                <div>
                  <dt>{t('painel.ultimoJogo')}</dt>
                  <dd className="small">
                    {ultimoJogoLabel(ultimo, ultimo && matchResult(ultimo.state))}
                  </dd>
                </div>
              </dl>
              <div className="club-card__actions">
                <button
                  className="btn btn--primary"
                  data-tour="open-team"
                  onClick={() => {
                    setGuidedTutorialStepById('players');
                    router.push(rotas.plantel(clubId, team.id));
                  }}
                >
                  {t('clube.abrirEscalao')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
