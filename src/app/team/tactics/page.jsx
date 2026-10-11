'use client';

// Treino → Quadro Tático: as jogadas do escalão.
//
// Bolas paradas (cantos, livres, laterais, saídas de bola), movimentações e
// jogadas de ataque ou defesa. Cada uma abre no editor, onde se põem as peças
// e se gravam os frames.
//
// Duas vistas:
//   · Deste escalão — as jogadas do escalão;
//   · Biblioteca do clube — as que os escalões do clube partilharam (licença
//     Clube). Abrem só para ver, com "Copiar para este escalão".
//
// Sem licença, cada conta cria até 3 jogadas, contando as apagadas (o servidor
// é que conta — ver `plays_limite_gratis` na migração).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import { rotas } from '@/lib/routes.js';
import { Badge, Empty } from '@/components/bits.jsx';
import CampoTatico from '@/components/tatica/CampoTatico.jsx';
import { useUI } from '@/lib/ui.jsx';
import { DATA_UPDATED_EVENT } from '@/lib/data/sync.js';
import { raw as db } from '@/lib/data/repository.js';
import { jogadas as repoJogadas } from '@/lib/data/treino.js';
import { podeCriarJogada, temLicencaClube } from '@/lib/entitlements.js';
import { pedirVagaParaJogada } from '@/components/tatica/vagaJogada.js';
import { CATEGORIAS, duracaoTotal, normalizar, resolverPosicoes } from '@/domain/jogada.js';
import { useT } from '@/lib/i18n/index.js';

export default function TacticsPage() {
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
      {() => <Lista clubId={clubId} teamId={teamId} />}
    </TeamShell>
  );
}

