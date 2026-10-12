'use client';

// O editor de uma jogada.
//
// Põem-se as peças no campo e arrastam-se. Cada frame é uma fotografia: no
// frame seguinte mexe-se só quem muda de sítio, e no leitor as peças deslizam
// de uma posição para a outra (ver domain/jogada.js).
//
// No editor, as posições do frame anterior aparecem esbatidas, com um traço até
// à posição atual — é o que deixa perceber o movimento sem carregar no play.
//
// Grava sozinho, um segundo depois da última mudança. Uma jogada nova só passa
// a existir na primeira gravação, e aí o endereço ganha o id.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import { rotas } from '@/lib/routes.js';
import { Empty, Field } from '@/components/bits.jsx';
import CampoTatico from '@/components/tatica/CampoTatico.jsx';
import LeitorJogada from '@/components/tatica/LeitorJogada.jsx';
import PartilharJogada from '@/components/tatica/PartilharJogada.jsx';
import { useUI } from '@/lib/ui.jsx';
import { jogadas as repoJogadas } from '@/lib/data/treino.js';
import { raw as db } from '@/lib/data/repository.js';
import { podeCriarJogada, temLicencaClube } from '@/lib/entitlements.js';
import { pedirVagaParaJogada } from '@/components/tatica/vagaJogada.js';
import {
  CATEGORIAS,
  DURACOES,
  LADO,
  TIPO,
  acrescentarFrame,
  acrescentarPeca,
  apagarFrame,
  idPecaNova,
  jogadaNova,
  moverPeca,
  mudarDuracao,
  mudarPeca,
  numeroLivre,
  resolverPosicoes,
  tirarPeca,
} from '@/domain/jogada.js';
import { useT } from '@/lib/i18n/index.js';

export default function PlayEditorPage() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId, playId } = useRouteParams();
  return (
    <TeamShell clubId={clubId} teamId={teamId}>
      {(dados) => <Editor clubId={clubId} teamId={teamId} playId={playId} roster={dados.roster} />}
    </TeamShell>
  );
}

const ESPERA_GRAVAR = 900;

