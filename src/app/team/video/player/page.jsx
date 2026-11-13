'use client';

// Treino → Análise de vídeo → Por jogador → a ficha de um jogador.
//
// Todos os clipes em que o jogador está marcado, agrupados por categoria e
// valência. Cada um tem "já falámos" (com a data): os que ainda não têm são a
// fila de conversas por ter.
//
// Daqui também se partilha: escolhem-se uns clipes e nasce um link público,
// só de leitura, com esses e mais nenhum — para mandar ao jogador por
// WhatsApp, como o resumo do jogo.

import { useEffect, useMemo, useState } from 'react';
import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import { Empty } from '@/components/bits.jsx';
import FotoJogador, { useFotosDoEscalao } from '@/components/FotoJogador.jsx';
import LeitorVideo from '@/components/video/LeitorVideo.jsx';
import useLeitorDeClipes from '@/components/video/useLeitorDeClipes.js';
import { GuardaVideo, PartilharSessaoVideo } from '@/components/video/dialogos.jsx';
import {
  ControlosVideo,
  IconeCategoria,
  LegendaClipe,
  LinhaClipe,
  MarcaValencia,
  nomeDaCategoria,
} from '@/components/video/pecas.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import useDadosVideo from '@/lib/useDadosVideo.js';
import { useUI } from '@/lib/ui.jsx';
import { rotas } from '@/lib/routes.js';
import { players as repoJogadores } from '@/lib/data/repository.js';
import { conversas as repoConversas, sessoes as repoSessoes } from '@/lib/data/video.js';
import { categoriaVideo, chaveDoSubtipo, fichaDoJogador, fonteDaAnalise } from '@/domain/analiseVideo.js';
import { useLocale, useT } from '@/lib/i18n/index.js';

export default function JogadorVideoPage() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId, playerId } = useRouteParams();
  return (
    <GuardaVideo teamId={teamId}>
      <Ficha clubId={clubId} teamId={teamId} playerId={playerId} />
    </GuardaVideo>
  );
}