function Lista({ clubId, teamId }) {
  const t = useT();
  const router = useRouter();
  const { confirmar } = useUI();
  const soLeitura = useSoLeitura(teamId);
  const [lista, setLista] = useState(null);
  const [biblioteca, setBiblioteca] = useState([]);
  const [nomesEscaloes, setNomesEscaloes] = useState(new Map());
  const [vista, setVista] = useState('escalao');
  const [filtro, setFiltro] = useState('TODAS');
  const [vagas, setVagas] = useState(null);
  const [clube, setClube] = useState(false);

  const carregar = useCallback(async () => {
    const [deste, daBiblioteca, equipas, permissao, temClube] = await Promise.all([
      repoJogadas.listByTeam(teamId),
      repoJogadas.biblioteca(clubId),
      db.all(db.STORES.teams),
      podeCriarJogada(teamId),
      temLicencaClube(teamId),
    ]);
    setLista(deste);
    setBiblioteca(daBiblioteca);
    setNomesEscaloes(new Map(equipas.map((e) => [e.id, e.name])));
    setVagas(permissao);
    setClube(temClube);
  }, [teamId, clubId]);

  useEffect(() => {
    carregar();
    window.addEventListener(DATA_UPDATED_EVENT, carregar);
    return () => window.removeEventListener(DATA_UPDATED_EVENT, carregar);
  }, [carregar]);

  const atuais = vista === 'clube' ? biblioteca : lista || [];
  const presentes = useMemo(() => new Set(atuais.map((j) => j.category)), [atuais]);
  if (!lista) return <p className="muted">{t('comum.aCarregar')}</p>;

  const visiveis = filtro === 'TODAS' ? atuais : atuais.filter((j) => j.category === filtro);

  async function nova() {
    if (await pedirVagaParaJogada({ teamId, t, confirmar, router })) {
      router.push(rotas.jogada(clubId, teamId));
    }
  }

  return (
    <>
      <div className="tmodo" role="tablist">
        <button
          type="button"
          role="tab"
          className={`tmodo__btn ${vista === 'escalao' ? 'is-on' : ''}`}
          aria-selected={vista === 'escalao'}
          onClick={() => {
            setVista('escalao');
            setFiltro('TODAS');
          }}
        >
          {t('tatica.desteEscalao')}
        </button>
        <button
          type="button"
          role="tab"
          className={`tmodo__btn ${vista === 'clube' ? 'is-on' : ''}`}
          aria-selected={vista === 'clube'}
          onClick={() => {
            setVista('clube');
            setFiltro('TODAS');
          }}
        >
          {t('tatica.bibliotecaClube')}
        </button>
        <span className="toolbar__spacer" />
        {soLeitura || vista === 'clube' ? null : (
          <button className="btn btn--primary btn--tiny" onClick={nova}>
            {t('tatica.novaJogada')}
          </button>
        )}
      </div>

      {vista === 'escalao' && vagas && !vagas.licensed && !soLeitura ? (
        <p className={`tvagas ${vagas.allowed ? '' : 'is-esgotado'}`}>
          {t('tatica.vagasGratis', { usadas: Math.min(vagas.used, vagas.limit), limite: vagas.limit })}
        </p>
      ) : null}

      {vista === 'clube' && !clube ? (
        <Empty
          action={
            <button className="btn btn--primary" onClick={() => router.push(`${rotas.conta()}#licencas`)}>
              {t('calendarioCsv.verLicencas')}
            </button>
          }
        >
          {t('tatica.bibliotecaSoClube')}
        </Empty>
      ) : (
        <>
          {atuais.length > 0 ? (
            <div className="chiprow tfiltros">
              {['TODAS', ...CATEGORIAS.filter((c) => presentes.has(c))].map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`chip chip--small ${filtro === c ? 'is-selected' : ''}`}
                  onClick={() => setFiltro(c)}
                >
                  {c === 'TODAS' ? t('tatica.todas') : t(`tatica.categoria.${c}`)}
                </button>
              ))}
            </div>
          ) : null}

          {atuais.length === 0 ? (
            vista === 'clube' ? (
              <Empty>{t('tatica.bibliotecaVazia')}</Empty>
            ) : (
              <Empty
                action={
                  soLeitura ? null : (
                    <button className="btn btn--primary" onClick={nova}>
                      {t('tatica.criarPrimeira')}
                    </button>
                  )
                }
              >
                {t('tatica.vazio')}
              </Empty>
            )
          ) : (
            <div className="grid grid--cards tjogadas">
              {visiveis.map((j) => (
                <CartaoJogada
                  key={j.id}
                  jogada={j}
                  escalao={vista === 'clube' ? nomesEscaloes.get(j.teamId) || t('tatica.outroEscalao') : null}
                  onAbrir={() => router.push(rotas.jogada(clubId, teamId, j.id))}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function CartaoJogada({ jogada, escalao, onAbrir }) {
  const t = useT();
  const data = useMemo(() => normalizar(jogada.data), [jogada.data]);
  const inicio = useMemo(() => resolverPosicoes(data)[0], [data]);
  const linkAtivo = jogada.shareToken && jogada.shareExpiresAt > Date.now();
  return (
    <button type="button" className="card tjogada" onClick={onAbrir}>
      <div className="tjogada__mini" aria-hidden="true">
        <CampoTatico data={data} posicoes={inicio} />
      </div>
      <div className="tjogada__texto">
        <strong>{jogada.title}</strong>
        <span className="tjogada__meta">
          <Badge kind="info">{t(`tatica.categoria.${jogada.category}`)}</Badge>
          {escalao ? <Badge kind="muted">{escalao}</Badge> : null}
          <span className="muted">
            {t('tatica.resumo', { frames: data.frames.length, seg: (duracaoTotal(data) / 1000).toFixed(1) })}
          </span>
          {linkAtivo ? <Badge kind="ok">{t('tatica.linkAtivo')}</Badge> : null}
          {!escalao && jogada.sharedWithClub ? <Badge kind="ok">{t('tatica.naBiblioteca')}</Badge> : null}
        </span>
      </div>
    </button>
  );
}
