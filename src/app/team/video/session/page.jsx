'use client';

// Treino → Análise de vídeo → uma sessão.
//
// Uma sessão é uma lista ordenada de clipes, que pode juntar clipes de várias
// análises: "Conversa com o João", "Reunião – bolas paradas defensivas".
// Aqui ordena-se (a arrastar pela pega), tiram-se e juntam-se clipes, e
// abre-se o modo apresentação. Com um link, é também o que se partilha.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import { Empty } from '@/components/bits.jsx';
import { useFotosDoEscalao } from '@/components/FotoJogador.jsx';
import LeitorVideo from '@/components/video/LeitorVideo.jsx';
import Apresentacao from '@/components/video/Apresentacao.jsx';
import useLeitorDeClipes from '@/components/video/useLeitorDeClipes.js';
import { GuardaVideo, NomeDaSessao, PartilharSessaoVideo } from '@/components/video/dialogos.jsx';
import {
  ControlosVideo,
  LegendaClipe,
  LinhaClipe,
  nClipes,
  tituloDoClipe,
} from '@/components/video/pecas.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import useDadosVideo from '@/lib/useDadosVideo.js';
import useArrasto from '@/lib/arrastar.js';
import { Dialog, useUI } from '@/lib/ui.jsx';
import { rotas } from '@/lib/routes.js';
import { players as repoJogadores } from '@/lib/data/repository.js';
import { sessoes as repoSessoes } from '@/lib/data/video.js';
import {
  clipesDaSessao,
  fonteDaAnalise,
  moverNaLista,
  tempoVideo,
} from '@/domain/analiseVideo.js';
import { useT } from '@/lib/i18n/index.js';

export default function SessaoVideoPage() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId, videoSessionId } = useRouteParams();
  return (
    <GuardaVideo teamId={teamId}>
      <Sessao clubId={clubId} teamId={teamId} sessaoId={videoSessionId} />
    </GuardaVideo>
  );
}