function Ficha({ clubId, teamId, playerId }) {
  const t = useT();
  const locale = useLocale();
  const ui = useUI();
  const soLeitura = useSoLeitura(teamId);
  const dados = useDadosVideo(teamId);
  const fotos = useFotosDoEscalao(teamId);
  const [plantel, setPlantel] = useState(null);
  const [soPorFalar, setSoPorFalar] = useState(false);
  const [escolhidos, setEscolhidos] = useState(() => new Set());

  useEffect(() => {
    let vivo = true;
    repoJogadores.listByTeam(teamId).then((p) => vivo && setPlantel(p));
    return () => {
      vivo = false;
    };
  }, [teamId]);

  const analisesPorId = useMemo(() => new Map((dados?.analises || []).map((a) => [a.id, a])), [dados]);
  const jogadoresPorId = useMemo(() => new Map((plantel || []).map((j) => [j.id, j])), [plantel]);
  const ficha = useMemo(
    () =>
      fichaDoJogador(
        (dados?.clipes || []).filter((c) => analisesPorId.has(c.analysisId)),
        playerId,
        dados?.conversas || []
      ),
    [dados, analisesPorId, playerId]
  );
  const todos = useMemo(() => ficha.flatMap((g) => g.grupos.flatMap((v) => v.clipes)), [ficha]);
  const porFalar = useMemo(() => todos.filter((c) => !c.faladoEm), [todos]);
  const fonteDoClipe = (c) => fonteDaAnalise(analisesPorId.get(c.analysisId));
  const leitor = useLeitorDeClipes({ fonteDoClipe });

  const voltar = rotas.analisesVideo(clubId, teamId, 'jogadores');
  if (!dados || !plantel) return <p className="muted">{t('comum.aCarregar')}</p>;
  const jogador = jogadoresPorId.get(playerId);
  if (!jogador) {
    return (
      <>
        <PageHead title={t('video.vista.jogadores')} backTo={voltar} />
        <Empty>{t('video.jogador.naoEncontrado')}</Empty>
      </>
    );
  }

  const primeiro = todos[0] || null;
  const emFoco = leitor.ativo || null;
  const lista = soPorFalar ? porFalar : todos;
  const visiveis = new Set(lista.map((c) => c.id));
  const escolhidosVisiveis = todos.filter((c) => escolhidos.has(c.id));

  const alternar = (id) =>
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  async function partilhar() {
    const clipes = escolhidosVisiveis.length ? escolhidosVisiveis : porFalar.length ? porFalar : todos;
    if (!clipes.length) return;
    const sessao = await repoSessoes.criar(teamId, {
      title: t('video.jogador.tituloPartilha', { nome: jogador.name }),
      clipIds: clipes.map((c) => c.id),
      playerId,
    });
    await ui.open((close) => <PartilharSessaoVideo sessao={sessao} onFechar={close} />);
    setEscolhidos(new Set());
  }

  async function marcarEscolhidos() {
    await repoConversas.marcarVarios(escolhidosVisiveis, playerId);
    setEscolhidos(new Set());
  }

  const dataCurta = (ms) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  return (
    <div className="vanalise">
      <PageHead
        title={
          <span className="vficha__nome">
            <FotoJogador jogador={jogador} foto={fotos.get(jogador.id)} tamanho={40} />
            {jogador.name}
          </span>
        }
        subtitle={
          todos.length
            ? porFalar.length
              ? t('video.jogador.porMostrar', { n: porFalar.length })
              : t('video.jogador.tudoFalado')
            : null
        }
        backTo={voltar}
        actions={
          todos.length && !soLeitura ? (
            <button type="button" className="btn btn--primary btn--tiny" onClick={partilhar}>
              {escolhidosVisiveis.length
                ? t('video.jogador.partilharN', { n: escolhidosVisiveis.length })
                : t('video.jogador.partilhar')}
            </button>
          ) : null
        }
      />

      {todos.length === 0 ? (
        <Empty>{t('video.jogador.vazio', { nome: jogador.name })}</Empty>
      ) : (
        <div className="vanalise__grelha">
          <div className="vanalise__principal">
            <div className="vanalise__palco">
              <LeitorVideo
                fonte={fonteDoClipe(primeiro)}
                inicioSeg={primeiro.startMs / 1000}
                titulo={jogador.name}
                {...leitor.propsDoLeitor}
              />
              <ControlosVideo leitor={leitor} />
            </div>
            {emFoco ? <LegendaClipe clipe={emFoco} jogadores={jogadoresPorId} fotos={fotos} /> : null}
          </div>

          <aside className="vanalise__lado">
            <div className="vlista">
              <header className="vlista__topo">
                <div className="tmodo vlista__modo" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    className={`tmodo__btn ${soPorFalar ? '' : 'is-on'}`}
                    aria-selected={!soPorFalar}
                    onClick={() => setSoPorFalar(false)}
                  >
                    {t('video.jogador.todos', { n: todos.length })}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`tmodo__btn ${soPorFalar ? 'is-on' : ''}`}
                    aria-selected={soPorFalar}
                    onClick={() => setSoPorFalar(true)}
                  >
                    {t('video.jogador.porFalar', { n: porFalar.length })}
                  </button>
                </div>
                <span className="toolbar__spacer" />
                {lista.length > 1 ? (
                  leitor.fila ? (
                    <button type="button" className="btn btn--ghost btn--tiny" onClick={leitor.parar}>
                      {t('video.pararFila')}
                    </button>
                  ) : (
                    <button type="button" className="btn btn--ghost btn--tiny" onClick={() => leitor.tocarFila(lista)}>
                      ▶ {t('video.verTodos')}
                    </button>
                  )
                ) : null}
              </header>

              {escolhidosVisiveis.length && !soLeitura ? (
                <div className="vfiltros__acoes">
                  <button type="button" className="btn btn--ghost btn--tiny" onClick={marcarEscolhidos}>
                    {t('video.jogador.marcarFalados', { n: escolhidosVisiveis.length })}
                  </button>
                  <button type="button" className="btn btn--ghost btn--tiny" onClick={() => setEscolhidos(new Set())}>
                    {t('video.jogador.limparEscolha')}
                  </button>
                </div>
              ) : null}

              {lista.length === 0 ? <p className="vvazio">{t('video.jogador.tudoFalado')}</p> : null}

              {ficha.map((grupo) => {
                const cat = categoriaVideo(grupo.categoria);
                const comVisiveis = grupo.grupos
                  .map((g) => ({ ...g, clipes: g.clipes.filter((c) => visiveis.has(c.id)) }))
                  .filter((g) => g.clipes.length);
                if (!comVisiveis.length) return null;
                return (
                  <section key={grupo.categoria || 'sem'} className="vgrupo" style={{ '--cor': cat.cor }}>
                    <h3 className="vgrupo__titulo">
                      <IconeCategoria icone={cat.icone} tamanho={18} />
                      {nomeDaCategoria(t, grupo.categoria)}
                    </h3>
                    {comVisiveis.map((g) => (
                      <div key={g.valencia} className="vgrupo__valencia">
                        <MarcaValencia valencia={g.valencia} comTexto />
                        <div className="vclipes">
                          {g.clipes.map((c) => (
                            <LinhaClipe
                              key={c.id}
                              clipe={c}
                              jogadores={jogadoresPorId}
                              fotos={fotos}
                              ativo={leitor.ativo?.id === c.id}
                              escolhido={escolhidos.has(c.id)}
                              subtitulo={analisesPorId.get(c.analysisId)?.title}
                              // A categoria já está no título do grupo.
                              titulo={c.subtype ? t(chaveDoSubtipo(c.subtype)) : null}
                              onTocar={() => leitor.tocarClipe(c)}
                              antes={
                                soLeitura ? null : (
                                  <input
                                    type="checkbox"
                                    className="vcaixa"
                                    checked={escolhidos.has(c.id)}
                                    onChange={() => alternar(c.id)}
                                    aria-label={t('video.jogador.escolher')}
                                  />
                                )
                              }
                              acoes={
                                <button
                                  type="button"
                                  className={`vfalado ${c.faladoEm ? 'is-on' : ''}`}
                                  disabled={soLeitura}
                                  aria-pressed={Boolean(c.faladoEm)}
                                  onClick={() => repoConversas.marcar(c, playerId, !c.faladoEm)}
                                >
                                  {c.faladoEm
                                    ? t('video.jogador.faladoEm', { data: dataCurta(c.faladoEm) })
                                    : t('video.jogador.jaFalamos')}
                                </button>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
