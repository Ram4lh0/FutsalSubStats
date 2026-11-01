'use client';

// Uma convocatória.
//
// Sem jogo escolhido (`?m=` vazio): escolhe-se um dos próximos jogos ou cria-se
// um ali mesmo — adversário, dia e hora, casa/fora, competição e pavilhão. O
// jogo nasce como no assistente de jogo novo e fica na lista de jogos.
//
// Com jogo: os dados do jogo em cima, a grelha dos convocados (dá para
// arrastar) e, por baixo, mandar para o grupo — texto para o WhatsApp ou PDF.
// O cinco inicial não se escolhe aqui: é na preparação, na hora do jogo.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TeamShell from '@/components/TeamShell.jsx';
import Pagina from '@/components/Pagina.jsx';
import PageHead from '@/components/PageHead.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import useSoLeitura from '@/lib/useSoLeitura.js';
import { rotas } from '@/lib/routes.js';
import { Empty, Field } from '@/components/bits.jsx';
import LinhaJogo, { porJogar } from '@/components/treino/LinhaJogo.jsx';
import { useUI } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import { matches, squad, events } from '@/lib/data/repository.js';
import * as sync from '@/lib/data/sync.js';
import { matchCreated } from '@/domain/actions.js';
import { LOCATION, maxSquadOf, timingOf } from '@/domain/constants.js';
import { positionLabel } from '@/lib/format.js';
import { canCreateMatch } from '@/lib/entitlements.js';
import useSelecaoArraste from '@/lib/selecaoArraste.js';
import { copiarTexto, linkWhatsApp, abrirFora } from '@/lib/partilha.js';
import { entregarFicheiro, nomeLimpo } from '@/lib/ficheiros.js';
import { linkDeCasa, linkLimpo, pavilhaoDeCasa, pdfConvocatoria, textoConvocatoria } from '@/lib/convocatoria.js';
import { useT } from '@/lib/i18n/index.js';

export default function CallupPage() {
  return (
    <Pagina>
      <Conteudo />
    </Pagina>
  );
}

function Conteudo() {
  const { clubId, teamId, matchId } = useRouteParams();
  return (
    <TeamShell clubId={clubId} teamId={teamId}>
      {(dados) =>
        matchId ? (
          <Convocatoria key={matchId} clubId={clubId} teamId={teamId} matchId={matchId} dados={dados} />
        ) : (
          <EscolherJogo clubId={clubId} teamId={teamId} dados={dados} />
        )
      }
    </TeamShell>
  );
}

/** `Date` local → valor de um `<input type="datetime-local">`. */
function paraInput(ts) {
  const d = new Date(ts);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function proximoSabado() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(15, 0, 0, 0);
  return d.getTime();
}

/* ----------------------------------------------------- escolher o jogo */

