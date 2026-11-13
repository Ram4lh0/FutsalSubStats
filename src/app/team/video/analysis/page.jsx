'use client';

// Treino → Análise de vídeo → uma análise: o leitor, o painel de marcação e
// os clipes.
//
// É o ecrã onde o treinador passa o tempo, e por isso só tem três coisas: o
// vídeo, os botões de marcar e a lista do que já marcou. Um toque numa
// categoria guarda logo um clipe à volta do instante em que se tocou
// ([t − 6 s, t + 4 s] por omissão); o resto (subtipo, valência, jogadores,
// nota) é opcional e mora numa folha que não tapa o vídeo nem o pára.
//
// No computador há atalhos: espaço toca/pára, ←/→ andam 5 s (com Shift,
// 0,1 s), 1–8 marcam as categorias, I e O marcam o início e o fim de um
// clipe manual, Esc fecha a folha.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import { Empty } from '@/components/bits.jsx';
import { useFotosDoEscalao } from '@/components/FotoJogador.jsx';
import LeitorVideo from '@/components/video/LeitorVideo.jsx';
import FolhaClipe from '@/components/video/FolhaClipe.jsx';
import useLeitorDeClipes from '@/components/video/useLeitorDeClipes.js';
import { DefinicoesAnalise, rotuloDoJogo } from '@/components/video/FormAnalise.jsx';
import { EscolherSessao, GuardaVideo } from '@/components/video/dialogos.jsx';
import {
  ControlosVideo,
  IconeCategoria,
  LinhaClipe,
  nClipes,
  sinalDaValencia,
} from '@/components/video/pecas.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import useDadosVideo from '@/lib/useDadosVideo.js';
import { useUI } from '@/lib/ui.jsx';
import { rotas } from '@/lib/routes.js';
import { matches as repoJogos, players as repoJogadores } from '@/lib/data/repository.js';
import { analises as repoAnalises, clipes as repoClipes } from '@/lib/data/video.js';
import { lerMargens } from '@/lib/videoPrefs.js';
import {
  CATEGORIAS_VIDEO,
  FILTRO_VAZIO,
  alternarFiltro,
  categoriaVideo,
  chaveDoSubtipo,
  filtrarClipes,
  filtroAtivo,
  fonteDaAnalise,
  intervaloDoToque,
  intervaloManual,
  opcoesDeFiltro,
  tempoVideo,
} from '@/domain/analiseVideo.js';
import { deIsoDia } from '@/domain/treino.js';
import { useLocale, useT } from '@/lib/i18n/index.js';

export default function AnaliseVideoPage() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId, videoId } = useRouteParams();
  return (
    <GuardaVideo teamId={teamId}>
      <Analise clubId={clubId} teamId={teamId} videoId={videoId} />
    </GuardaVideo>
  );
}

