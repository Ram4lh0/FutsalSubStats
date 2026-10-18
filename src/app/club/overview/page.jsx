'use client';

// app/club/overview/page.jsx — a visão geral do clube (add-on 'visao-geral-clube').
//
// Entra-se pelo seletor de escalões, como se fosse mais um: "Visão geral do
// clube". Em cima, o quadro dos resultados de todos os escalões na semana —
// feito para caber numa captura de ecrã e seguir por WhatsApp para quem
// pergunta "então, como correu?". Por baixo, os números do clube e a
// comparação entre escalões, com filtros.
//
// As contas vivem em domain/visaoGeral.js.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import Emblema from '@/components/Emblema.jsx';
import DataTable from '@/components/DataTable.jsx';
import { Empty, StatCard, StatusBadge } from '@/components/bits.jsx';
import { BarrasH, LinhasNoTempo } from '@/components/stats/graficos.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import { clubs, teams, statConfig, loadTeamMatchStates } from '@/lib/data/repository.js';
import { DATA_UPDATED_EVENT } from '@/lib/data/sync.js';
import { addonsAtivos } from '@/domain/addons.js';
import { matchResult } from '@/domain/stats.js';
import { MATCH_STATUS } from '@/domain/constants.js';
import {
  andarSemanas,
  compararEscaloes,
  evolucaoSemanal,
  resumoDoClube,
  semanaDe,
  semanaPorOmissao,
} from '@/domain/visaoGeral.js';
import { rotas, comOrigem } from '@/lib/routes.js';

import { localeAtual, useT } from '@/lib/i18n/index.js';

const ADDON = 'visao-geral-clube';

export default function VisaoGeralPage() {
  return (
    <Pagina>
      <VisaoGeral />
    </Pagina>
  );
}

