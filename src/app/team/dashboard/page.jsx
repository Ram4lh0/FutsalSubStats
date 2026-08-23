'use client';

// O painel visual do escalão.
//
// A aba ao lado responde a tudo: catorze colunas, todos os jogadores, todos os
// números. E não responde a nada de relance — para saber se a rotação está
// equilibrada é preciso percorrer uma coluna com o dedo e comparar de cabeça.
//
// Isto é o contrário. Quatro perguntas, cada uma com uma resposta que se lê sem
// se ler: quem está a jogar pouco, quando é que a equipa marca e sofre, como
// tem andado, e como está a disciplina. Nada aqui é novo — são os mesmos
// eventos, com outra forma.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import { rotas, comOrigem } from '@/lib/routes.js';
import { Badge, Empty, StatCard, Ved } from '@/components/bits.jsx';
import DataTable from '@/components/DataTable.jsx';
import { useUI, Dialog } from '@/lib/ui.jsx';
import { BarrasH, ColunasEspelhadas, EscadaForma, FitaForma } from '@/components/stats/graficos.jsx';
import { CartaoTop } from '@/components/stats/Destaques.jsx';
import { ListaGolos } from '@/components/stats/CartaoGolos.jsx';
import {
  minutosPorJogador,
  golosPorFaixa,
  formaRecente,
  casaEFora,
  curvaDeForma,
  disciplina,
  tiposDeJogo,
  provasComJogos,
  filtrar,
  parteDosJogos,
  painelDoAtleta,
} from '@/domain/dashboard.js';
import { fmt } from '@/domain/clock.js';
import { MATCH_TIMING } from '@/domain/constants.js';
import { dayLabel } from '@/lib/format.js';
import { useT } from '@/lib/i18n/index.js';

export default function TeamDashboardPage() {
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
      {(dados) => <Painel {...dados} />}
    </TeamShell>
  );
}

/** Um bloco do painel: título e forma. Sem legendas por baixo do título. */
function Bloco({ titulo, children, className = '' }) {
  return (
    <section className={`card painelv__bloco ${className}`.trim()}>
      <h2 className="section section--tight">{titulo}</h2>
      {children}
    </section>
  );
}

/**
 * A barra de filtros.
 *
 * O tipo de jogo só aparece quando o escalão tem mesmo os dois — um escalão que
 * joga sempre cronometrado não tem nada a escolher, e uma escolha sem
 * alternativa é ruído.
 */