function Sessao({ clubId, teamId, sessaoId }) {
  const t = useT();
  const router = useRouter();
  const ui = useUI();
  const soLeitura = useSoLeitura(teamId);
  const dados = useDadosVideo(teamId);
  const fotos = useFotosDoEscalao(teamId);
  const [plantel, setPlantel] = useState([]);
  const [aApresentar, setAApresentar] = useState(null);

  useEffect(() => {
    let vivo = true;
    repoJogadores.listByTeam(teamId).then((p) => vivo && setPlantel(p));
    return () => {
      vivo = false;
    };
  }, [teamId]);

  const sessao = dados?.sessoes.find((s) => s.id === sessaoId) || null;
  const analisesPorId = useMemo(() => new Map((dados?.analises || []).map((a) => [a.id, a])), [dados]);
  const clipesPorId = useMemo(() => new Map((dados?.clipes || []).map((c) => [c.id, c])), [dados]);
  const jogadoresPorId = useMemo(() => new Map(plantel.map((j) => [j.id, j])), [plantel]);
  // Só os clipes cuja análise ainda existe: sem ela não há vídeo para mostrar.
  const clipes = useMemo(
    () => clipesDaSessao(sessao, clipesPorId).filter((c) => analisesPorId.has(c.analysisId)),
    [sessao, clipesPorId, analisesPorId]
  );
  const fonteDoClipe = (c) => fonteDaAnalise(analisesPorId.get(c.analysisId));
  const leitor = useLeitorDeClipes({ fonteDoClipe });

  const arrasto = useArrasto((origem, destino) => {
    if (!sessao || origem.i === destino.i) return;
    repoSessoes.ordenar(sessao.id, moverNaLista(clipes.map((c) => c.id), origem.i, destino.i));
  });

  const voltar = rotas.analisesVideo(clubId, teamId, 'sessoes');
  if (!dados) return <p className="muted">{t('comum.aCarregar')}</p>;
  if (!sessao) {
    return (
      <>
        <PageHead title={t('video.sessao.titulo')} backTo={voltar} />
        <Empty>{t('video.sessao.naoEncontrada')}</Empty>
      </>
    );
  }

  const primeiro = clipes[0] || null;
  const emFoco = leitor.ativo || primeiro;
  const destinatario = sessao.playerId ? jogadoresPorId.get(sessao.playerId) : null;

  async function renomear() {
    const titulo = await ui.open((close) => <NomeDaSessao inicial={sessao.title} onFechar={close} />);
    if (titulo) await repoSessoes.renomear(sessao.id, titulo);
  }

  async function apagar() {
    const certo = await ui.confirmar(t('video.sessao.apagarConfirma'), { okLabel: t('video.apagar') });
    if (!certo) return;
    await repoSessoes.apagar(sessao.id);
    router.push(voltar);
  }

  async function juntar() {
    const naSessao = new Set(clipes.map((c) => c.id));
    const ids = await ui.open((close) => (
      <EscolherClipes
        analises={dados.analises}
        clipes={dados.clipes.filter((c) => !naSessao.has(c.id))}
        jogadores={jogadoresPorId}
        fotos={fotos}
        onFechar={close}
      />
    ));
    if (ids?.length) await repoSessoes.juntar(sessao.id, ids);
  }

  function apresentar(desde = 0) {
    leitor.parar();
    setAApresentar(desde);
  }

  return (
    <div className="vanalise">
      <PageHead
        title={sessao.title}
        subtitle={
          destinatario
            ? t('video.sessao.paraSub', { nome: destinatario.name, n: clipes.length })
            : nClipes(t, clipes.length)
        }
        backTo={voltar}
        actions={
          <>
            {clipes.length ? (
              <button type="button" className="btn btn--primary btn--tiny" onClick={() => apresentar(0)}>
                ▶ {t('video.apresentar')}
              </button>
            ) : null}
            {soLeitura ? null : (
              <>
                {clipes.length ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--tiny"
                    onClick={() => ui.open((close) => <PartilharSessaoVideo sessao={sessao} onFechar={close} />)}
                  >
                    {t('tatica.partilhar')}
                  </button>
                ) : null}
                <button type="button" className="btn btn--ghost btn--tiny" onClick={renomear}>
                  {t('video.sessao.renomear')}
                </button>
                <button type="button" className="btn btn--ghost btn--danger btn--tiny" onClick={apagar}>
                  {t('video.apagar')}
                </button>
              </>
            )}
          </>
        }
      />

      {clipes.length === 0 ? (
        <Empty
          action={
            soLeitura || !dados.clipes.length ? null : (
              <button className="btn btn--primary" onClick={juntar}>
                {t('video.sessao.juntarClipes')}
              </button>
            )
          }
        >
          {t(dados.clipes.length ? 'video.sessao.semClipes' : 'video.sessao.semClipesNenhum')}
        </Empty>
      ) : (
        <div className="vanalise__grelha">
          <div className="vanalise__principal">
            <div className="vanalise__palco">
              <LeitorVideo
                fonte={fonteDoClipe(primeiro)}
                inicioSeg={primeiro.startMs / 1000}
                titulo={sessao.title}
                {...leitor.propsDoLeitor}
              />
              <ControlosVideo leitor={leitor} />
            </div>
            <LegendaClipe
              clipe={emFoco}
              jogadores={jogadoresPorId}
              fotos={fotos}
              indice={clipes.findIndex((c) => c.id === emFoco.id)}
              total={clipes.length}
            />
          </div>

          <aside className="vanalise__lado">
            <div className="vlista">
              <header className="vlista__topo">
                <h2 className="vlista__titulo">{t('video.sessao.ordem')}</h2>
                <span className="toolbar__spacer" />
                {leitor.fila ? (
                  <button type="button" className="btn btn--ghost btn--tiny" onClick={leitor.parar}>
                    {t('video.pararFila')}
                  </button>
                ) : (
                  <button type="button" className="btn btn--ghost btn--tiny" onClick={() => leitor.tocarFila(clipes)}>
                    ▶ {t('video.verTodos')}
                  </button>
                )}
              </header>
              <div className="vclipes">
                {clipes.map((c, i) => {
                  const pega = soLeitura ? {} : arrasto.pegar({ i });
                  const solta = arrasto.alvo({ i });
                  return (
                    <div
                      key={c.id}
                      data-largar={solta['data-largar']}
                      className={`vordem ${solta.className} ${arrasto.origem?.i === i ? 'is-a-arrastar' : ''}`}
                    >
                      <LinhaClipe
                        clipe={c}
                        jogadores={jogadoresPorId}
                        fotos={fotos}
                        ativo={leitor.ativo?.id === c.id}
                        subtitulo={analisesPorId.get(c.analysisId)?.title}
                        onTocar={() => leitor.tocarClipe(c)}
                        antes={
                          soLeitura ? (
                            <span className="vordem__n mono">{i + 1}</span>
                          ) : (
                            <span
                              {...pega}
                              className={`vordem__pega ${pega.className || ''}`}
                              title={t('video.sessao.arrastar')}
                              aria-label={t('video.sessao.arrastar')}
                            >
                              <span className="vordem__n mono">{i + 1}</span>
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                                <circle cx="9" cy="6" r="1.6" />
                                <circle cx="15" cy="6" r="1.6" />
                                <circle cx="9" cy="12" r="1.6" />
                                <circle cx="15" cy="12" r="1.6" />
                                <circle cx="9" cy="18" r="1.6" />
                                <circle cx="15" cy="18" r="1.6" />
                              </svg>
                            </span>
                          )
                        }
                        acoes={
                          soLeitura ? null : (
                            <button
                              type="button"
                              className="vclipe__editar"
                              onClick={() => repoSessoes.tirar(sessao.id, c.id)}
                              aria-label={t('video.sessao.tirar')}
                              title={t('video.sessao.tirar')}
                            >
                              ✕
                            </button>
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>
              {soLeitura ? null : (
                <button type="button" className="btn btn--ghost btn--tiny vlista__mais" onClick={juntar}>
                  + {t('video.sessao.juntarClipes')}
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {aApresentar != null ? (
        <Apresentacao
          clipes={clipes}
          fonteDoClipe={fonteDoClipe}
          jogadores={jogadoresPorId}
          fotos={fotos}
          titulo={sessao.title}
          inicio={aApresentar}
          onFechar={() => setAApresentar(null)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------- juntar clipe a clipe */

/** Escolher clipes de qualquer análise para entrarem na sessão. */
function EscolherClipes({ analises, clipes, jogadores, fotos, onFechar }) {
  const t = useT();
  const [escolhidos, setEscolhidos] = useState(() => new Set());
  const porAnalise = analises
    .map((a) => ({ analise: a, clipes: clipes.filter((c) => c.analysisId === a.id) }))
    .filter((g) => g.clipes.length);

  const alternar = (id) =>
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  return (
    <Dialog title={t('video.sessao.juntarClipes')} onClose={() => onFechar(null)} wide>
      {porAnalise.length === 0 ? (
        <p className="modal__text">{t('video.sessao.semMaisClipes')}</p>
      ) : (
        <div className="vescolher">
          {porAnalise.map(({ analise, clipes: lista }) => (
            <section key={analise.id}>
              <h3 className="vescolher__titulo">{analise.title}</h3>
              <div className="vclipes">
                {lista.map((c) => (
                  <LinhaClipe
                    key={c.id}
                    clipe={c}
                    jogadores={jogadores}
                    fotos={fotos}
                    escolhido={escolhidos.has(c.id)}
                    onTocar={() => alternar(c.id)}
                    antes={
                      <input
                        type="checkbox"
                        className="vcaixa"
                        checked={escolhidos.has(c.id)}
                        onChange={() => alternar(c.id)}
                        aria-label={`${tituloDoClipe(t, c)} ${tempoVideo(c.startMs)}`}
                      />
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <footer className="modal__actions">
        <button type="button" className="btn btn--ghost" onClick={() => onFechar(null)}>
          {t('comum.cancelar')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!escolhidos.size}
          onClick={() => onFechar([...escolhidos])}
        >
          {t('video.sessao.juntarN', { n: escolhidos.size })}
        </button>
      </footer>
    </Dialog>
  );
}
