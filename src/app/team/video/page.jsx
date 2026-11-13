'use client';

// Treino → Análise de vídeo: a subaba (add-on 'analise-video').
//
// Três vistas no mesmo sítio:
//   · Análises — um cartão por vídeo (um jogo ou um treino);
//   · Sessões — listas de clipes para uma conversa ou uma reunião;
//   · Por jogador — o plantel, com os clipes que cada um ainda não viu.
//
// O vídeo nunca é guardado por nós: cada análise é só um link do YouTube
// (não listado) e os tempos dos clipes.

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import { Badge, Empty } from '@/components/bits.jsx';
import FotoJogador, { useFotosDoEscalao } from '@/components/FotoJogador.jsx';
import { NovaAnalise, rotuloDoJogo } from '@/components/video/FormAnalise.jsx';
import { GuardaVideo, NomeDaSessao } from '@/components/video/dialogos.jsx';
import { nClipes, nJogadores } from '@/components/video/pecas.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import useDadosVideo from '@/lib/useDadosVideo.js';
import { useUI } from '@/lib/ui.jsx';
import { rotas } from '@/lib/routes.js';
import { matches as repoJogos } from '@/lib/data/repository.js';
import { sessoes as repoSessoes } from '@/lib/data/video.js';
import { contarPorJogador, miniaturaDaAnalise, resumoDaAnalise } from '@/domain/analiseVideo.js';
import { deIsoDia } from '@/domain/treino.js';
import { useLocale, useT } from '@/lib/i18n/index.js';

const VISTAS = ['analises', 'sessoes', 'jogadores'];

export default function VideoPage() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId } = useRouteParams();
  return (
    <TeamShell clubId={clubId} teamId={teamId}>
      {({ roster }) => (
        <GuardaVideo teamId={teamId}>
          <Lista clubId={clubId} teamId={teamId} plantel={roster || []} />
        </GuardaVideo>
      )}
    </TeamShell>
  );
}

