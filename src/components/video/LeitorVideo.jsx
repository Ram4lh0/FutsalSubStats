'use client';

// components/video/LeitorVideo.jsx — o leitor, seja qual for a fonte.
//
// Os ecrãs (análise, sessão, jogador, link público, modo Apresentar) só
// conhecem este componente e o seu contrato:
//
//   props   fonte = { tipo: 'youtube', id }                 (ver `fonteDaAnalise`)
//                 | { tipo: 'local', id, ficheiro }
//           inicioSeg, soLeitura, onPronto, onEstado, onTempo(seg), onErro(codigo)
//   ref     pronto() tocar() pausar() aTocar() tempo() duracao()
//           irPara(seg, { tocar }) velocidade(v) abrir(fonte, seg, { tocar })
//
// Há um leitor por tipo de fonte — `LeitorYouTube` (iframe) e `LeitorLocal`
// (`<video>` com um ficheiro do computador) — com o mesmo contrato. Este
// componente escolhe qual monta e troca-o quando a fonte muda: uma sessão
// pode juntar clipes de vários vídeos, de origens diferentes.
//
// Trocar de vídeo sem ficar preso nem tocar o anterior:
//
//   · A fonte em curso vive num ref (`atualRef`) e num estado (`atual`). O ref
//     muda logo, para dois pedidos seguidos verem sempre a fonte certa.
//   · Um pedido para outra fonte (ou para um leitor que ainda está a abrir)
//     fica em `pendenteRef` e cumpre-se quando ESSE leitor disser que está
//     pronto. Só o último pedido conta.
//   · Enquanto há um pedido pendente, os tempos que o leitor antigo ainda
//     avise são ignorados: senão o clipe novo julgava-se fora do sítio.
//   · Cada leitor local é montado por análise (`key`): ao sair, pára, larga o
//     ficheiro e liberta o endereço temporário.
//
// Quando o vídeo não pode ser mostrado, diz-se porquê e o que fazer: abrir no
// YouTube (privado, incorporação desligada, WebView a recusar a origem),
// voltar a ligar o ficheiro (análise local sem ficheiro neste aparelho), ou
// escolher outro (formato ou codec que o browser não toca).

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import LeitorYouTube from './LeitorYouTube.jsx';
import LeitorLocal from './LeitorLocal.jsx';
import CamadaVideo from './CamadaVideo.jsx';
import { BotaoEscolherVideo, ErroDoVideoLocal, VideoEmFalta, useLigarVideo } from './LigarVideo.jsx';
import useFicheiroLigado from '@/lib/useFicheiroLigado.js';
import {
  FONTE,
  PROPORCAO_OMISSAO,
  linkYouTubeNoSegundo,
  mesmaFonte,
  passoDeAbertura,
} from '@/domain/analiseVideo.js';
import { abrirFora } from '@/lib/partilha.js';
import { useT } from '@/lib/i18n/index.js';