function Analise({ clubId, teamId, videoId }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const ui = useUI();
  const soLeitura = useSoLeitura(teamId);
  const dados = useDadosVideo(teamId);
  const fotos = useFotosDoEscalao(teamId);
  // O tempo do link colado: a análise abre onde o treinador a queria.
  const inicioSeg = Number(useSearchParams().get('inicio')) || 0;

  const [plantel, setPlantel] = useState([]);
  const [jogos, setJogos] = useState([]);
  const [filtro, setFiltro] = useState(FILTRO_VAZIO);
  const [folha, setFolha] = useState(null); // { id, novo }
  const [inicioManual, setInicioManual] = useState(null);
  const [margens, setMargens] = useState(null);
  const [duracao, setDuracao] = useState(0);
  // Os chips dos filtros ficam recolhidos até se pedirem: com um jogo inteiro
  // marcado são muitos, e a lista de clipes é que interessa.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  useEffect(() => {
    setMargens(lerMargens());
  }, []);

  useEffect(() => {
    let vivo = true;
    Promise.all([repoJogadores.listByTeam(teamId), repoJogos.listByTeam(teamId)]).then(([p, j]) => {
      if (!vivo) return;
      setPlantel(p);
      setJogos(j);
    });
    return () => {
      vivo = false;
    };
  }, [teamId]);

  const analise = dados?.analises.find((a) => a.id === videoId) || null;
  const fonte = useMemo(() => fonteDaAnalise(analise), [analise]);
  const leitor = useLeitorDeClipes({ fonteDoClipe: () => fonte });

  const clipes = useMemo(
    () => (dados?.clipes || []).filter((c) => c.analysisId === videoId),
    [dados, videoId]
  );
  const jogadoresPorId = useMemo(() => new Map(plantel.map((j) => [j.id, j])), [plantel]);
  const ativos = useMemo(() => plantel.filter((j) => j.isActive !== false), [plantel]);
  const opcoes = useMemo(() => opcoesDeFiltro(clipes), [clipes]);
  const visiveis = useMemo(() => filtrarClipes(clipes, filtro), [clipes, filtro]);
  const clipeDaFolha = folha ? clipes.find((c) => c.id === folha.id) || null : null;

  // A duração só se sabe depois de o leitor arrancar (e é o que prende os
  // clipes ao fim do vídeo e desenha a linha do tempo).
  useEffect(() => {
    if (!leitor.pronto || duracao) return;
    const d = leitor.duracaoMs();
    if (d) setDuracao(d);
  }, [leitor, leitor.pronto, leitor.estado, duracao]);

  /* ---------------------------------------------------------- marcar */

  const marcar = useCallback(
    async (categoria) => {
      if (soLeitura || !analise) return;
      const intervalo = intervaloDoToque(leitor.tempoAgoraMs(), margens || undefined, leitor.duracaoMs() || null);
      const clipe = await repoClipes.criar(analise, { ...intervalo, category: categoria });
      setFolha({ id: clipe.id, novo: true });
    },
    [soLeitura, analise, leitor, margens]
  );

  const marcarInicio = useCallback(() => {
    if (soLeitura) return;
    setInicioManual(leitor.tempoAgoraMs());
  }, [soLeitura, leitor]);

  const marcarFim = useCallback(async () => {
    if (soLeitura || !analise) return;
    if (inicioManual == null) {
      ui.toast(t('video.manual.faltaInicio'), 'info');
      return;
    }
    const intervalo = intervaloManual(inicioManual, leitor.tempoAgoraMs(), leitor.duracaoMs() || null);
    const clipe = await repoClipes.criar(analise, intervalo);
    setInicioManual(null);
    setFolha({ id: clipe.id, novo: true });
  }, [soLeitura, analise, inicioManual, leitor, ui, t]);

  /* --------------------------------------------------------- atalhos */

  const atalhos = useRef({});
  atalhos.current = { marcar, marcarInicio, marcarFim, leitor, fecharFolha: () => setFolha(null) };

  useEffect(() => {
    function aoTeclar(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target;
      const aEscrever =
        alvo instanceof HTMLElement &&
        (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName));
      if (aEscrever) return;
      // Com uma janela aberta (definições, sessão), os atalhos ficam quietos.
      if (document.querySelector('.backdrop')) return;
      const a = atalhos.current;
      if (e.key === ' ' || e.code === 'Space') {
        // Num botão, o espaço já é o toque dele.
        if (alvo instanceof HTMLElement && alvo.tagName === 'BUTTON') alvo.blur();
        e.preventDefault();
        a.leitor.alternar();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) a.leitor.passo(-0.1);
        else a.leitor.saltar(-5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) a.leitor.passo(0.1);
        else a.leitor.saltar(5);
      } else if (/^[1-9]$/.test(e.key)) {
        const categoria = CATEGORIAS_VIDEO[Number(e.key) - 1];
        if (categoria) a.marcar(categoria.id);
      } else if (e.key === 'i' || e.key === 'I') {
        a.marcarInicio();
      } else if (e.key === 'o' || e.key === 'O') {
        a.marcarFim();
      } else if (e.key === 'Escape') {
        a.fecharFolha();
      }
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  /* ------------------------------------------------------------ ecrã */

  const voltar = rotas.analisesVideo(clubId, teamId);
  if (!dados) return <p className="muted">{t('comum.aCarregar')}</p>;
  if (!analise || !fonte) {
    return (
      <>
        <PageHead title={t('video.titulo')} backTo={voltar} />
        <Empty>{t('video.naoEncontrada')}</Empty>
      </>
    );
  }

  const jogo = jogos.find((j) => j.id === analise.matchId);
  const subtitulo = [
    analise.recordedOn
      ? deIsoDia(analise.recordedOn).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
      : null,
    jogo ? rotuloDoJogo(jogo) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  async function abrirDefinicoes() {
    const resposta = await ui.open((close) => (
      <DefinicoesAnalise
        analise={analise}
        jogos={jogos}
        margens={margens || lerMargens()}
        tempoSeg={leitor.tempoMs / 1000}
        soLeitura={soLeitura}
        onMargens={setMargens}
        onFechar={close}
      />
    ));
    if (resposta !== 'apagar') return;
    const certo = await ui.confirmar(t('video.apagarAnaliseConfirma', { n: clipes.length }), {
      okLabel: t('video.apagar'),
    });
    if (!certo) return;
    await repoAnalises.apagar(analise.id);
    router.push(voltar);
  }

  async function apagarClipe(clipe) {
    const certo = await ui.confirmar(t('video.apagarClipeConfirma'), { okLabel: t('video.apagar') });
    if (!certo) return;
    if (leitor.ativo?.id === clipe.id) leitor.parar();
    await repoClipes.apagar(clipe.id);
    setFolha(null);
  }

  async function juntarASessao(ids, sugestao) {
    if (!ids.length) return;
    const sessao = await ui.open((close) => (
      <EscolherSessao teamId={teamId} clipIds={ids} sugestao={sugestao} onFechar={close} />
    ));
    if (sessao) ui.toast(t('video.sessao.guardada', { titulo: sessao.title }), 'ok');
  }

  const mudarFiltro = (grupo, valor) => setFiltro((f) => alternarFiltro(f, grupo, valor));
  const subtiposDoFiltro = filtro.categorias.length
    ? opcoes.subtipos.filter((s) => filtro.categorias.some((c) => categoriaVideo(c).subtipos.includes(s)))
    : [];
  const temFiltro = filtroAtivo(filtro);

  return (
    <div className="vanalise vanalise--marcar">
      <PageHead
        title={analise.title}
        subtitle={subtitulo || null}
        backTo={voltar}
        actions={
          <button
            type="button"
            className="btn btn--ghost btn--tiny"
            onClick={abrirDefinicoes}
            aria-label={t('video.definicoes')}
          >
            {t('video.definicoes')}
          </button>
        }
      />

      <div className="vanalise__grelha">
        <div className="vanalise__principal">
          <div className="vanalise__palco">
            <LeitorVideo fonte={fonte} inicioSeg={inicioSeg} titulo={analise.title} {...leitor.propsDoLeitor} />
            {duracao ? (
              <div className="vtempo" aria-hidden="true">
                {clipes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    tabIndex={-1}
                    className={`vtempo__clipe ${leitor.ativo?.id === c.id ? 'is-ativo' : ''}`}
                    style={{
                      left: `${(c.startMs / duracao) * 100}%`,
                      width: `${Math.max(0.6, ((c.endMs - c.startMs) / duracao) * 100)}%`,
                      background: categoriaVideo(c.category).cor,
                    }}
                    onClick={() => leitor.tocarClipe(c)}
                  />
                ))}
                <span className="vtempo__agora" style={{ left: `${Math.min(100, (leitor.tempoMs / duracao) * 100)}%` }} />
              </div>
            ) : null}
            <ControlosVideo leitor={leitor} />
          </div>

          {soLeitura ? null : (
            <section className="vmarcar" aria-label={t('video.marcar.titulo')}>
              <div className="vmarcar__grelha">
                {CATEGORIAS_VIDEO.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    className="vmarcar__btn"
                    style={{ '--cor': c.cor }}
                    onClick={() => marcar(c.id)}
                  >
                    <IconeCategoria icone={c.icone} tamanho={22} />
                    <span>{t(`video.cat.${c.id}`)}</span>
                    <kbd className="vmarcar__tecla">{i + 1}</kbd>
                  </button>
                ))}
              </div>
              <div className="vmarcar__manual">
                <button
                  type="button"
                  className={`btn btn--ghost btn--tiny ${inicioManual != null ? 'is-on' : ''}`}
                  onClick={marcarInicio}
                >
                  {inicioManual != null
                    ? t('video.manual.inicioEm', { tempo: tempoVideo(inicioManual) })
                    : t('video.manual.inicio')}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--tiny"
                  onClick={marcarFim}
                  disabled={inicioManual == null}
                >
                  {t('video.manual.fim')}
                </button>
                {inicioManual != null ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--tiny"
                    onClick={() => setInicioManual(null)}
                    aria-label={t('comum.cancelar')}
                  >
                    ✕
                  </button>
                ) : null}
                <span className="vmarcar__dica muted">
                  {t('video.marcar.dica', {
                    antes: (margens?.antesMs ?? 6000) / 1000,
                    depois: (margens?.depoisMs ?? 4000) / 1000,
                  })}
                </span>
              </div>
            </section>
          )}
        </div>

        <aside className="vanalise__lado">
          {clipeDaFolha && !soLeitura ? (
            <FolhaClipe
              clipe={clipeDaFolha}
              jogadores={ativos}
              fotos={fotos}
              novo={folha.novo}
              tempoAgoraMs={leitor.tempoAgoraMs}
              duracaoMs={leitor.duracaoMs}
              onFechar={() => setFolha(null)}
              onTocar={(c) => leitor.tocarClipe(c)}
              onDuplicado={(c) => c && setFolha({ id: c.id, novo: false })}
              onApagar={apagarClipe}
              onSessao={(c) => juntarASessao([c.id], '')}
            />
          ) : null}

          <div className="vlista">
            <header className="vlista__topo">
              <h2 className="vlista__titulo">
                {temFiltro
                  ? t('video.clipesFiltrados', { n: visiveis.length, total: clipes.length })
                  : nClipes(t, clipes.length)}
              </h2>
              <span className="toolbar__spacer" />
              {clipes.length > 1 ? (
                <button
                  type="button"
                  className={`btn btn--ghost btn--tiny vlista__filtrar ${temFiltro ? 'is-on' : ''}`}
                  aria-expanded={filtrosAbertos || temFiltro}
                  onClick={() => setFiltrosAbertos((v) => !v)}
                >
                  {t('video.filtros')}
                </button>
              ) : null}
              {leitor.fila ? (
                <button type="button" className="btn btn--ghost btn--tiny" onClick={leitor.parar}>
                  {t('video.pararFila')}
                </button>
              ) : visiveis.length > 1 ? (
                <button
                  type="button"
                  className="btn btn--primary btn--tiny"
                  onClick={() => leitor.tocarFila(visiveis)}
                >
                  ▶ {t(temFiltro ? 'video.verFiltrados' : 'video.verTodos')}
                </button>
              ) : null}
            </header>

            {clipes.length && (filtrosAbertos || temFiltro) ? (
              <div className="vfiltros">
                <div className="chiprow">
                  {opcoes.categorias.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`chip chip--small vchip ${filtro.categorias.includes(id) ? 'is-selected' : ''}`}
                      style={{ '--cor': categoriaVideo(id).cor }}
                      onClick={() => mudarFiltro('categorias', id)}
                    >
                      {t(`video.cat.${id}`)}
                    </button>
                  ))}
                  {opcoes.valencias.length > 1
                    ? opcoes.valencias.map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={`chip chip--small vchip vchip--${v} ${filtro.valencias.includes(v) ? 'is-selected' : ''}`}
                          onClick={() => mudarFiltro('valencias', v)}
                        >
                          {sinalDaValencia(v)} {t(`video.valencia.${v}`)}
                        </button>
                      ))
                    : null}
                </div>
                {subtiposDoFiltro.length ? (
                  <div className="chiprow">
                    {subtiposDoFiltro.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`chip chip--small ${filtro.subtipos.includes(s) ? 'is-selected' : ''}`}
                        onClick={() => mudarFiltro('subtipos', s)}
                      >
                        {t(chaveDoSubtipo(s))}
                      </button>
                    ))}
                  </div>
                ) : null}
                {opcoes.jogadores.length ? (
                  <div className="chiprow">
                    {opcoes.jogadores
                      .map((id) => jogadoresPorId.get(id))
                      .filter(Boolean)
                      .sort((a, b) => a.shirtNumber - b.shirtNumber)
                      .map((j) => (
                        <button
                          key={j.id}
                          type="button"
                          className={`chip chip--small ${filtro.jogadores.includes(j.id) ? 'is-selected' : ''}`}
                          onClick={() => mudarFiltro('jogadores', j.id)}
                        >
                          <span className="mono">{j.shirtNumber}</span> {j.name}
                        </button>
                      ))}
                  </div>
                ) : null}
                {temFiltro ? (
                  <div className="vfiltros__acoes">
                    <button type="button" className="btn btn--ghost btn--tiny" onClick={() => setFiltro(FILTRO_VAZIO)}>
                      {t('video.limparFiltros')}
                    </button>
                    {soLeitura || !visiveis.length ? null : (
                      <button
                        type="button"
                        className="btn btn--ghost btn--tiny"
                        onClick={() => juntarASessao(visiveis.map((c) => c.id), '')}
                      >
                        {t('video.guardarComoSessao')}
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {clipes.length === 0 ? (
              <p className="vvazio">{t(soLeitura ? 'video.semClipesLeitura' : 'video.semClipes')}</p>
            ) : visiveis.length === 0 ? (
              <p className="vvazio">{t('video.semClipesNoFiltro')}</p>
            ) : (
              <div className="vclipes">
                {visiveis.map((c) => (
                  <LinhaClipe
                    key={c.id}
                    clipe={c}
                    jogadores={jogadoresPorId}
                    fotos={fotos}
                    ativo={leitor.ativo?.id === c.id}
                    escolhido={folha?.id === c.id}
                    onTocar={() => leitor.tocarClipe(c)}
                    acoes={
                      soLeitura ? null : (
                        <button
                          type="button"
                          className="vclipe__editar"
                          onClick={() => setFolha({ id: c.id, novo: false })}
                          aria-label={t('comum.editar')}
                          title={t('comum.editar')}
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
                            <path d="m13.5 6.5 4 4" />
                          </svg>
                        </button>
                      )
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