function EscolherJogo({ clubId, teamId, dados }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useUI();
  const { userId, user } = useAuth();
  const provas = dados.competitions || [];
  const [aGuardar, setAGuardar] = useState(false);
  const [v, setV] = useState(() => ({
    opponentName: '',
    scheduledAt: paraInput(proximoSabado()),
    homeOrAway: 'HOME',
    competitionId: provas.length === 1 ? provas[0].id : '',
    pavilhao: pavilhaoDeCasa(teamId),
    link: linkDeCasa(teamId),
  }));
  const campo = (k) => ({ value: v[k], onChange: (e) => setV((x) => ({ ...x, [k]: e.target.value })) });

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const proximos = dados.entries
    .filter((e) => porJogar(e) && (e.match.scheduledAt || 0) >= hoje.getTime())
    .sort((a, b) => a.match.scheduledAt - b.match.scheduledAt);

  const abrir = (id) => router.replace(rotas.convocatoria(clubId, teamId, id));

  function mudarLocal(homeOrAway) {
    // O pavilhão de casa entra sozinho num jogo em casa e sai num jogo fora.
    const casa = pavilhaoDeCasa(teamId);
    const linkCasa = linkDeCasa(teamId);
    setV((x) => ({
      ...x,
      homeOrAway,
      pavilhao: homeOrAway === 'HOME' ? x.pavilhao || casa : x.pavilhao === casa ? '' : x.pavilhao,
      link: homeOrAway === 'HOME' ? x.link || linkCasa : x.link === linkCasa ? '' : x.link,
    }));
  }

  async function criar(e) {
    e.preventDefault();
    if (aGuardar) return;
    if (!v.opponentName.trim()) return toast(t('conv.faltaAdversario'), 'error');
    if (provas.length && !v.competitionId) return toast(t('novo.escolhaCompeticao'), 'error');
    if (v.homeOrAway === 'AWAY' && !v.pavilhao.trim()) return toast(t('conv.faltaPavilhao'), 'error');
    if (v.link.trim() && !linkLimpo(v.link)) return toast(t('conv.linkInvalido'), 'error');
    setAGuardar(true);
    try {
      const permissao = await canCreateMatch();
      if (!permissao.allowed) {
        toast(permissao.reason === 'free_limit_reached' ? t('licencas.limiteJogos') : t('licencas.redeParaCriar'), 'error', 5200);
        return;
      }
      const prova = provas.find((c) => c.id === v.competitionId);
      const jogo = await matches.create(teamId, {
        opponentName: v.opponentName,
        competitionId: v.competitionId || null,
        timing: timingOf(prova || dados.team),
        homeOrAway: v.homeOrAway,
        scheduledAt: new Date(v.scheduledAt).getTime(),
        season: dados.club?.currentSeason || null,
        // Em casa, só fica no jogo um pavilhão diferente do de casa — assim
        // mudar o pavilhão de casa mais tarde chega aos jogos já criados.
        venue: v.homeOrAway === 'AWAY' || v.pavilhao.trim() !== pavilhaoDeCasa(teamId) ? v.pavilhao : null,
        venueUrl: v.homeOrAway === 'AWAY' || linkLimpo(v.link) !== linkDeCasa(teamId) ? linkLimpo(v.link) || null : null,
      });
      await events.append(
        matchCreated({
          matchId: jogo.id,
          currentPeriod: 0,
          timerStatus: 'STOPPED',
          timerStartedAt: null,
          elapsedMatchMs: 0,
          periodElapsedMs: 0,
          teamScore: 0,
          opponentScore: 0,
        })
      );
      sync.saveNow(userId, user?.email);
      toast(t('conv.jogoCriado'), 'ok');
      abrir(jogo.id);
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <>
      <PageHead title={t('conv.nova')} backTo={rotas.convocatorias(clubId, teamId)} />

      <section className="card tprox">
        <h2 className="section section--tight">{t('conv.escolherJogo')}</h2>
        <p className="muted">{t('conv.escolherJogoHint')}</p>
        {proximos.length ? (
          proximos.map((e) => <LinhaJogo key={e.match.id} entry={e} onAbrir={() => abrir(e.match.id)} />)
        ) : (
          <p className="muted">{t('conv.semProximos')}</p>
        )}
      </section>

      <section className="card">
        <h2 className="section section--tight">{t('conv.criarJogo')}</h2>
        <form className="form" onSubmit={criar}>
          <Field label={t('conv.adversario')}>
            <input className="input" maxLength={60} placeholder={t('conv.adversarioExemplo')} {...campo('opponentName')} />
          </Field>
          <div className="form__row">
            <Field label={t('prep.dataHora')}>
              <input className="input" type="datetime-local" required {...campo('scheduledAt')} />
            </Field>
            <Field label={t('prep.casaOuFora')}>
              <select className="input" value={v.homeOrAway} onChange={(e) => mudarLocal(e.target.value)}>
                <option value="HOME">{t('local.HOME')}</option>
                <option value="AWAY">{t('local.AWAY')}</option>
              </select>
            </Field>
          </div>
          <div className="form__row">
            {provas.length ? (
              <Field label={t('prep.competicao')}>
                <select className="input" {...campo('competitionId')}>
                  <option value="">{t('novo.escolherCompeticao')}</option>
                  {provas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field
              label={v.homeOrAway === 'AWAY' ? t('conv.pavilhaoFora') : t('conv.pavilhao')}
              hint={v.homeOrAway === 'HOME' && !pavilhaoDeCasa(teamId) ? t('conv.dicaCasa') : null}
            >
              <input className="input" maxLength={100} placeholder={t('treino.localExemplo')} {...campo('pavilhao')} />
            </Field>
          </div>
          <Field label={t('conv.linkPavilhao')} hint={t('conv.linkPavilhaoDica')}>
            <input className="input" type="url" inputMode="url" maxLength={500} placeholder="https://maps.app.goo.gl/…" {...campo('link')} />
          </Field>
          <div className="form__actions">
            <button type="submit" className="btn btn--primary" disabled={aGuardar}>
              {t('conv.criarESeguir')}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

/* --------------------------------------------------- uma convocatória */

function Convocatoria({ clubId, teamId, matchId, dados }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useUI();
  const { userId, user } = useAuth();
  const soLeituraEscalao = useSoLeitura(teamId);

  const entry = dados.entries.find((e) => e.match.id === matchId) || null;
  const match = entry?.match || null;
  const prova = (dados.competitions || []).find((c) => c.id === match?.competitionId) || null;
  const limite = maxSquadOf(prova);
  const ativos = useMemo(
    () =>
      (dados.roster || [])
        .filter((p) => p.isActive !== false)
        .sort((a, b) => (Number(a.shirtNumber) || 999) - (Number(b.shirtNumber) || 999)),
    [dados.roster]
  );

  const [linhas, setLinhas] = useState(null); // o que está gravado
  const [escolhidos, setEscolhidos] = useState(null); // o que está no ecrã
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let vivo = true;
    squad.listByMatch(matchId).then((rows) => {
      if (!vivo) return;
      setLinhas(rows);
      setEscolhidos((atual) => atual ?? rows.map((r) => r.playerId));
    });
    return () => {
      vivo = false;
    };
  }, [matchId, dados]);

  useEffect(() => {
    if (match && !info) {
      setInfo({
        opponentName: match.opponentName,
        scheduledAt: paraInput(match.scheduledAt || Date.now()),
        homeOrAway: match.homeOrAway || 'HOME',
        pavilhao: match.venue || '',
        link: match.venueUrl || '',
      });
    }
  }, [match, info]);

  const arraste = useSelecaoArraste({
    escolhidos: escolhidos || [],
    limite,
    aoMudar: setEscolhidos,
    aoLimite: () => toast(t('validacao.muitosConvocados', { n: limite }), 'error'),
  });

  const voltar = rotas.convocatorias(clubId, teamId);
  if (!match) {
    return (
      <>
        <PageHead title={t('conv.titulo')} backTo={voltar} />
        <Empty>{t('conv.jogoNaoExiste')}</Empty>
      </>
    );
  }
  if (!linhas || !escolhidos || !info) return <p className="muted">{t('comum.aCarregar')}</p>;

  const soLeitura = soLeituraEscalao || !porJogar(entry);
  const gravados = new Set(linhas.map((r) => r.playerId));
  const mudouLista = escolhidos.length !== gravados.size || escolhidos.some((id) => !gravados.has(id));
  const mudouInfo =
    info.opponentName.trim() !== match.opponentName ||
    new Date(info.scheduledAt).getTime() !== match.scheduledAt ||
    info.homeOrAway !== (match.homeOrAway || 'HOME') ||
    info.pavilhao.trim() !== (match.venue || '') ||
    linkLimpo(info.link) !== (match.venueUrl || '');
  const porGravar = mudouLista || mudouInfo;
  const casa = pavilhaoDeCasa(teamId);

  function alternar(id) {
    setEscolhidos((atual) => {
      if (atual.includes(id)) return atual.filter((x) => x !== id);
      if (limite != null && atual.length >= limite) {
        toast(t('validacao.muitosConvocados', { n: limite }), 'error');
        return atual;
      }
      return [...atual, id];
    });
  }

  async function guardar() {
    if (!info.opponentName.trim()) {
      toast(t('conv.faltaAdversario'), 'error');
      return false;
    }
    if (info.homeOrAway === 'AWAY' && !info.pavilhao.trim()) {
      toast(t('conv.faltaPavilhao'), 'error');
      return false;
    }
    if (info.link.trim() && !linkLimpo(info.link)) {
      toast(t('conv.linkInvalido'), 'error');
      return false;
    }
    if (mudouInfo) {
      await matches.update(match.id, {
        opponentName: info.opponentName.trim(),
        scheduledAt: new Date(info.scheduledAt).getTime(),
        homeOrAway: info.homeOrAway,
        venue: info.pavilhao.trim() || null,
        venueUrl: linkLimpo(info.link) || null,
      });
    }
    if (mudouLista) {
      // Quem já estava convocado guarda a posição do cinco inicial, se a tinha.
      const antes = new Map(linhas.map((r) => [r.playerId, r]));
      await squad.replace(
        match.id,
        ativos
          .filter((p) => escolhidos.includes(p.id))
          .map((p) => ({
            playerId: p.id,
            playerNameSnapshot: p.name,
            shirtNumberSnapshot: p.shirtNumber,
            preferredPosition: p.preferredPosition,
            initialPosition: antes.get(p.id)?.initialPosition || null,
            initialLocation: antes.get(p.id)?.initialLocation || LOCATION.BENCH,
          }))
      );
    }
    sync.saveNow(userId, user?.email);
    toast(t('conv.guardada'), 'ok');
    return true;
  }

  // O que vai para o grupo é sempre o que está gravado; com alterações por
  // gravar, grava-se primeiro.
  async function antesDeMandar() {
    // Fora, a convocatória não sai sem pavilhão: é para isso que serve.
    if (info.homeOrAway === 'AWAY' && !info.pavilhao.trim()) {
      toast(t('conv.faltaPavilhao'), 'error');
      return null;
    }
    if (porGravar && !soLeitura && !(await guardar())) return null;
    const rows = await squad.listByMatch(match.id);
    const m = (await matches.get(match.id)) || match;
    return { match: m, team: dados.team, club: dados.club, convocados: rows, competicao: prova?.name || null };
  }

  async function copiar() {
    const d = await antesDeMandar();
    if (!d) return;
    const ok = await copiarTexto(textoConvocatoria(d));
    toast(ok ? t('conv.copiado') : t('conv.naoCopiou'), ok ? 'ok' : 'error');
  }

  async function whatsapp() {
    const d = await antesDeMandar();
    if (d) abrirFora(linkWhatsApp(textoConvocatoria(d)));
  }

  async function pdf() {
    const d = await antesDeMandar();
    if (!d) return;
    const blob = await pdfConvocatoria(d);
    const nome = `${nomeLimpo(`convocatoria-${dados.team?.name || ''}-${d.match.opponentName}`)}.pdf`;
    await entregarFicheiro(blob, nome, 'application/pdf', { titulo: t('conv.tituloTexto') });
  }

  const campo = (k) => ({ value: info[k], disabled: soLeitura, onChange: (e) => setInfo((x) => ({ ...x, [k]: e.target.value })) });

  return (
    <>
      <PageHead
        title={`${match.homeOrAway === 'AWAY' ? '@' : 'vs'} ${match.opponentName}`}
        subtitle={t('conv.titulo')}
        backTo={voltar}
      />

      <section className="card">
        <div className="form">
          <div className="form__row">
            <Field label={t('conv.adversario')}>
              <input className="input" maxLength={60} {...campo('opponentName')} />
            </Field>
            <Field label={t('prep.dataHora')}>
              <input className="input" type="datetime-local" {...campo('scheduledAt')} />
            </Field>
          </div>
          <div className="form__row">
            <Field label={t('prep.casaOuFora')}>
              <select className="input" {...campo('homeOrAway')}>
                <option value="HOME">{t('local.HOME')}</option>
                <option value="AWAY">{t('local.AWAY')}</option>
              </select>
            </Field>
            <Field label={info.homeOrAway === 'AWAY' ? t('conv.pavilhaoFora') : t('conv.pavilhao')}>
              <input
                className="input"
                maxLength={100}
                placeholder={info.homeOrAway === 'HOME' && casa ? casa : t('treino.localExemplo')}
                {...campo('pavilhao')}
              />
            </Field>
          </div>
          <Field label={t('conv.linkPavilhao')} hint={t('conv.linkPavilhaoDica')}>
            <input className="input" type="url" inputMode="url" maxLength={500} placeholder="https://maps.app.goo.gl/…" {...campo('link')} />
          </Field>
          {prova ? <p className="muted conv__prova">{t('prep.competicao')}: {prova.name}</p> : null}
        </div>
      </section>

      <section className="card">
        <div className="tpresh">
          <h2 className="section section--tight">{t('conv.convocados')}</h2>
          <span className="toolbar__spacer" />
          {soLeitura ? null : (
            <>
              <button type="button" className="btn btn--ghost btn--tiny" onClick={() => setEscolhidos(ativos.slice(0, limite ?? ativos.length).map((p) => p.id))}>
                {t('conv.todos')}
              </button>
              <button type="button" className="btn btn--ghost btn--tiny" onClick={() => setEscolhidos([])}>
                {t('conv.nenhum')}
              </button>
            </>
          )}
          <span className={`counter ${limite != null && escolhidos.length >= limite ? 'is-full' : ''}`}>
            {escolhidos.length}/{limite ?? '∞'}
          </span>
        </div>
        {ativos.length ? (
          <div className="pickgrid conv__grelha" {...(soLeitura ? {} : arraste.grelha)}>
            {ativos.map((p) => (
              <button
                key={p.id}
                type="button"
                data-pick-id={p.id}
                disabled={soLeitura}
                className={`pick ${escolhidos.includes(p.id) ? 'is-on' : ''}`}
                onClick={() => {
                  if (!arraste.acabouDeArrastar()) alternar(p.id);
                }}
              >
                <span className="pick__num">{p.shirtNumber}</span>
                <span className="pick__name">{p.name}</span>
                <span className="pick__pos">{positionLabel(p.preferredPosition)}</span>
              </button>
            ))}
          </div>
        ) : (
          <Empty>{t('treino.semPlantel')}</Empty>
        )}
      </section>

      <div className="conv__acoes">
        {soLeitura ? null : (
          <button type="button" className="btn btn--primary" disabled={!porGravar} onClick={guardar}>
            {porGravar ? t('conv.guardar') : t('conv.gravada')}
          </button>
        )}
        <span className="toolbar__spacer" />
        <button type="button" className="btn btn--ghost" onClick={copiar} disabled={!escolhidos.length}>
          {t('conv.copiarTexto')}
        </button>
        <button type="button" className="btn btn--ghost" onClick={whatsapp} disabled={!escolhidos.length}>
          WhatsApp
        </button>
        <button type="button" className="btn btn--ghost" onClick={pdf} disabled={!escolhidos.length}>
          PDF
        </button>
      </div>

      {porJogar(entry) ? (
        <p className="muted conv__nota">
          {t('conv.faltaCinco')}{' '}
          <button type="button" className="btn btn--soft btn--tiny" onClick={() => router.push(rotas.jogoPreparar(match.id))}>
            {t('conv.prepararJogo')}
          </button>
        </p>
      ) : null}
    </>
  );
}
