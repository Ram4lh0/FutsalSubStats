'use client';

// Ficha do jogador.
//
// Três andares, do mais rápido de ler para o mais detalhado:
//   1. Os números que se vêm cá procurar, em cartões (jogos, tempo, golos,
//      assistências, saldo em campo) e a disciplina numa linha de etiquetas.
//   2. O painel do atleta: utilização, últimos jogos e um bloco por cada
//      registo extra que o escalão aponta (remates, recuperações, perdas, …).
//      Um escalão sem registos extra não vê blocos vazios.
//   3. O histórico jogo a jogo, numa tabela curta; o resto está no resumo de
//      cada jogo, a um toque da linha.
//
// Os totais vêm da mesma agregação da aba de estatísticas (`clubAggregate`) e
// os blocos do mesmo cálculo do painel do atleta (`painelDoAtleta`), para as
// três vistas nunca discordarem.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import PageHead from '@/components/PageHead.jsx';
import DataTable from '@/components/DataTable.jsx';
import { Empty, StatCard, DiffCard } from '@/components/bits.jsx';
import { BarrasH, FitaForma } from '@/components/stats/graficos.jsx';
import { clubs, teams, players, loadTeamMatchStates } from '@/lib/data/repository.js';
import { clubAggregate, matchStatsTable, matchResult } from '@/domain/stats.js';
import { extrasDoAtleta, painelDoAtleta } from '@/domain/dashboard.js';
import { BlocosExtrasAtleta } from '@/components/registos/ExtrasRegistos.jsx';
import { fmt } from '@/domain/clock.js';
import { FOOT, normalizePosition } from '@/domain/constants.js';
import { dayLabel, positionLabel, footLabel } from '@/lib/format.js';
import { rotas, comOrigem } from '@/lib/routes.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import { useT } from '@/lib/i18n/index.js';

const VAZIO = {
  matches: 0, courtMs: 0, goals: 0, assists: 0, goalShare: 0, concededShare: 0,
  conceded: 0, fouls: 0, foulsSuffered: 0, yellows: 0, reds: 0, avgCourtPerMatchMs: 0,
};

const um = (n) => (Number.isFinite(n) ? n.toFixed(1) : '—');

export default function PlayerPage() {
  return (
    <Pagina>
      <Ficha />
    </Pagina>
  );
}

/** Um bloco do painel do atleta, com o mesmo aspeto dos das estatísticas. */
function Bloco({ titulo, children, className = '' }) {
  return (
    <section className={`card painelv__bloco ${className}`.trim()}>
      <div className="painelv__bloco-head">
        <h2 className="section section--tight">{titulo}</h2>
      </div>
      {children}
    </section>
  );
}