function Editor({ clubId, teamId, playId, roster }) {
  const t = useT();
  const router = useRouter();
  const ui = useUI();
  const soLeituraEscalao = useSoLeitura(teamId);

  const [meta, setMeta] = useState(null);
  const [semVaga, setSemVaga] = useState(false);
  const [clube, setClube] = useState(false);
  const [destinos, setDestinos] = useState([]);
  // Uma jogada de outro escalão (aberta a partir da biblioteca do clube) é só
  // para ver: mexer-lhe aqui mudava-a de escalão. Copia-se, e mexe-se na cópia.
  const doutroEscalao = Boolean(meta?.teamId && meta.teamId !== teamId);
  const soLeitura = soLeituraEscalao || doutroEscalao;
  const [data, setData] = useState(null);
  const [naoExiste, setNaoExiste] = useState(false);
  const [frame, setFrame] = useState(0);
  const [selecionada, setSelecionada] = useState(null);
  const [arrasto, setArrasto] = useState(null);
  const [modo, setModo] = useState('editar');
  const [estado, setEstado] = useState('guardado'); // guardado | porGuardar | aGuardar
  const [verDetalhes, setVerDetalhes] = useState(false);
  const carregadoId = useRef(undefined);
  const mudou = useRef(false);

  // Carregar — só quando o id do endereço é outro que não o da jogada aberta.
  // Depois da primeira gravação o endereço ganha o id, e isso não pode voltar
  // a ler a jogada por cima do que se está a fazer.
  useEffect(() => {
    if (carregadoId.current !== undefined && carregadoId.current === (playId || null)) return;
    let vivo = true;
    (async () => {
      if (!playId) {
        // Entrar pelo endereço também conta: sem vaga, não há editor.
        const p = await podeCriarJogada(teamId);
        if (!vivo) return;
        // Só depois da espera: marcado antes, uma passagem cancelada a meio
        // (o React em desenvolvimento corre cada efeito duas vezes) deixava a
        // seguinte achar que já estava carregado — e o editor ficava em
        // "A carregar…" para sempre.
        carregadoId.current = null;
        if (!p.allowed) return setSemVaga(true);
        setMeta({ id: null, title: t('tatica.jogadaNova'), category: 'MOVIMENTACAO', description: '' });
        setData(jogadaNova('meio'));
        setFrame(0);
        return;
      }
      const j = await repoJogadas.get(playId);
      if (!vivo) return;
      carregadoId.current = playId;
      if (!j) return setNaoExiste(true);
      setMeta({
        id: j.id,
        teamId: j.teamId,
        sharedWithClub: !!j.sharedWithClub,
        title: j.title,
        category: j.category,
        description: j.description || '',
        shareToken: j.shareToken,
        shareExpiresAt: j.shareExpiresAt,
      });
      setData(j.data);
      setFrame(0);
    })();
    return () => {
      vivo = false;
    };
  }, [playId, t, teamId]);

  // Licença Clube: partilhar na biblioteca e copiar para outros escalões em que
  // se pode editar.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [temClube, equipas] = await Promise.all([temLicencaClube(teamId), db.all(db.STORES.teams)]);
      if (!vivo) return;
      setClube(temClube);
      setDestinos(
        equipas
          .filter((e) => e.clubId === clubId && e.id !== teamId && !e.archivedAt && e.nivel !== 'ver')
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      );
    })();
    return () => {
      vivo = false;
    };
  }, [teamId, clubId]);


  const gravar = useCallback(async () => {
    if (!meta || !data || soLeitura) return null;
    setEstado('aGuardar');
    const row = await repoJogadas.guardar(teamId, { ...meta, data });
    mudou.current = false;
    setEstado('guardado');
    if (!meta.id) {
      carregadoId.current = row.id;
      setMeta((m) => ({ ...m, id: row.id }));
      router.replace(rotas.jogada(clubId, teamId, row.id));
    }
    return row;
  }, [meta, data, soLeitura, teamId, router, clubId]);

  // Gravação automática.
  useEffect(() => {
    if (!mudou.current) return undefined;
    setEstado('porGuardar');
    const id = setTimeout(gravar, ESPERA_GRAVAR);
    return () => clearTimeout(id);
  }, [meta, data, gravar]);

  const alterar = (fn) => {
    mudou.current = true;
    setData((d) => fn(d));
  };
  const alterarMeta = (patch) => {
    mudou.current = true;
    setMeta((m) => ({ ...m, ...patch }));
  };

  const resolvidas = useMemo(() => (data ? resolverPosicoes(data) : []), [data]);

  if (semVaga) {
    return (
      <>
        <PageHead title={t('tatica.limiteTitulo')} backTo={rotas.quadroTatico(clubId, teamId)} />
        <Empty
          action={
            <button className="btn btn--primary" onClick={() => router.push(`${rotas.conta()}#licencas`)}>
              {t('calendarioCsv.verLicencas')}
            </button>
          }
        >
          {t('tatica.limiteGratis', { n: 3 })}
        </Empty>
      </>
    );
  }
  if (naoExiste) {
    return (
      <>
        <PageHead title={t('tatica.titulo')} backTo={rotas.quadroTatico(clubId, teamId)} />
        <Empty>{t('tatica.naoEncontrada')}</Empty>
      </>
    );
  }
  if (!meta || !data) return <p className="muted">{t('comum.aCarregar')}</p>;

  const f = Math.min(frame, data.frames.length - 1);
  const posicoes = arrasto ? { ...resolvidas[f], [arrasto.id]: arrasto.pos } : resolvidas[f];
  const anteriores = f > 0 ? resolvidas[f - 1] : null;
  const pecaSel = data.pecas.find((p) => p.id === selecionada) || null;

  function novaPeca(tipo, lado) {
    const prefixo = { [TIPO.BOLA]: 'bola', [TIPO.CONE]: 'cone' }[tipo] || (lado === LADO.ELES ? 'e' : 'n');
    const id = idPecaNova(data, prefixo);
    const peca = { id, tipo };
    if (lado) peca.lado = lado;
    if (tipo === TIPO.JOGADOR || tipo === TIPO.GR) peca.num = tipo === TIPO.GR ? 1 : numeroLivre(data, lado);
    // Nasce ao meio da parte visível, desviada um pouco para não cair em cima
    // de outra peça acabada de pôr.
    const desvio = (data.pecas.length % 5) * 22;
    const x = data.campo === 'meio' ? 700 + desvio : 500 + desvio;
    alterar((d) => acrescentarPeca(d, peca, [x, 120 + desvio]));
    setSelecionada(id);
  }

  function novoFrame() {
    alterar((d) => acrescentarFrame(d, f));
    setFrame(f + 1);
  }

  async function eliminarFrame() {
    if (data.frames.length <= 1) return;
    alterar((d) => apagarFrame(d, f));
    setFrame(Math.max(0, f - 1));
  }

  async function partilhar() {
    const row = mudou.current || !meta.id ? await gravar() : await repoJogadas.get(meta.id);
    const atual = row || (await repoJogadas.get(meta.id));
    if (!atual) return;
    const final = await ui.open((close) => <PartilharJogada jogada={atual} onFechar={close} />);
    if (final) setMeta((m) => ({ ...m, shareToken: final.shareToken, shareExpiresAt: final.shareExpiresAt }));
  }

  async function copiarPara(destinoId) {
    if (!destinoId || !meta.id) return;
    if (mudou.current) await gravar();
    if (!(await pedirVagaParaJogada({ teamId: destinoId, t, confirmar: ui.confirmar, router }))) return;
    const copia = await repoJogadas.copiar(meta.id, destinoId);
    const nome = destinos.find((d) => d.id === destinoId)?.name || '';
    ui.toast(t('tatica.copiadaPara', { escalao: nome }), 'ok');
    return copia;
  }

  async function copiarParaAqui() {
    if (!(await pedirVagaParaJogada({ teamId, t, confirmar: ui.confirmar, router }))) return;
    const copia = await repoJogadas.copiar(meta.id, teamId);
    if (!copia) return;
    ui.toast(t('tatica.copiadaAqui'), 'ok');
    router.replace(rotas.jogada(clubId, teamId, copia.id));
  }

  async function eliminar() {
    const ok = await ui.confirmar(t('tatica.apagarPergunta'), { okLabel: t('tatica.apagar') });
    if (!ok) return;
    if (meta.id) await repoJogadas.apagar(meta.id);
    mudou.current = false;
    router.push(rotas.quadroTatico(clubId, teamId));
  }

  const etiquetaEstado = { guardado: t('tatica.guardado'), porGuardar: t('tatica.porGuardar'), aGuardar: t('tatica.aGuardar') }[estado];
  const ativos = roster
    .filter((j) => j.isActive !== false)
    .sort((a, b) => (Number(a.shirtNumber) || 999) - (Number(b.shirtNumber) || 999));

  return (
    <>
      <PageHead
        title={meta.title || t('tatica.jogadaNova')}
        subtitle={soLeitura ? t(`tatica.categoria.${meta.category}`) : etiquetaEstado}
        backTo={rotas.quadroTatico(clubId, teamId)}
      />

      {doutroEscalao ? (
        <div className="card card--inset tbiblio">
          <p className="tbiblio__texto">{t('tatica.daBiblioteca')}</p>
          {soLeituraEscalao ? null : (
            <button type="button" className="btn btn--primary btn--tiny" onClick={copiarParaAqui}>
              {t('tatica.copiarParaAqui')}
            </button>
          )}
        </div>
      ) : null}

      {soLeitura ? null : (
        <div className="tmodo" role="tablist">
          <button
            type="button"
            role="tab"
            className={`tmodo__btn ${modo === 'editar' ? 'is-on' : ''}`}
            aria-selected={modo === 'editar'}
            onClick={() => setModo('editar')}
          >
            {t('tatica.modoEditar')}
          </button>
          <button
            type="button"
            role="tab"
            className={`tmodo__btn ${modo === 'ver' ? 'is-on' : ''}`}
            aria-selected={modo === 'ver'}
            onClick={() => {
              setSelecionada(null);
              setModo('ver');
            }}
          >
            {t('tatica.modoVer')}
          </button>
          <span className="toolbar__spacer" />
          <button type="button" className="btn btn--primary btn--tiny" onClick={partilhar}>
            {t('tatica.partilhar')}
          </button>
        </div>
      )}

      {soLeitura || modo === 'ver' ? (
        <div className="card teditor">
          <LeitorJogada data={data} titulo={meta.title} />
          {meta.description ? <p className="tdesc">{meta.description}</p> : null}
        </div>
      ) : (
        <div className="card teditor teditor--editar">
          <div className="tpaleta" role="toolbar" aria-label={t('tatica.pecas')}>
            <button type="button" className="tpaleta__btn" onClick={() => novaPeca(TIPO.JOGADOR, LADO.NOS)}>
              <i className="tbolinha tbolinha--nos" /> {t('tatica.peca.nos')}
            </button>
            <button type="button" className="tpaleta__btn" onClick={() => novaPeca(TIPO.GR, LADO.NOS)}>
              <i className="tbolinha tbolinha--gr-nos" /> {t('tatica.peca.grNos')}
            </button>
            <button type="button" className="tpaleta__btn" onClick={() => novaPeca(TIPO.JOGADOR, LADO.ELES)}>
              <i className="tbolinha tbolinha--eles" /> {t('tatica.peca.eles')}
            </button>
            <button type="button" className="tpaleta__btn" onClick={() => novaPeca(TIPO.GR, LADO.ELES)}>
              <i className="tbolinha tbolinha--gr-eles" /> {t('tatica.peca.grEles')}
            </button>
            {data.pecas.some((p) => p.tipo === TIPO.BOLA) ? null : (
              <button type="button" className="tpaleta__btn" onClick={() => novaPeca(TIPO.BOLA)}>
                <i className="tbolinha tbolinha--bola" /> {t('tatica.peca.bola')}
              </button>
            )}
            <button type="button" className="tpaleta__btn" onClick={() => novaPeca(TIPO.CONE)}>
              <i className="tbolinha tbolinha--cone" /> {t('tatica.peca.cone')}
            </button>
          </div>

          <CampoTatico
            data={data}
            posicoes={posicoes}
            anteriores={anteriores}
            selecionada={selecionada}
            onSelecionar={setSelecionada}
            onMover={(id, pos) => setArrasto({ id, pos })}
            onLargar={(id, pos) => {
              setArrasto(null);
              alterar((d) => moverPeca(d, f, id, pos));
            }}
          />

          <p className="muted thint">{f === 0 ? t('tatica.dicaInicio') : t('tatica.dicaFrame')}</p>

          {pecaSel ? (
            <PainelPeca
              peca={pecaSel}
              ativos={ativos}
              onMudar={(patch) => alterar((d) => mudarPeca(d, pecaSel.id, patch))}
              onTirar={() => {
                alterar((d) => tirarPeca(d, pecaSel.id));
                setSelecionada(null);
              }}
            />
          ) : null}

          <div className="tframes">
            <div className="tframes__fita" role="tablist" aria-label={t('tatica.frames')}>
              {data.frames.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === f}
                  className={`tframes__f ${i === f ? 'is-on' : ''}`}
                  onClick={() => setFrame(i)}
                >
                  {i + 1}
                </button>
              ))}
              <button type="button" className="tframes__f tframes__mais" onClick={novoFrame} aria-label={t('tatica.novoFrame')}>
                +
              </button>
            </div>
            <div className="tframes__opcoes">
              {f > 0 ? (
                <label className="tframes__dur">
                  <span className="muted">{t('tatica.duracaoFrame')}</span>
                  <select
                    className="input input--tiny"
                    value={data.frames[f].dur}
                    onChange={(e) => alterar((d) => mudarDuracao(d, f, Number(e.target.value)))}
                  >
                    {DURACOES.map((ms) => (
                      <option key={ms} value={ms}>
                        {(ms / 1000).toLocaleString()} s
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="muted">{t('tatica.framePartida')}</span>
              )}
              <span className="toolbar__spacer" />
              <button type="button" className="btn btn--soft btn--tiny" onClick={novoFrame}>
                {t('tatica.novoFrame')}
              </button>
              {data.frames.length > 1 ? (
                <button type="button" className="btn btn--ghost btn--tiny" onClick={eliminarFrame}>
                  {t('tatica.apagarFrame')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {soLeitura ? null : (
        <div className="card">
          <button type="button" className="tdetalhes__toggle" onClick={() => setVerDetalhes((v) => !v)}>
            {verDetalhes ? '▾' : '▸'} {t('tatica.detalhes')}
          </button>
          {verDetalhes || !meta.id ? (
            <div className="form tdetalhes">
              <div className="form__row">
                <Field label={t('tatica.nome')}>
                  <input
                    className="input"
                    maxLength={80}
                    value={meta.title}
                    onChange={(e) => alterarMeta({ title: e.target.value })}
                  />
                </Field>
                <Field label={t('tatica.categoriaLabel')}>
                  <select className="input" value={meta.category} onChange={(e) => alterarMeta({ category: e.target.value })}>
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c}>
                        {t(`tatica.categoria.${c}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="form__row">
                <Field label={t('tatica.campo')}>
                  <select className="input" value={data.campo} onChange={(e) => alterar((d) => ({ ...d, campo: e.target.value }))}>
                    <option value="meio">{t('tatica.campoMeio')}</option>
                    <option value="inteiro">{t('tatica.campoInteiro')}</option>
                  </select>
                </Field>
              </div>
              {clube ? (
                <div className="tclube">
                  <label className="tclube__partilha">
                    <input
                      type="checkbox"
                      checked={!!meta.sharedWithClub}
                      onChange={(e) => alterarMeta({ sharedWithClub: e.target.checked })}
                    />
                    <span>
                      <strong>{t('tatica.partilharClube')}</strong>
                      <small className="muted">{t('tatica.partilharClubeHint')}</small>
                    </span>
                  </label>
                  {destinos.length && meta.id ? (
                    <label className="tclube__copiar">
                      <span className="muted">{t('tatica.copiarPara')}</span>
                      <select
                        className="input input--tiny"
                        value=""
                        onChange={(e) => copiarPara(e.target.value)}
                      >
                        <option value="">{t('tatica.escolherEscalao')}</option>
                        {destinos.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : (
                <p className="muted small">{t('tatica.clubeSoLicenca')}</p>
              )}
              <Field label={t('tatica.descricao')}>
                <textarea
                  className="input tnotas"
                  rows={3}
                  maxLength={2000}
                  placeholder={t('tatica.descricaoExemplo')}
                  value={meta.description}
                  onChange={(e) => alterarMeta({ description: e.target.value })}
                />
              </Field>
            </div>
          ) : null}
        </div>
      )}

      {soLeitura ? null : (
        <div className="form__actions">
          <button className="btn btn--danger btn--ghost" type="button" onClick={eliminar}>
            {t('tatica.apagar')}
          </button>
        </div>
      )}
    </>
  );
}

function PainelPeca({ peca, ativos, onMudar, onTirar }) {
  const t = useT();
  const jogador = peca.tipo === TIPO.JOGADOR || peca.tipo === TIPO.GR;
  return (
    <div className="tpainel">
      <strong className="tpainel__titulo">
        {t(`tatica.tipo.${peca.tipo === TIPO.GR || peca.tipo === TIPO.JOGADOR ? `${peca.tipo}_${peca.lado}` : peca.tipo}`)}
      </strong>
      {jogador ? (
        <>
          <label className="tpainel__campo">
            <span className="muted">{t('tatica.numero')}</span>
            <input
              className="input input--tiny tpainel__num"
              type="number"
              min={0}
              max={99}
              value={peca.num ?? ''}
              onChange={(e) => onMudar({ num: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </label>
          {peca.lado === LADO.NOS && ativos.length ? (
            <label className="tpainel__campo">
              <span className="muted">{t('tatica.doPlantel')}</span>
              <select
                className="input input--tiny"
                value=""
                onChange={(e) => {
                  const j = ativos.find((x) => x.id === e.target.value);
                  if (j) onMudar({ num: j.shirtNumber ?? null, nome: j.name });
                }}
              >
                <option value="">{peca.nome || t('tatica.escolher')}</option>
                {ativos.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.shirtNumber != null ? `${j.shirtNumber} · ` : ''}
                    {j.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </>
      ) : null}
      <span className="toolbar__spacer" />
      <button type="button" className="btn btn--ghost btn--tiny" onClick={onTirar}>
        {t('tatica.tirarPeca')}
      </button>
    </div>
  );
}