const LeitorVideo = forwardRef(function LeitorVideo(
  { fonte, inicioSeg = 0, titulo, soLeitura = true, camada = null, onPronto, onEstado, onTempo, onErro, className = '' },
  ref
) {
  const t = useT();
  const caixa = useRef(null);
  const interno = useRef(null);
  const ultimoTempo = useRef(Math.max(0, Number(inicioSeg) || 0));
  const velocidadeRef = useRef(1);
  // A fonte em curso: o ref muda no instante do pedido, o estado manda desenhar.
  const atualRef = useRef(fonte);
  const [atual, setAtual] = useState(fonte);
  // O id que o leitor do YouTube tem carregado (ele troca de vídeo sem remontar).
  const idNoYouTube = useRef(fonte?.tipo === FONTE.YOUTUBE ? fonte.id : null);
  // O pedido por cumprir: { seg, tocar }. Cumpre-se quando o leitor ficar pronto.
  const pendenteRef = useRef(null);
  // De onde arranca o leitor que for montado a seguir.
  const [arranque, setArranque] = useState(Math.max(0, Number(inicioSeg) || 0));
  const [erro, setErro] = useState(null);
  const [proporcao, setProporcao] = useState(PROPORCAO_OMISSAO);
  // Sobe a cada troca pedida: garante um desenho novo, mesmo quando a troca
  // acaba no vídeo que já estava no ecrã (ver o efeito do pedido por cumprir).
  const [, setTrocas] = useState(0);
  const ouvintes = useRef({});
  ouvintes.current = { onPronto, onEstado, onTempo, onErro };

  const ficheiro = useFicheiroLigado(atual?.tipo === FONTE.LOCAL ? atual.id : null);
  const { ligar, aLigar } = useLigarVideo(soLeitura);

  /** Passa a mostrar outra fonte; o pedido cumpre-se quando ela abrir. */
  const trocar = useCallback((alvo, seg, tocar) => {
    const inicio = Math.max(0, Number(seg) || 0);
    pendenteRef.current = { seg: inicio, tocar };
    // O leitor do YouTube só se monta de novo quando se vem de outra origem, e
    // nasce já com este vídeo; se já estava montado, tem o que tinha.
    if (alvo?.tipo === FONTE.YOUTUBE && atualRef.current?.tipo !== FONTE.YOUTUBE) idNoYouTube.current = alvo.id;
    atualRef.current = alvo;
    ultimoTempo.current = inicio;
    setErro(null);
    setArranque(inicio);
    setAtual(alvo);
    setTrocas((n) => n + 1);
    if (alvo?.tipo !== FONTE.LOCAL) setProporcao(PROPORCAO_OMISSAO);
    // O leitor que sai não avisa que parou: diz-se aqui, para o botão de
    // tocar/pausa não ficar a mentir enquanto o novo abre.
    ouvintes.current.onEstado?.('parado');
    ouvintes.current.onTempo?.(inicio);
  }, []);

  const abrir = useCallback(
    (novaFonte, seg = 0, { tocar = true } = {}) => {
      const alvo = novaFonte || atualRef.current;
      if (!alvo) return;
      const inicio = Math.max(0, Number(seg) || 0);
      const leitor = interno.current;
      const pronto = Boolean(leitor?.pronto());

      const passo = passoDeAbertura(atualRef.current, alvo, pronto && !pendenteRef.current);

      // O mesmo vídeo, já aberto: é só ir para lá.
      if (passo === 'ir') {
        atualRef.current = alvo;
        setErro(null);
        ultimoTempo.current = inicio;
        if (alvo.tipo === FONTE.YOUTUBE) {
          idNoYouTube.current = alvo.id;
          leitor.abrir(alvo.id, inicio, { tocar });
        } else {
          leitor.irPara(inicio, { tocar });
        }
        return;
      }
      // Outro vídeo do YouTube, com o leitor do YouTube aberto: troca lá dentro.
      if (passo === 'dentro') {
        atualRef.current = alvo;
        idNoYouTube.current = alvo.id;
        ultimoTempo.current = inicio;
        setErro(null);
        setAtual(alvo);
        leitor.abrir(alvo.id, inicio, { tocar });
        return;
      }
      // Outra origem, outro ficheiro, ou um leitor ainda a abrir.
      trocar(alvo, inicio, tocar);
    },
    [trocar]
  );

  // A fonte pedida por quem monta mudou (outra análise no mesmo ecrã): abre-se
  // essa, parada. Os clipes de uma sessão entram pelo `abrir()` e não por aqui.
  const fonteDaProp = useRef(fonte);
  useEffect(() => {
    if (mesmaFonte(fonte, fonteDaProp.current)) {
      // A mesma análise, mas os metadados do ficheiro podem ter mudado.
      if (
        fonte &&
        mesmaFonte(fonte, atualRef.current) &&
        JSON.stringify(fonte.ficheiro || null) !== JSON.stringify(atualRef.current.ficheiro || null)
      ) {
        atualRef.current = fonte;
        setAtual(fonte);
      }
      fonteDaProp.current = fonte;
      return;
    }
    fonteDaProp.current = fonte;
    if (fonte && !mesmaFonte(fonte, atualRef.current)) trocar(fonte, inicioSeg, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonte]);

  useImperativeHandle(
    ref,
    () => ({
      pronto: () => Boolean(interno.current?.pronto()) && !pendenteRef.current,
      tocar: () => {
        if (pendenteRef.current) pendenteRef.current.tocar = true;
        else interno.current?.tocar();
      },
      pausar: () => {
        if (pendenteRef.current) pendenteRef.current.tocar = false;
        else interno.current?.pausar();
      },
      aTocar: () => !pendenteRef.current && Boolean(interno.current?.aTocar()),
      tempo: () => (pendenteRef.current ? pendenteRef.current.seg : interno.current?.tempo() ?? ultimoTempo.current),
      duracao: () => (pendenteRef.current ? 0 : interno.current?.duracao() ?? 0),
      irPara: (seg, opcoes) => {
        const alvo = Math.max(0, Number(seg) || 0);
        ultimoTempo.current = alvo;
        if (pendenteRef.current) {
          pendenteRef.current = { seg: alvo, tocar: opcoes?.tocar ?? pendenteRef.current.tocar };
          ouvintes.current.onTempo?.(alvo);
        } else if (interno.current) {
          interno.current.irPara(alvo, opcoes);
        } else {
          // Sem leitor (vídeo em falta): fica para quando houver.
          pendenteRef.current = { seg: alvo, tocar: opcoes?.tocar ?? false };
          ouvintes.current.onTempo?.(alvo);
        }
      },
      velocidade: (v) => {
        velocidadeRef.current = Number(v) || 1;
        interno.current?.velocidade(velocidadeRef.current);
      },
      abrir,
      /** A fonte que está no ecrã (ou a caminho dele). */
      fonte: () => atualRef.current,
    }),
    [abrir]
  );

  /**
   * Cumpre o pedido que estava à espera de um leitor pronto.
   *
   * @param {boolean} acabouDeAbrir o leitor abriu agora mesmo (já está no
   *   ponto de arranque) ou já estava aberto, noutro ponto qualquer
   */
  const cumprirPedido = (acabouDeAbrir) => {
    const leitor = interno.current;
    const pedido = pendenteRef.current;
    pendenteRef.current = null;
    leitor?.velocidade(velocidadeRef.current);
    if (!pedido || !leitor) return;
    const alvo = atualRef.current;
    const opcoes = pedido.tocar == null ? undefined : { tocar: pedido.tocar };
    if (alvo?.tipo === FONTE.YOUTUBE) {
      if (alvo.id !== idNoYouTube.current) {
        idNoYouTube.current = alvo.id;
        leitor.abrir(alvo.id, pedido.seg, { tocar: Boolean(pedido.tocar) });
      } else if (!acabouDeAbrir || pedido.tocar != null || pedido.seg !== arranque) {
        leitor.irPara(pedido.seg, opcoes);
      }
    } else {
      leitor.irPara(pedido.seg, opcoes);
    }
  };

  /** O leitor de dentro abriu o vídeo: cumpre-se o que estava pedido. */
  const aoPronto = () => {
    cumprirPedido(true);
    ouvintes.current.onPronto?.();
  };

  // Uma troca pode acabar no vídeo que já estava aberto: toca-se num clipe do
  // YouTube e logo a seguir num do ficheiro que estava no ecrã, antes de o
  // leitor chegar a mudar. Aí ninguém volta a dizer "pronto" — o leitor nunca
  // saiu — e o pedido ficava por cumprir, com o relógio parado. Depois de cada
  // desenho, se há um pedido e o leitor montado já está pronto, cumpre-se.
  // (Um leitor acabado de montar ainda não está pronto: esse avisa.)
  useEffect(() => {
    if (pendenteRef.current && interno.current?.pronto()) cumprirPedido(false);
  });

  const aoTempo = (seg) => {
    // Com um pedido por cumprir, este tempo é do vídeo que está a sair.
    if (pendenteRef.current) return;
    ultimoTempo.current = seg;
    ouvintes.current.onTempo?.(seg);
  };

  const aoErro = (codigo) => {
    setErro(codigo);
    ouvintes.current.onErro?.(codigo);
  };

  const local = atual?.tipo === FONTE.LOCAL;

  /** Do aviso de erro: escolher outro ficheiro para esta análise. */
  async function escolherOutro(novo) {
    const resposta = await ligar(atualRef.current, novo);
    if (resposta.ligado) {
      pendenteRef.current = pendenteRef.current || { seg: ultimoTempo.current, tocar: false };
      setErro(null);
    } else if (resposta.erro) {
      setErro(resposta.erro);
    }
  }

  if (!atual || (atual.tipo !== FONTE.YOUTUBE && !local)) {
    return (
      <div className={`vleitor vleitor--aviso ${className}`}>
        <p>{t('video.erro.fonte')}</p>
      </div>
    );
  }

  // Análise de um ficheiro que não está ligado neste aparelho (página
  // recarregada, outro computador): os clipes estão cá, falta o vídeo.
  if (local && !ficheiro) {
    return <VideoEmFalta fonte={atual} soLeitura={soLeitura} className={className} />;
  }

  const abrirNoYouTube = () =>
    abrirFora(linkYouTubeNoSegundo(atualRef.current?.id || atual.id, ultimoTempo.current));

  return (
    <div className={`vleitor ${className}`} ref={caixa} data-fonte={atual.tipo}>
      {local ? (
        <LeitorLocal
          key={`local:${atual.id}`}
          ref={interno}
          ficheiro={ficheiro}
          inicioSeg={arranque}
          titulo={titulo}
          onPronto={aoPronto}
          onEstado={(estado) => ouvintes.current.onEstado?.(estado)}
          onTempo={aoTempo}
          onErro={aoErro}
          onImagem={({ largura, altura }) => setProporcao(largura / altura)}
        />
      ) : (
        <LeitorYouTube
          key="youtube"
          ref={interno}
          id={atual.id}
          inicioSeg={arranque}
          titulo={titulo}
          onPronto={aoPronto}
          onEstado={(estado) => ouvintes.current.onEstado?.(estado)}
          onTempo={aoTempo}
          onErro={aoErro}
        />
      )}
      {erro ? null : (
        <CamadaVideo
          caixaRef={caixa}
          proporcao={proporcao}
          tempoMs={() => Math.round((interno.current?.tempo() ?? ultimoTempo.current) * 1000)}
        >
          {camada}
        </CamadaVideo>
      )}
      {erro ? (
        <div className="vleitor__erro" role="alert">
          {local ? (
            <>
              <ErroDoVideoLocal erro={erro === 'ficheiro' || erro === 'formato' ? erro : 'outro'} />
              <div className="vleitor__erroacoes">
                <BotaoEscolherVideo className="btn btn--primary btn--tiny" disabled={aLigar} onFicheiro={escolherOutro}>
                  {t(erro === 'ficheiro' ? 'video.local.religar' : 'video.local.escolherOutro')}
                </BotaoEscolherVideo>
              </div>
            </>
          ) : (
            <>
              <strong>{t(`video.erro.${erro}`)}</strong>
              {erro === 'privado' || erro === 'incorporacao' ? <p>{t('video.erro.comoResolver')}</p> : null}
              {erro === 'origem' ? <p>{t('video.erro.origemExplica')}</p> : null}
              <div className="vleitor__erroacoes">
                {erro !== 'invalido' ? (
                  <button type="button" className="btn btn--primary btn--tiny" onClick={abrirNoYouTube}>
                    {t('video.abrirNoYouTube')}
                  </button>
                ) : null}
                <button type="button" className="btn btn--ghost btn--tiny" onClick={() => setErro(null)}>
                  {t('comum.fechar')}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
});

export default LeitorVideo;