function Ficha() {
  const { clubId, teamId, playerId } = useRouteParams();
  const router = useRouter();
  const t = useT();
  const [dados, setDados] = useState(null);
  const soLeitura = useSoLeitura(teamId);

  useEffect(() => {
    (async () => {
      const [player, club, team, entries, roster] = await Promise.all([
        players.get(playerId),
        clubs.get(clubId),
        teams.get(teamId),
        loadTeamMatchStates(teamId),
        players.listByTeam(teamId),
      ]);
      if (!player) return setDados({ player: null });

      const meus = entries
        .map(({ match, state }) => ({
          match,
          state,
          row: matchStatsTable(state, state.elapsedMatchMs || Date.now()).find(
            (r) => r.playerId === playerId
          ),
        }))
        .filter((e) => e.row);

      const agg = clubAggregate(entries, [player]).perPlayer[playerId] || VAZIO;
      setDados({
        player,
        club,
        team,
        entries,
        meus,
        agg,
        extras: extrasDoAtleta(entries, playerId),
        painel: painelDoAtleta(entries, roster?.length ? roster : [player], playerId, { quantos: 5 }),
      });
    })();
  }, [clubId, teamId, playerId]);

  if (!dados) return <p className="muted">{t('comum.aCarregar')}</p>;
  if (!dados.player) return <Empty>{t('ficha.naoEncontrado')}</Empty>;

  const { player, club, team, entries, meus, agg, extras, painel } = dados;
  const guardaRedes = normalizePosition(player.preferredPosition) === 'GOALKEEPER' || agg.conceded > 0;
  const saldo = agg.goalShare - agg.concededShare;
  const u = painel?.utilizacao;
  const perdas = painel?.perdas;
  const porJogo = (n) => (agg.matches ? n / agg.matches : 0);

  const abrirJogo = (matchId) =>
    router.push(
      comOrigem(rotas.jogoResumo(matchId), { atras: rotas.jogador(clubId, teamId, playerId) })
    );

  return (
    <div className="ficha">
      <PageHead
        title={`#${player.shirtNumber} ${player.name}`}
        subtitle={t('ficha.subtitulo', {
          clube: [club?.name, team?.name].filter(Boolean).join(' · '),
          posicao: positionLabel(player.preferredPosition),
          pe: footLabel(player.strongFoot || FOOT.UNKNOWN).toLowerCase(),
          estado: player.isActive
            ? t('plantel.etiquetaAtivo')
            : t('plantel.etiquetaInativo'),
        })}
        backTo={rotas.plantel(clubId, teamId)}
        actions={
          soLeitura ? null : (
            <button
              className="btn btn--ghost"
              onClick={() => router.push(rotas.jogadorEditar(clubId, teamId, playerId))}
            >
              {t('comum.editar')}
            </button>
          )
        }
      />

      {/* 1. Os números principais. */}
      <div className="grid grid--stats ficha__kpis">
        <StatCard
          label={t('stats.jogos')}
          value={agg.matches}
          hint={u ? t('ficha.titularBanco', { titular: u.titular, banco: u.banco }) : null}
        />
        <StatCard
          label={t('ficha.tempoDeJogo')}
          value={fmt(agg.courtMs)}
          hint={t('ficha.mediaPorJogo', { tempo: fmt(agg.avgCourtPerMatchMs) })}
        />
        {guardaRedes ? (
          <StatCard
            label={t('stats.sofridos')}
            value={agg.conceded}
            hint={t('ficha.porJogo', { n: um(porJogo(agg.conceded)) })}
          />
        ) : null}
        <StatCard
          label={t('stats.golos')}
          value={agg.goals}
          hint={t('ficha.porJogo', { n: um(porJogo(agg.goals)) })}
        />
        <StatCard
          label={t('stats.assistencias')}
          value={agg.assists}
          hint={t('ficha.porJogo', { n: um(porJogo(agg.assists)) })}
        />
        <DiffCard
          label={t('ficha.saldoEmCampo')}
          value={saldo}
          hint={t('ficha.saldoDetalhe', { marcados: agg.goalShare, sofridos: agg.concededShare })}
        />
      </div>

      {/* A disciplina raramente é a pergunta: fica numa linha, não em cartões. */}
      <ul className="ficha__chips" aria-label={t('painelv.disciplina')}>
        <li className="ficha__chip">
          {t('stats.faltas')} <strong className="mono">{agg.fouls}</strong>
        </li>
        <li className="ficha__chip">
          {t('stats.faltasSofridas')} <strong className="mono">{agg.foulsSuffered}</strong>
        </li>
        <li className="ficha__chip">
          <span className="ficha__cartao ficha__cartao--amarelo" aria-hidden="true" />
          {t('stats.amarelos')} <strong className="mono">{agg.yellows}</strong>
        </li>
        <li className="ficha__chip">
          <span className="ficha__cartao ficha__cartao--vermelho" aria-hidden="true" />
          {t('stats.vermelhos')} <strong className="mono">{agg.reds}</strong>
        </li>
      </ul>

      {/* 2. O painel do atleta. */}
      {painel && u?.convocado ? (
        <>
          <h2 className="section">{t('ficha.painel')}</h2>
          <div className="ficha__paineis">
            <Bloco titulo={t('painelv.utilizacao')}>
              <div className="grid grid--stats ficha__mini">
                <StatCard
                  label={t('painelv.convocado')}
                  value={u.convocado}
                  hint={t('painelv.emJogos', { n: u.jogos })}
                />
                <StatCard
                  label={t('painelv.utilizado')}
                  value={`${u.percentagemUtilizacao}%`}
                  hint={`${u.utilizado}/${u.jogos}`}
                />
                <StatCard label={t('painelv.titular')} value={u.titular} />
                <StatCard label={t('painelv.entrouBanco')} value={u.banco} />
              </div>
              <BarrasH
                linhas={[
                  {
                    rotulo: player.name,
                    valor: painel.minutos.totalMs,
                    texto: fmt(painel.minutos.totalMs),
                    alerta: painel.minutos.abaixo,
                  },
                  {
                    rotulo: t('painelv.mediaTempoTotalPlantel'),
                    valor: painel.minutos.mediaEquipaMs,
                    texto: fmt(painel.minutos.mediaEquipaMs),
                  },
                ]}
              />
            </Bloco>

            <Bloco titulo={t('painelv.ultimosJogosAtleta')}>
              {painel.ultimos.some((j) => j.resultado) ? (
                <FitaForma
                  jogos={painel.ultimos.filter((j) => j.resultado).slice().reverse()}
                  onAbrir={abrirJogo}
                />
              ) : null}
              <ul className="ficha__ultimos">
                {painel.ultimos.map((j) => (
                  <li key={j.matchId}>
                    <button type="button" onClick={() => abrirJogo(j.matchId)}>
                      <span className="ficha__ultimos-adv">{j.adversario}</span>
                      <span className="ficha__ultimos-num mono">
                        {[
                          j.golos ? t('ficha.golosN', { n: j.golos }) : null,
                          j.assistencias ? t('ficha.assistN', { n: j.assistencias }) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="muted mono">
                        {j.utilizado
                          ? fmt(j.minutosMs)
                          : j.convocado
                            ? t('painelv.naoUtilizado')
                            : t('painelv.naoConvocado')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Bloco>

            {perdas?.comDados ? (
              <Bloco titulo={t('registos.total.perda_bola')}>
                <div className="grid grid--stats ficha__mini">
                  <StatCard
                    label={t('registos.total.perda_bola')}
                    value={perdas.total}
                    hint={t('painelv.emJogos', { n: perdas.jogos })}
                  />
                  <StatCard label={t('registos.epoca.perdasPorJogo')} value={um(perdas.porJogo)} />
                  <StatCard
                    label={t('registos.col.perdas10')}
                    value={perdas.por10 == null ? '—' : um(perdas.por10)}
                    hint={t('registos.col.perdas10Titulo')}
                  />
                </div>
              </Bloco>
            ) : null}

            {/* Um bloco por cada registo extra que o escalão aponta. */}
            {extras?.comDados ? (
              <BlocosExtrasAtleta extras={extras} entries={entries} playerId={playerId} Bloco={Bloco} />
            ) : null}
          </div>
        </>
      ) : null}

      {/* 3. O histórico jogo a jogo. */}
      <h2 className="section">{t('ficha.historico')}</h2>
      {!meus.length ? (
        <Empty>{t('ficha.semConvocatorias')}</Empty>
      ) : (
        <DataTable tight className="ficha__historico">
          <thead>
            <tr>
              <th>{t('lista.data')}</th>
              <th>{t('lista.adversario')}</th>
              <th>{t('lista.resultado')}</th>
              <th className="num">{t('ficha.emCampo')}</th>
              <th className="num" title={t('stats.golos')}>
                {t('ficha.golosCurto')}
              </th>
              <th className="num" title={t('ficha.assistencias')}>
                {t('ficha.assistCurto')}
              </th>
              {/* O saldo da equipa com ele em campo, jogo a jogo: os golos
                  marcados e sofridos de onde sai estão no título da célula. */}
              <th className="num" title={t('ficha.saldoTitulo')}>
                {t('ficha.saldoCurto')}
              </th>
              {guardaRedes ? (
                <th className="num" title={t('stats.sofridosTitulo')}>
                  {t('ficha.sofridosCurto')}
                </th>
              ) : null}
              <th className="num" title={t('stats.faltas')}>
                {t('ficha.faltasCurto')}
              </th>
              <th>{t('ficha.cartoes')}</th>
              <th className="col--elastico" />
            </tr>
          </thead>
          <tbody>
            {meus.map(({ match, state, row }) => {
              const r = matchResult(state);
              const s = row.goalShare - row.concededShare;
              return (
                <tr key={match.id} className="is-clickable" onClick={() => abrirJogo(match.id)}>
                  <td className="mono">{dayLabel(match.scheduledAt)}</td>
                  <td>{match.opponentName}</td>
                  <td>
                    <span className={`ficha__resultado ${r ? `is-${r.toLowerCase()}` : ''}`}>
                      {state.teamScore}–{state.opponentScore}
                    </span>
                  </td>
                  <td className="num mono">{fmt(row.courtMs)}</td>
                  <td className={`num mono ${row.goals ? '' : 'muted'}`}>{row.goals}</td>
                  <td className={`num mono ${row.assists ? '' : 'muted'}`}>{row.assists}</td>
                  <td
                    className={`num mono ${s > 0 ? 'ficha__pos' : s < 0 ? 'ficha__neg' : 'muted'}`}
                    title={t('ficha.saldoDetalhe', { marcados: row.goalShare, sofridos: row.concededShare })}
                  >
                    {s > 0 ? `+${s}` : s}
                  </td>
                  {guardaRedes ? <td className="num mono">{row.conceded}</td> : null}
                  <td className={`num mono ${row.fouls ? '' : 'muted'}`}>{row.fouls}</td>
                  <td>
                    {Array.from({ length: row.yellows }, (_, i) => (
                      <span key={`a${i}`} className="ficha__cartao ficha__cartao--amarelo" title={t('ficha.cartoesAmarelos')} />
                    ))}
                    {Array.from({ length: row.reds }, (_, i) => (
                      <span key={`v${i}`} className="ficha__cartao ficha__cartao--vermelho" title={t('ficha.cartoesVermelhos')} />
                    ))}
                  </td>
                  <td className="right col--elastico">
                    <span className="ficha__seta" aria-hidden="true">›</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