function VisaoGeral() {
  const { clubId } = useRouteParams();
  const t = useT();
  const [dados, setDados] = useState(null);
  // null: a semana escolhida sozinha (ver semanaPorOmissao). 'epoca': tudo.
  const [periodo, setPeriodo] = useState(null);
  const [escondidos, setEscondidos] = useState(() => new Set());
  const [metrica, setMetrica] = useState('marcados');

  const carregar = useCallback(async () => {
    const club = await clubs.get(clubId);
    if (!club) return setDados({ club: null });
    const lista = await teams.listByClub(clubId);
    const escaloes = [];
    let ligado = false;
    for (const team of lista) {
      const [entries, config] = await Promise.all([
        loadTeamMatchStates(team.id),
        statConfig.get(team.id).catch(() => null),
      ]);
      if (addonsAtivos(config).has(ADDON)) ligado = true;
      escaloes.push({ team, entries });
    }
    setDados({ club, escaloes, ligado });
  }, [clubId]);

  useEffect(() => {
    carregar();
    const aoAtualizar = () => carregar();
    window.addEventListener(DATA_UPDATED_EVENT, aoAtualizar);
    return () => window.removeEventListener(DATA_UPDATED_EVENT, aoAtualizar);
  }, [carregar]);

  const semana = useMemo(
    () => (periodo && periodo !== 'epoca' ? periodo : dados?.escaloes ? semanaPorOmissao(dados.escaloes) : null),
    [periodo, dados]
  );
  const visiveis = useMemo(
    () => (dados?.escaloes || []).filter((e) => !escondidos.has(e.team.id)),
    [dados, escondidos]
  );
  const resumo = useMemo(
    () => resumoDoClube(visiveis, periodo === 'epoca' ? null : semana),
    [visiveis, periodo, semana]
  );

  if (!dados) return <p className="muted">{t('comum.aCarregar')}</p>;
  if (!dados.club) return <Empty>{t('clube.naoEncontrado')}</Empty>;
  if (!dados.ligado) return <Empty>{t('visao.desligada')}</Empty>;

  const { club } = dados;
  const naEpoca = periodo === 'epoca';
  const etiquetaPeriodo = naEpoca
    ? club.currentSeason
      ? t('escalao.epoca', { epoca: club.currentSeason })
      : t('visao.epocaToda')
    : intervaloLabel(semana);
  const estaSemana = semanaDe(Date.now());

  function trocarEscalao(id) {
    setEscondidos((atuais) => {
      const novos = new Set(atuais);
      if (novos.has(id)) novos.delete(id);
      else novos.add(id);
      return novos;
    });
  }

  return (
    <>
      <PageHead title={t('visao.titulo')} subtitle={club.name} />

      <div className="filtros visao__filtros">
        <div className="filtros__grupo">
          <span className="filtros__rotulo">{t('visao.periodo')}</span>
          <button
            className="btn btn--ghost btn--tiny"
            type="button"
            aria-label={t('visao.semanaAnterior')}
            onClick={() => setPeriodo(andarSemanas(semana, -1))}
          >
            ‹
          </button>
          <button
            className={`chip chip--small ${naEpoca ? '' : 'is-on'}`}
            type="button"
            onClick={() => setPeriodo(semana)}
          >
            {intervaloLabel(semana)}
          </button>
          <button
            className="btn btn--ghost btn--tiny"
            type="button"
            aria-label={t('visao.semanaSeguinte')}
            disabled={!naEpoca && semana.inicio >= estaSemana.inicio}
            onClick={() => setPeriodo(andarSemanas(semana, 1))}
          >
            ›
          </button>
          <button
            className={`chip chip--small ${naEpoca ? 'is-on' : ''}`}
            type="button"
            onClick={() => setPeriodo('epoca')}
          >
            {t('visao.epocaToda')}
          </button>
        </div>
        {dados.escaloes.length > 1 ? (
          <div className="filtros__grupo">
            <span className="filtros__rotulo">{t('visao.escaloes')}</span>
            {dados.escaloes.map(({ team }) => (
              <button
                key={team.id}
                type="button"
                className={`chip chip--small ${escondidos.has(team.id) ? '' : 'is-on'}`}
                onClick={() => trocarEscalao(team.id)}
              >
                {team.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <Quadro club={club} resumo={resumo} etiqueta={etiquetaPeriodo} naEpoca={naEpoca} clubId={clubId} />

      <div className="grid grid--stats visao__numeros">
        <StatCard label={t('visao.jogos')} value={resumo.totais.jogos} hint={pendentesLabel(resumo.totais, t)} />
        <StatCard label={t('visao.vitorias')} value={resumo.totais.vitorias} kind="win" />
        <StatCard label={t('visao.empates')} value={resumo.totais.empates} kind="draw" />
        <StatCard label={t('visao.derrotas')} value={resumo.totais.derrotas} kind="loss" />
        <StatCard label={t('visao.marcados')} value={resumo.totais.marcados} />
        <StatCard label={t('visao.sofridos')} value={resumo.totais.sofridos} />
      </div>

      <Evolucao escaloes={visiveis} />
      <Comparacao resumo={resumo} metrica={metrica} aoTrocar={setMetrica} />
      <TabelaPorEscalao resumo={resumo} />
    </>
  );
}

/* ----------------------------------------------------- o quadro do print */

/**
 * Os resultados de todos os escalões, um jogo por linha.
 *
 * É a parte que vai na captura: tem o emblema, o nome do clube, o período e o
 * balanço em cima, para a imagem se explicar sozinha fora da app. Na época
 * toda seriam dezenas de linhas, por isso aí fica só o balanço de cada
 * escalão.
 */
function Quadro({ club, resumo, etiqueta, naEpoca, clubId }) {
  const t = useT();
  const router = useRouter();
  const { totais } = resumo;
  const comJogos = resumo.escaloes.filter((e) => e.jogos.length);
  const semJogos = resumo.escaloes.filter((e) => !e.jogos.length);
  const voltar = rotas.visaoGeralClube(clubId);

  function abrir({ match, state }) {
    const destino =
      state.status === MATCH_STATUS.FINISHED
        ? comOrigem(rotas.jogoResumo(match.id), { atras: voltar })
        : state.status === MATCH_STATUS.DRAFT || state.status === MATCH_STATUS.READY
          ? rotas.jogoPreparar(match.id)
          : rotas.jogoAoVivo(match.id);
    router.push(destino);
  }

  return (
    <section className="card visao__quadro">
      <header className="visao__cabeca">
        <Emblema nome={club.name} foto={club.logoUrl} cor={club.primaryColor} tamanho={40} />
        <div className="visao__titulo">
          <strong>{club.name}</strong>
          <span className="muted">{etiqueta}</span>
        </div>
        <div className="visao__balanco">
          <span className="res res--w">{t('visao.v', { n: totais.vitorias })}</span>
          <span className="res res--d">{t('visao.e', { n: totais.empates })}</span>
          <span className="res res--l">{t('visao.d', { n: totais.derrotas })}</span>
          <span className="visao__golos mono">
            {totais.marcados}–{totais.sofridos}
          </span>
        </div>
      </header>

      {comJogos.length === 0 ? (
        <p className="muted visao__vazio">{t('visao.semJogos')}</p>
      ) : naEpoca ? (
        <ul className="visao__lista">
          {comJogos.map(({ team, totais: c }) => (
            <li key={team.id} className="visao__linha">
              <span className="visao__escalao">{team.name}</span>
              <span className="visao__jogo muted">{t('visao.nJogos', { n: c.jogos })}</span>
              <span className="visao__placar mono">
                <span className="res res--w">{c.vitorias}</span>-<span className="res res--d">{c.empates}</span>-
                <span className="res res--l">{c.derrotas}</span>
              </span>
              <span className="visao__estado mono muted">
                {c.marcados}–{c.sofridos}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="visao__lista">
          {comJogos.flatMap(({ team, jogos }) =>
            jogos.map((entrada, i) => {
              const { match, state } = entrada;
              const r = matchResult(state);
              const agendado = state.status === MATCH_STATUS.DRAFT || state.status === MATCH_STATUS.READY;
              return (
                <li
                  key={match.id}
                  className="visao__linha is-clickable"
                  onClick={() => abrir(entrada)}
                >
                  {/* O nome do escalão só na primeira linha dele: dois jogos
                      do mesmo escalão leem-se como um bloco. */}
                  <span className="visao__escalao">{i === 0 ? team.name : ''}</span>
                  <span className="visao__jogo">
                    <span className="muted mono">{diaLabel(match.scheduledAt)}</span>{' '}
                    {match.homeOrAway === 'AWAY' ? '@ ' : ''}
                    {match.opponentName}
                  </span>
                  <span className="visao__placar mono">
                    {agendado ? (
                      <span className="muted">{horaLabel(match.scheduledAt)}</span>
                    ) : (
                      <span className={r === 'W' ? 'res res--w' : r === 'L' ? 'res res--l' : r ? 'res res--d' : ''}>
                        {state.teamScore}–{state.opponentScore}
                      </span>
                    )}
                  </span>
                  <span className="visao__estado">
                    {state.status === MATCH_STATUS.FINISHED ? null : <StatusBadge status={state.status} />}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      )}

      {semJogos.length && comJogos.length ? (
        <p className="visao__folga muted">
          {t('visao.semJogo', { escaloes: semJogos.map((e) => e.team.name).join(', ') })}
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------- evolução na época */

const SERIES = {
  resultados: [
    { chave: 'vitorias', nome: 'visao.vitorias', classe: 'vitoria' },
    { chave: 'empates', nome: 'visao.empates', classe: 'empate' },
    { chave: 'derrotas', nome: 'visao.derrotas', classe: 'derrota' },
  ],
  golos: [
    { chave: 'marcados', nome: 'visao.marcados', classe: 'marcados' },
    { chave: 'sofridos', nome: 'visao.sofridos', classe: 'sofridos' },
  ],
};

/**
 * Como o clube tem andado, semana a semana: vitórias, empates e derrotas, ou
 * golos marcados e sofridos. Ignora o período escolhido em cima — uma
 * evolução de uma semana só é um ponto — mas respeita os escalões filtrados.
 */
function Evolucao({ escaloes }) {
  const t = useT();
  const [o, setO] = useState('resultados');
  const [acumulado, setAcumulado] = useState(false);
  const semanas = useMemo(() => evolucaoSemanal(escaloes), [escaloes]);
  if (semanas.length < 2) return null;

  const opcoes = { day: 'numeric', month: 'short' };
  const pontos = semanas.map((s) => ({
    rotulo: new Date(s.inicio).toLocaleDateString(localeAtual(), opcoes),
    valores: acumulado ? s.acumulado : s.semana,
  }));

  return (
    <section className="card">
      <div className="painelv__bloco-head">
        <h2 className="section section--tight">{t('visao.evolucaoTitulo')}</h2>
      </div>
      <div className="chiprow visao__metricas">
        {Object.keys(SERIES).map((chave) => (
          <button
            key={chave}
            type="button"
            className={`chip chip--small ${o === chave ? 'is-on' : ''}`}
            onClick={() => setO(chave)}
          >
            {t(`visao.evolucao.${chave}`)}
          </button>
        ))}
        <span className="toolbar__spacer" />
        <button
          type="button"
          className={`chip chip--small ${acumulado ? '' : 'is-on'}`}
          onClick={() => setAcumulado(false)}
        >
          {t('visao.porSemana')}
        </button>
        <button
          type="button"
          className={`chip chip--small ${acumulado ? 'is-on' : ''}`}
          onClick={() => setAcumulado(true)}
        >
          {t('visao.acumulado')}
        </button>
      </div>
      <LinhasNoTempo pontos={pontos} series={SERIES[o].map((s) => ({ ...s, nome: t(s.nome) }))} />
    </section>
  );
}

/* ------------------------------------------------------- comparar escalões */

const METRICAS = ['marcados', 'sofridos', 'mediaSofridos', 'vitorias', 'diferenca'];

function Comparacao({ resumo, metrica, aoTrocar }) {
  const t = useT();
  const linhas = compararEscaloes(resumo, metrica);
  if (linhas.length < 2) return null;

  const texto = (v) =>
    metrica === 'diferenca' ? (v > 0 ? `+${v}` : String(v)) : metrica === 'mediaSofridos' ? v.toFixed(1) : String(v);

  return (
    <section className="card">
      <div className="painelv__bloco-head">
        <h2 className="section section--tight">{t('visao.compararTitulo')}</h2>
      </div>
      <div className="chiprow visao__metricas">
        {METRICAS.map((m) => (
          <button
            key={m}
            type="button"
            className={`chip chip--small ${metrica === m ? 'is-on' : ''}`}
            onClick={() => aoTrocar(m)}
          >
            {t(`visao.metrica.${m}`)}
          </button>
        ))}
      </div>
      <BarrasH
        linhas={linhas.map((l) => ({
          rotulo: l.team.name,
          valor: Math.abs(l.valor),
          texto: texto(l.valor),
          // Em vermelho o que é mau sinal: diferença negativa, ou o escalão
          // que mais sofre quando se olha para os sofridos.
          alerta:
            metrica === 'diferenca'
              ? l.valor < 0
              : (metrica === 'sofridos' || metrica === 'mediaSofridos') && l.valor > 0 && l === linhas[0],
        }))}
      />
    </section>
  );
}

function TabelaPorEscalao({ resumo }) {
  const t = useT();
  const linhas = resumo.escaloes.filter((e) => e.totais.jogos);
  if (!linhas.length) return null;
  return (
    <section className="card">
      <h2 className="section section--tight">{t('visao.porEscalao')}</h2>
      <DataTable>
        <thead>
          <tr>
            <th>{t('visao.escalao')}</th>
            <th className="num">{t('visao.col.j')}</th>
            <th className="num">{t('visao.col.v')}</th>
            <th className="num">{t('visao.col.e')}</th>
            <th className="num">{t('visao.col.d')}</th>
            <th className="num">{t('visao.col.gm')}</th>
            <th className="num">{t('visao.col.gs')}</th>
            <th className="num">{t('visao.col.dg')}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ team, totais: c }) => {
            const dg = c.marcados - c.sofridos;
            return (
              <tr key={team.id}>
                <td>{team.name}</td>
                <td className="num mono">{c.jogos}</td>
                <td className="num mono">{c.vitorias}</td>
                <td className="num mono">{c.empates}</td>
                <td className="num mono">{c.derrotas}</td>
                <td className="num mono">{c.marcados}</td>
                <td className="num mono">{c.sofridos}</td>
                <td className={`num mono ${dg > 0 ? 'res--w' : dg < 0 ? 'res--l' : ''}`}>
                  {dg > 0 ? `+${dg}` : dg}
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </section>
  );
}

/* ---------------------------------------------------------------- datas */

function intervaloLabel(semana) {
  if (!semana) return '';
  const opcoes = { day: 'numeric', month: 'short' };
  const inicio = new Date(semana.inicio).toLocaleDateString(localeAtual(), opcoes);
  const fim = new Date(semana.fim - 1).toLocaleDateString(localeAtual(), opcoes);
  return `${inicio} – ${fim}`;
}

// "sáb 17/10": o dia da semana em três letras. Por extenso ("sábado, 17/10")
// comia no telemóvel o espaço do nome do adversário.
function diaLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const semana = d.toLocaleDateString(localeAtual(), { weekday: 'short' }).replace(/[.,]/g, '').slice(0, 3);
  const dia = d.toLocaleDateString(localeAtual(), { day: '2-digit', month: '2-digit' });
  return `${semana} ${dia}`;
}

function horaLabel(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString(localeAtual(), { hour: '2-digit', minute: '2-digit' });
}

function pendentesLabel(totais, t) {
  const partes = [];
  if (totais.aDecorrer) partes.push(t('visao.aDecorrer', { n: totais.aDecorrer }));
  if (totais.agendados) partes.push(t('visao.agendados', { n: totais.agendados }));
  return partes.join(' · ') || null;
}