function Filtros({
  provas,
  escolhidas,
  aoTrocarProva,
  tipos,
  tipo,
  aoTrocarTipo,
  roster,
  atletaId,
  aoTrocarAtleta,
  aoExportarPdf,
}) {
  const t = useT();
  const jogadores = [...(roster || [])].sort(
    (a, b) => (a.number ?? a.shirtNumber ?? 999) - (b.number ?? b.shirtNumber ?? 999)
  );
  return (
    <div className="filtros">
      {jogadores.length ? (
        <div className="filtros__grupo">
          <span className="filtros__rotulo">{t('painelv.ambito')}</span>
          <select
            className="input filtros__select"
            value={atletaId || ''}
            onChange={(e) => aoTrocarAtleta(e.target.value)}
          >
            <option value="">{t('painelv.equipaToda')}</option>
            {jogadores.map((p) => (
              <option key={p.id || p.playerId} value={p.id || p.playerId}>
                {(p.number ?? p.shirtNumber) != null ? `${p.number ?? p.shirtNumber} ` : ''}
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {provas.length > 1 ? (
        <div className="filtros__grupo">
          <span className="filtros__rotulo">{t('painelv.competicao')}</span>
          <button
            type="button"
            className={`chip ${escolhidas.length === 0 ? 'is-on' : ''}`}
            onClick={() => aoTrocarProva(null)}
          >
            {t('painelv.todas')}
          </button>
          {provas.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip ${escolhidas.includes(p.id) ? 'is-on' : ''}`}
              onClick={() => aoTrocarProva(p.id)}
            >
              {p.shortName || p.name}
            </button>
          ))}
        </div>
      ) : null}

      {tipos.length > 1 ? (
        <div className="filtros__grupo">
          <span className="filtros__rotulo">{t('painelv.tipoDeJogo')}</span>
          {[
            [MATCH_TIMING.TIMED, t('painelv.cronometrado')],
            [MATCH_TIMING.UNTIMED, t('painelv.corrido')],
          ].map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              className={`chip ${tipo === valor ? 'is-on' : ''}`}
              onClick={() => aoTrocarTipo(tipo === valor ? null : valor)}
            >
              {texto}
            </button>
          ))}
        </div>
      ) : null}

      <div className="filtros__grupo filtros__grupo--acao no-print">
        <button type="button" className="btn btn--ghost btn--tiny" onClick={aoExportarPdf}>
          {t('painelv.exportarPdf')}
        </button>
      </div>
    </div>
  );
}

/**
 * Um lado do calendário: casa ou fora.
 *
 * O V/E/D encostado à esquerda e os golos numa coluna à direita, em vez de um
 * número grande ao centro com uma linha de texto por baixo. São quatro números
 * com pesos diferentes — o V/E/D é o resumo, os golos são o detalhe — e uma
 * hierarquia lê-se melhor lado a lado do que empilhada.
 *
 * A diferença leva cor porque é o único dos três que tem lado bom e lado mau.
 */
function CartaoLado({ etiqueta, lado }) {
  return (
    <div className="stat ladocard">
      <span className="stat__label">{etiqueta}</span>
      <div className="ladocard__linha">
        <Ved v={lado.v} e={lado.e} d={lado.d} />
        <ListaGolos marcados={lado.golosA} sofridos={lado.golosContra} />
      </div>
    </div>
  );
}

function useFormaMobile() {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 560px) and (orientation: portrait)');
    const atualizar = () => setMobile(mq.matches);
    atualizar();
    mq.addEventListener?.('change', atualizar);
    return () => mq.removeEventListener?.('change', atualizar);
  }, []);

  return mobile;
}

function fmtAssinado(ms) {
  const sinal = ms > 0 ? '+' : ms < 0 ? '-' : '';
  return `${sinal}${fmt(Math.abs(ms))}`;
}

function estadoAtletaJogo(j, t) {
  if (!j.convocado) return { texto: t('painelv.naoConvocado'), kind: 'muted' };
  if (!j.utilizado) return { texto: t('painelv.naoUtilizado'), kind: 'warn' };
  if (j.titular) return { texto: t('painelv.titular'), kind: 'live' };
  return { texto: t('painelv.entrou'), kind: 'info' };
}

function PainelAtleta({ dados, etiquetas, faixaAtiva, setFaixaAtiva, abrirResumo }) {
  const t = useT();
  const min = dados.minutos;
  const u = dados.utilizacao;
  const imp = dados.impacto;
  const disc = dados.disciplina;
  const guardaRedes = dados.guardaRedes;

  function detalheDaFaixa(parte, lista) {
    if (faixaAtiva.parte !== parte || faixaAtiva.i == null) return null;
    const f = lista[faixaAtiva.i];
    if (!f) return null;
    return (
      <p className="painelv__detalhe">
        <strong>
          {Math.round(f.deMs / 60_000)}′–{Math.round(f.ateMs / 60_000)}′
        </strong>
        {' · '}        {guardaRedes ? (
          <span className="painelv__detalhe--s">
            {t('painelv.mediaSofridosBalizaAtleta', { n: f.mediaSofridosBaliza.toFixed(2) })}
          </span>
        ) : (
          <>
            <span className="painelv__detalhe--m">
              {t('painelv.mediaGolosAtleta', { n: f.mediaGolos.toFixed(2) })}
            </span>
            {' · '}
            <span className="painelv__detalhe--a">
              {t('painelv.mediaAssistenciasAtleta', { n: f.mediaAssistencias.toFixed(2) })}
            </span>
          </>
        )}
      </p>
    );
  }

  return (
    <>
      <Bloco titulo={t('painelv.atletaMinutos', { nome: dados.jogador.name })} className="painelv__bloco--minutos-atleta">
        <div className="grid grid--stats painelv__metricas-atleta">
          <StatCard label={t('stats.tempoTotal')} value={fmt(min.totalMs)} />
          <StatCard label={t('painelv.mediaAtleta')} value={fmt(min.mediaJogadorMs)} />
          <StatCard label={t('painelv.mediaEquipa')} value={fmt(min.mediaEquipaMs)} />
          <StatCard
            label={t('painelv.diferencaMedia')}
            value={fmtAssinado(min.diferencaMs)}
            kind={min.diferencaMs < 0 ? 'loss' : min.diferencaMs > 0 ? 'win' : undefined}
          />
        </div>
        <BarrasH
          linhas={[
            {
              rotulo: dados.jogador.name,
              valor: min.mediaJogadorMs,
              texto: fmt(min.mediaJogadorMs),
              alerta: min.abaixo,
            },
            {
              rotulo: t('painelv.mediaEquipa'),
              valor: min.mediaEquipaMs,
              texto: fmt(min.mediaEquipaMs),
            },
          ]}
        />
      </Bloco>

      <Bloco titulo={t('painelv.utilizacao')} className="painelv__bloco--utilizacao-atleta">
        <div className="grid grid--stats">
          <StatCard label={t('painelv.convocado')} value={u.convocado} hint={t('painelv.emJogos', { n: u.jogos })} />
          <StatCard label={t('painelv.utilizado')} value={u.utilizado} hint={`${u.percentagemUtilizacao}%`} />
          <StatCard label={t('painelv.titular')} value={u.titular} />
          <StatCard label={t('painelv.entrouBanco')} value={u.banco} />
          <StatCard label={t('painelv.entradas')} value={u.entradas} />
          <StatCard label={t('painelv.mediaEntrada')} value={fmt(u.mediaEntradaMs)} />
        </div>
      </Bloco>

      <Bloco titulo={t('painelv.impacto')} className="painelv__bloco--impacto-atleta">
        <div className="grid grid--stats painelv__impacto-atleta">
          <StatCard label={t('stats.golos')} value={imp.golos} />
          <StatCard label={t('stats.assistencias')} value={imp.assistencias} />
          <StatCard label={t('painelv.golosEquipaEmCampo')} value={imp.golosEquipa} />
          <StatCard label={t('painelv.sofridosEquipaEmCampo')} value={imp.sofridosEquipa} />
          <StatCard
            label={t('painelv.saldoComAtleta')}
            value={imp.saldo > 0 ? `+${imp.saldo}` : imp.saldo}
            kind={imp.saldo > 0 ? 'win' : imp.saldo < 0 ? 'loss' : undefined}
          />
          {guardaRedes ? <StatCard label={t('painelv.sofridosBaliza')} value={imp.sofridosBaliza} /> : null}
        </div>
      </Bloco>

      <Bloco titulo={t(guardaRedes ? 'painelv.sofridosBalizaPeriodo' : 'painelv.golosAssistenciasPeriodo')} className="painelv__bloco--periodos-atleta">
        {dados.periodos.comDados ? (
          <div className="painelv__partes">
            <div>
              <h3 className="painelv__parte">{t('painelv.primeiraParte')}</h3>
              <ColunasEspelhadas
                faixas={dados.periodos.primeira}
                etiquetas={etiquetas}
                chaveA={guardaRedes ? 'sofridosBaliza' : 'golos'}
                chaveB={guardaRedes ? null : 'assistencias'}
                classeA={guardaRedes ? 'sofridos' : 'marcados'}
                classeB="assistencias"
                escolhida={faixaAtiva.parte === 1 ? faixaAtiva.i : null}
                aoEscolher={(i) => setFaixaAtiva({ parte: 1, i })}
              />
              {detalheDaFaixa(1, dados.periodos.primeira)}
            </div>
            <div>
              <h3 className="painelv__parte">{t('painelv.segundaParte')}</h3>
              <ColunasEspelhadas
                faixas={dados.periodos.segunda}
                etiquetas={etiquetas}
                chaveA={guardaRedes ? 'sofridosBaliza' : 'golos'}
                chaveB={guardaRedes ? null : 'assistencias'}
                classeA={guardaRedes ? 'sofridos' : 'marcados'}
                classeB="assistencias"
                escolhida={faixaAtiva.parte === 2 ? faixaAtiva.i : null}
                aoEscolher={(i) => setFaixaAtiva({ parte: 2, i })}
              />
              {detalheDaFaixa(2, dados.periodos.segunda)}
            </div>
            <p className="legenda">
              {guardaRedes ? (
                <>
                  <span className="legenda__cor legenda__cor--sofridos" /> {t('painelv.sofridosBaliza')}
                </>
              ) : (
                <>
                  <span className="legenda__cor legenda__cor--marcados" /> {t('stats.golos')}
                  <span className="legenda__cor legenda__cor--assistencias" /> {t('stats.assistencias')}
                </>
              )}
            </p>
          </div>
        ) : (
          <p className="muted">{t(guardaRedes ? 'painelv.semSofridosBaliza' : 'painelv.semGolosAtleta')}</p>
        )}
      </Bloco>

      <Bloco titulo={t('painelv.ultimosJogosAtleta')} className="painelv__bloco--ultimos-atleta">
        {dados.ultimos.length ? (
          <DataTable tight className="tablewrap--nofreeze">
            <thead>
              <tr>
                <th>{t('lista.data')}</th>
                <th>{t('nome.adversario')}</th>
                <th>{t('lista.resultado')}</th>
                <th>{t('lista.estado')}</th>
                <th className="num">{t('stats.tempoTotal')}</th>
                <th className="num">{t('stats.golos')}</th>
                <th className="num">{t('stats.assistencias')}</th>
                <th className="num">{t('stats.faltas')}</th>
              </tr>
            </thead>
            <tbody>
              {dados.ultimos.map((j) => {
                const estado = estadoAtletaJogo(j, t);
                return (
                  <tr key={j.matchId} className="is-clickable" onClick={() => abrirResumo(j.matchId)}>
                    <td className="mono">{dayLabel(j.quando)}</td>
                    <td>{j.adversario}</td>
                    <td className="mono">{j.nossos}–{j.deles}</td>
                    <td><Badge kind={estado.kind}>{estado.texto}</Badge></td>
                    <td className="num mono">{fmt(j.minutosMs)}</td>
                    <td className="num mono">{j.golos}</td>
                    <td className="num mono">{j.assistencias}</td>
                    <td className="num mono">{j.faltas}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        ) : (
          <p className="muted">{t('painelv.semJogos')}</p>
        )}
      </Bloco>

      <Bloco titulo={t('painelv.disciplina')} className="painelv__bloco--disciplina-atleta">
        {disc.jogos ? (
          <div className="grid grid--stats">
            <StatCard label={t('painelv.faltasFeitas')} value={disc.faltas} hint={disc.faltasPorJogo.toFixed(1)} />
            <StatCard label={t('painelv.faltasSofridas')} value={disc.sofridas} hint={disc.sofridasPorJogo.toFixed(1)} />
            <StatCard label={t('stats.amarelos')} value={disc.amarelos} kind={disc.amarelos ? 'draw' : undefined} />
            <StatCard label={t('stats.vermelhos')} value={disc.vermelhos} kind={disc.vermelhos ? 'loss' : undefined} />
          </div>
        ) : (
          <p className="muted">{t('painelv.semFaltasAtleta')}</p>
        )}
      </Bloco>
    </>
  );
}

function Painel({ club, team, entries, roster, competitions }) {
  const t = useT();
  const ui = useUI();
  const router = useRouter();
  const [provasEscolhidas, setProvas] = useState([]);
  const [tipo, setTipo] = useState(null);
  const [atletaId, setAtletaId] = useState('');
  const formaMobile = useFormaMobile();
  // A faixa por cima da qual está o dedo, uma por parte.
  const [faixaAtiva, setFaixaAtiva] = useState({ parte: null, i: null });

  const provas = useMemo(() => provasComJogos(entries, competitions), [entries, competitions]);
  const tipos = useMemo(() => tiposDeJogo(entries), [entries]);

  const filtrados = useMemo(
    () => filtrar(entries, { provas: provasEscolhidas, tipo }),
    [entries, provasEscolhidas, tipo]
  );

  const min = useMemo(() => minutosPorJogador(filtrados, roster), [filtrados, roster]);
  const limiteForma = formaMobile ? 5 : 8;
  const forma = useMemo(() => formaRecente(filtrados, { quantos: limiteForma }), [filtrados, limiteForma]);
  const curva = useMemo(() => curvaDeForma(filtrados, { quantos: limiteForma }), [filtrados, limiteForma]);
  const lados = useMemo(() => casaEFora(filtrados), [filtrados]);
  const disc = useMemo(() => disciplina(filtrados), [filtrados]);
  const parteMs = useMemo(() => parteDosJogos(filtrados, tipo), [filtrados, tipo]);
  const faixas = useMemo(() => golosPorFaixa(filtrados, { parteMs }), [filtrados, parteMs]);
  const atleta = useMemo(
    () => painelDoAtleta(filtrados, roster, atletaId, { parteMs, quantos: 5 }),
    [filtrados, roster, atletaId, parteMs]
  );

  function trocarProva(id) {
    // `null` é o "todas": limpa a escolha em vez de a acumular.
    if (id === null) return setProvas([]);
    setProvas((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]
    );
  }

  const etiquetasBase = atleta?.periodos?.primeira || faixas.primeira;
  const etiquetas = etiquetasBase.map((f) => `${Math.round(f.deMs / 60_000)}'`);
  const voltarAoPainel = club?.id && team?.id ? rotas.painelEscalao(club.id, team.id) : null;
  const abrirResumo = (id) =>
    router.push(
      voltarAoPainel
        ? comOrigem(rotas.jogoResumo(id), { atras: voltarAoPainel })
        : rotas.jogoResumo(id)
    );

  function exportarPdf() {
    window.print();
  }

  /** A tabela de faltas e cartões por jogador, numa janela. */
  function verTabela() {
    ui.open((close) => (
      <Dialog title={t('painelv.tabelaFaltas')} onClose={() => close(null)} wide>
        {disc.jogadores.length ? (
          <DataTable players>
            <thead>
              <tr>
                <th>{t('stats.numero')}</th>
                <th>{t('stats.jogador')}</th>
                <th className="num">{t('painelv.faltasFeitas')}</th>
                <th className="num">{t('painelv.faltasSofridas')}</th>
                <th className="num is-yellow">{t('stats.amarelos')}</th>
                <th className="num is-red">{t('stats.vermelhos')}</th>
              </tr>
            </thead>
            <tbody>
              {disc.jogadores.map((j) => (
                <tr key={j.playerId}>
                  <td className="num mono">{j.number}</td>
                  <td>{j.name}</td>
                  <td className="num mono">{j.faltas}</td>
                  <td className="num mono">{j.sofridas}</td>
                  <td className="num mono">{j.amarelos}</td>
                  <td className="num mono">{j.vermelhos}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <p className="muted">{t('stats.semDados')}</p>
        )}
        {!disc.comAutor ? <p className="muted small">{t('painelv.semAutor')}</p> : null}
        <footer className="modal__actions">
          <button className="btn btn--ghost" onClick={() => close(null)}>
            {t('comum.fechar')}
          </button>
        </footer>
      </Dialog>
    ));
  }

  /** A frase que aparece quando o dedo está por cima de uma faixa. */
  function detalheDaFaixa(parte, lista) {
    if (faixaAtiva.parte !== parte || faixaAtiva.i == null) return null;
    const f = lista[faixaAtiva.i];
    if (!f) return null;
    return (
      <p className="painelv__detalhe">
        <strong>
          {Math.round(f.deMs / 60_000)}′–{Math.round(f.ateMs / 60_000)}′
        </strong>
        {' · '}
        <span className="painelv__detalhe--m">
          {t('painelv.mediaMarcados', { n: f.mediaMarcados.toFixed(2) })}
        </span>
        {' · '}
        <span className="painelv__detalhe--s">
          {t('painelv.mediaSofridos', { n: f.mediaSofridos.toFixed(2) })}
        </span>
        {' · '}
        <span className="muted">{t('painelv.emJogos', { n: f.jogos })}</span>
      </p>
    );
  }

  const semJogos = !forma.length && !min.linhas.length;

  return (
    <div className={`painelv ${atletaId ? 'painelv--atleta' : ''}`.trim()}>
      <div className="painelv__filtros">
        <Filtros
          provas={provas}
          escolhidas={provasEscolhidas}
          aoTrocarProva={trocarProva}
          tipos={tipos}
          tipo={tipo}
          aoTrocarTipo={setTipo}
          roster={roster}
          atletaId={atletaId}
          aoTrocarAtleta={setAtletaId}
          aoExportarPdf={exportarPdf}
        />
      </div>

      {atletaId ? (
        atleta ? (
          <PainelAtleta
            dados={atleta}
            etiquetas={etiquetas}
            faixaAtiva={faixaAtiva}
            setFaixaAtiva={setFaixaAtiva}
            abrirResumo={abrirResumo}
          />
        ) : (
          <Empty>{t('painelv.atletaSemDados')}</Empty>
        )
      ) : semJogos ? (
        <Empty>{t('painelv.semJogos')}</Empty>
      ) : (
        <>
          {/* ------------------------------------------ rotação e minutos */}
          <Bloco titulo={t('painelv.minutos')}>
            {min.linhas.length ? (
              <>
                <BarrasH
                  linhas={min.linhas.map((l) => ({
                    rotulo: `${l.number} ${l.name}`,
                    valor: l.ms,
                    texto: fmt(l.ms),
                    alerta: l.abaixo,
                  }))}
                  referencia={min.media}
                  rotuloReferencia={t('painelv.media')}
                />
                {min.linhas.some((l) => l.abaixo) ? (
                  <p className="painelv__aviso">
                    {t('painelv.aBaixoDaMedia', {
                      nomes: min.linhas
                        .filter((l) => l.abaixo)
                        .map((l) => l.name)
                        .join(', '),
                    })}
                  </p>
                ) : (
                  <p className="muted small">{t('painelv.rotacaoEquilibrada')}</p>
                )}
              </>
            ) : (
              <p className="muted">{t('stats.semDados')}</p>
            )}
          </Bloco>

          {/* -------------------------------------------- golos por período */}
          <Bloco titulo={t('painelv.quando')}>
            {faixas.comDados ? (
              <div className="painelv__partes">
                <div>
                  <h3 className="painelv__parte">{t('painelv.primeiraParte')}</h3>
                  <ColunasEspelhadas
                    faixas={faixas.primeira}
                    etiquetas={etiquetas}
                    escolhida={faixaAtiva.parte === 1 ? faixaAtiva.i : null}
                    aoEscolher={(i) => setFaixaAtiva({ parte: 1, i })}
                  />
                  {detalheDaFaixa(1, faixas.primeira)}
                </div>
                <div>
                  <h3 className="painelv__parte">{t('painelv.segundaParte')}</h3>
                  <ColunasEspelhadas
                    faixas={faixas.segunda}
                    etiquetas={etiquetas}
                    escolhida={faixaAtiva.parte === 2 ? faixaAtiva.i : null}
                    aoEscolher={(i) => setFaixaAtiva({ parte: 2, i })}
                  />
                  {detalheDaFaixa(2, faixas.segunda)}
                </div>
                <p className="legenda">
                  <span className="legenda__cor legenda__cor--marcados" /> {t('painelv.marcados')}
                  <span className="legenda__cor legenda__cor--sofridos" /> {t('painelv.sofridos')}
                </p>
              </div>
            ) : (
              <p className="muted">{t('painelv.semGolos')}</p>
            )}
          </Bloco>

          {/* ------------------------------------------ forma e resultados */}
          <Bloco titulo={t('painelv.forma')}>
            {forma.length ? (
              <>
                <FitaForma jogos={forma} onAbrir={abrirResumo} />
                {curva.pontos.length > 1 ? <EscadaForma pontos={curva.pontos} /> : null}
                <div className="grid grid--stats painelv__lados">
                  <CartaoLado etiqueta={t('painelv.emCasa')} lado={lados.casa} />
                  <CartaoLado etiqueta={t('painelv.foraDeCasa')} lado={lados.fora} />
                </div>
              </>
            ) : (
              <p className="muted">{t('painelv.semJogos')}</p>
            )}
          </Bloco>

          {/* ---------------------------------------- disciplina e faltas */}
          <Bloco titulo={t('painelv.disciplina')}>
            {disc.jogos ? (
              <>
                <div className="grid grid--stats painelv__disciplina-resumo">
                  <StatCard
                    label={t('painelv.faltasPorJogo')}
                    value={disc.mediaPorJogo.toFixed(1)}
                    hint={t('painelv.emJogos', { n: disc.jogos })}
                  />
                  <StatCard
                    label={t('painelv.sofridasPorJogo')}
                    value={disc.mediaSofridasPorJogo.toFixed(1)}
                    hint={t('painelv.emJogos', { n: disc.jogos })}
                  />
                  <StatCard
                    label={t('painelv.partesComCinco')}
                    value={`${disc.percentagemNoLimite}%`}
                    hint={t('painelv.vezesEmPartes', { n: disc.noLimite, total: disc.partes })}
                    kind={disc.percentagemNoLimite >= 50 ? 'loss' : undefined}
                  />
                </div>

                {/* Os três primeiros de cada coluna, com o `+` para a lista
                    toda. É o mesmo cartão dos tops das Estatísticas: aqui a
                    pergunta é outra mas a forma da resposta é a mesma, e vale
                    mais reconhecê-la do que inventar outra. */}
                <div className="painelv__tops">
                  <CartaoTop
                    etiqueta="painelv.maisFaltas"
                    chave="faltas"
                    linhas={disc.jogadores}
                  />
                  <CartaoTop
                    etiqueta="painelv.maisAmarelos"
                    cor="amarelo"
                    chave="amarelos"
                    linhas={disc.jogadores}
                  />
                  <CartaoTop
                    etiqueta="painelv.maisVermelhos"
                    cor="vermelho"
                    chave="vermelhos"
                    linhas={disc.jogadores}
                  />
                  {/* As sofridas fecham a linha. É a única das quatro que não é
                      um reparo: quem sofre muitas faltas costuma ser quem leva
                      a bola para a frente. */}
                  <CartaoTop
                    etiqueta="painelv.maisSofridas"
                    chave="sofridas"
                    linhas={disc.jogadores}
                  />
                </div>

                {/* A repartição por jogador vive atrás de um botão.
                    Aberta, eram catorze nomes com quatro números cada — a
                    ocupar mais ecrã do que os três cartões que dizem o
                    essencial, e a empurrar o resto do painel para baixo. É uma
                    coisa que se vai lá ver de vez em quando, não a toda a hora.

                    E é tabela e não gráfico: são quatro colunas diferentes por
                    pessoa (feitas, sofridas, amarelos, vermelhos) e nenhuma
                    tem escala comum com as outras — quatro gráficos ao lado uns
                    dos outros diziam menos do que uma tabela. */}
                <div className="form__actions form__actions--left">
                  <button className="btn btn--ghost" onClick={() => verTabela()}>
                    {t('painelv.tabelaFaltas')}
                  </button>
                </div>
                {!disc.comAutor ? <p className="muted small">{t('painelv.semAutor')}</p> : null}
              </>
            ) : (
              <p className="muted">{t('painelv.semFaltas')}</p>
            )}
          </Bloco>
        </>
      )}
    </div>
  );
}