function Lista({ clubId, teamId, plantel }) {
  const t = useT();
  const router = useRouter();
  const ui = useUI();
  const soLeitura = useSoLeitura(teamId);
  const dados = useDadosVideo(teamId);
  const pedida = useSearchParams().get('vista');
  const vista = VISTAS.includes(pedida) ? pedida : 'analises';
  const [jogos, setJogos] = useState([]);

  useEffect(() => {
    let vivo = true;
    repoJogos.listByTeam(teamId).then((j) => vivo && setJogos(j));
    return () => {
      vivo = false;
    };
  }, [teamId]);

  const contas = useMemo(
    () => contarPorJogador(dados?.clipes || [], dados?.conversas || []),
    [dados]
  );
  const porMostrar = useMemo(() => [...contas.values()].reduce((s, c) => s + c.pendentes, 0), [contas]);

  if (!dados) return <p className="muted">{t('comum.aCarregar')}</p>;

  async function nova() {
    const resposta = await ui.open((close) => <NovaAnalise teamId={teamId} jogos={jogos} onFechar={close} />);
    if (!resposta) return;
    const destino = rotas.analiseVideo(clubId, teamId, resposta.analise.id);
    router.push(resposta.inicioSeg ? `${destino}&t=${resposta.inicioSeg}` : destino);
  }

  async function novaSessao() {
    const titulo = await ui.open((close) => <NomeDaSessao onFechar={close} />);
    if (!titulo) return;
    const sessao = await repoSessoes.criar(teamId, { title: titulo });
    router.push(rotas.sessaoVideo(clubId, teamId, sessao.id));
  }

  const mudarVista = (v) => router.replace(rotas.analisesVideo(clubId, teamId, v === 'analises' ? null : v));

  return (
    <>
      <div className="tmodo" role="tablist">
        {VISTAS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            className={`tmodo__btn ${vista === v ? 'is-on' : ''}`}
            aria-selected={vista === v}
            onClick={() => mudarVista(v)}
          >
            {t(`video.vista.${v}`)}
            {v === 'jogadores' && porMostrar ? <span className="vconta">{porMostrar}</span> : null}
          </button>
        ))}
        <span className="toolbar__spacer" />
        {soLeitura ? null : vista === 'sessoes' ? (
          <button className="btn btn--primary btn--tiny" onClick={novaSessao}>
            {t('video.sessao.nova')}
          </button>
        ) : vista === 'analises' ? (
          <button className="btn btn--primary btn--tiny" onClick={nova}>
            {t('video.nova')}
          </button>
        ) : null}
      </div>

      {vista === 'analises' ? (
        <Analises
          dados={dados}
          jogos={jogos}
          soLeitura={soLeitura}
          onNova={nova}
          onAbrir={(a) => router.push(rotas.analiseVideo(clubId, teamId, a.id))}
        />
      ) : null}
      {vista === 'sessoes' ? (
        <Sessoes
          dados={dados}
          plantel={plantel}
          onAbrir={(s) => router.push(rotas.sessaoVideo(clubId, teamId, s.id))}
        />
      ) : null}
      {vista === 'jogadores' ? (
        <Jogadores
          teamId={teamId}
          plantel={plantel}
          contas={contas}
          onAbrir={(j) => router.push(rotas.jogadorVideo(clubId, teamId, j.id))}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------ análises */

function Analises({ dados, jogos, soLeitura, onNova, onAbrir }) {
  const t = useT();
  const locale = useLocale();
  const jogosPorId = useMemo(() => new Map(jogos.map((j) => [j.id, j])), [jogos]);
  const clipesPorAnalise = useMemo(() => {
    const mapa = new Map();
    for (const c of dados.clipes) {
      if (!mapa.has(c.analysisId)) mapa.set(c.analysisId, []);
      mapa.get(c.analysisId).push(c);
    }
    return mapa;
  }, [dados.clipes]);

  if (!dados.analises.length) {
    return (
      <Empty
        action={
          soLeitura ? null : (
            <button className="btn btn--primary" onClick={onNova}>
              {t('video.nova')}
            </button>
          )
        }
      >
        {t(soLeitura ? 'video.vazioLeitura' : 'video.vazio')}
      </Empty>
    );
  }

  return (
    <div className="vcartoes">
      {dados.analises.map((a) => {
        const resumo = resumoDaAnalise(clipesPorAnalise.get(a.id) || []);
        const jogo = jogosPorId.get(a.matchId);
        return (
          <button key={a.id} type="button" className="vcartao" onClick={() => onAbrir(a)}>
            <span className="vcartao__mini">
              <img src={miniaturaDaAnalise(a)} alt="" loading="lazy" />
            </span>
            <span className="vcartao__texto">
              <strong className="vcartao__titulo">{a.title}</strong>
              <span className="vcartao__meta muted">
                {a.recordedOn
                  ? deIsoDia(a.recordedOn).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
                  : null}
                {a.recordedOn && jogo ? ' · ' : null}
                {jogo ? rotuloDoJogo(jogo) : null}
              </span>
              <span className="vcartao__contas">
                <Badge kind={resumo.clipes ? 'info' : 'muted'}>{nClipes(t, resumo.clipes)}</Badge>
                {resumo.jogadores ? (
                  <Badge kind="muted">{nJogadores(t, resumo.jogadores)}</Badge>
                ) : null}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- sessões */

function Sessoes({ dados, plantel, onAbrir }) {
  const t = useT();
  const vivos = useMemo(() => new Set(dados.clipes.map((c) => c.id)), [dados.clipes]);
  const nomes = useMemo(() => new Map(plantel.map((j) => [j.id, j.name])), [plantel]);

  if (!dados.sessoes.length) return <Empty>{t('video.sessao.vazio')}</Empty>;

  return (
    <div className="vsessoes">
      {dados.sessoes.map((s) => {
        const n = s.clipIds.filter((id) => vivos.has(id)).length;
        const linkAtivo = s.shareToken && s.shareExpiresAt > Date.now();
        return (
          <button key={s.id} type="button" className="card vsessao" onClick={() => onAbrir(s)}>
            <strong>{s.title}</strong>
            <span className="vsessao__meta">
              <Badge kind={n ? 'info' : 'muted'}>{nClipes(t, n)}</Badge>
              {s.playerId && nomes.get(s.playerId) ? (
                <Badge kind="muted">{t('video.sessao.para', { nome: nomes.get(s.playerId) })}</Badge>
              ) : null}
              {linkAtivo ? <Badge kind="ok">{t('tatica.linkAtivo')}</Badge> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------- por jogador */

function Jogadores({ teamId, plantel, contas, onAbrir }) {
  const t = useT();
  const fotos = useFotosDoEscalao(teamId);
  const lista = useMemo(
    () =>
      plantel
        .filter((j) => j.isActive !== false || contas.has(j.id))
        .map((j) => ({ jogador: j, conta: contas.get(j.id) || { total: 0, pendentes: 0 } }))
        .sort(
          (a, b) =>
            b.conta.pendentes - a.conta.pendentes ||
            b.conta.total - a.conta.total ||
            a.jogador.shirtNumber - b.jogador.shirtNumber
        ),
    [plantel, contas]
  );

  if (!lista.length) return <Empty>{t('video.jogador.semPlantel')}</Empty>;

  return (
    <>
      <p className="muted vintro">{t('video.jogador.intro')}</p>
      <div className="vplantel">
        {lista.map(({ jogador, conta }) => (
          <button
            key={jogador.id}
            type="button"
            className={`vplantel__item ${conta.total ? '' : 'is-vazio'}`}
            onClick={() => onAbrir(jogador)}
          >
            <FotoJogador jogador={jogador} foto={fotos.get(jogador.id)} tamanho={44} />
            <span className="vplantel__nome">
              <strong>{jogador.name}</strong>
              <span className="muted">
                {conta.total ? nClipes(t, conta.total) : t('video.jogador.semClipes')}
              </span>
            </span>
            {conta.pendentes ? (
              <span className="vconta vconta--grande" title={t('video.jogador.porMostrar', { n: conta.pendentes })}>
                {conta.pendentes}
              </span>
            ) : conta.total ? (
              <span className="vfeito" aria-label={t('video.jogador.tudoFalado')}>
                ✓
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </>
  );
}
