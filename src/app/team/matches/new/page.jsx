'use client';

// Assistente de criação de jogo, em quatro etapas (secção 4.6).

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pagina from '@/components/Pagina.jsx';
import useRouteParams from '@/lib/useRouteParams.js';
import PageHead from '@/components/PageHead.jsx';
import CourtPicker, { countFilled } from '@/components/CourtPicker.jsx';
import { Empty, Field } from '@/components/bits.jsx';
import { useUI, Dialog } from '@/lib/ui.jsx';
import { useAuth } from '@/lib/auth.jsx';
import { confirmarPoucosConvocados } from '@/lib/squad.js';
import { clubs, teams, competitions, players, matches, squad, events } from '@/lib/data/repository.js';
import * as sync from '@/lib/data/sync.js';
import { matchCreated } from '@/domain/actions.js';
import { validateMatchInfo, validateSquadSelection, validateLineup } from '@/domain/validation.js';
import {
  LOCATION,
  MATCH_TIMING,
  maxSquadOf,
  timingOf,
  timingConfig,
} from '@/domain/constants.js';
import {
  dateLabel,
  positionLabel,
  mensagemErro,
  homeAwayLabel,
  timingLabel,
} from '@/lib/format.js';
import { rotas } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';
import { canCreateMatch } from '@/lib/entitlements.js';
import LicenseLimitDialog from '@/components/LicenseLimitDialog.jsx';

// As etapas são chaves, não frases: o nome de cada uma muda com o idioma.
const ETAPAS = ['novo.etapaInfo', 'novo.etapaConvocados', 'novo.etapaCinco', 'novo.etapaConfirmacao'];

export default function NovoJogoPage() {
  return (
    <Pagina>
      <Assistente />
    </Pagina>
  );
}

function Assistente() {
  const t = useT();
  const { clubId, teamId } = useRouteParams();
  const router = useRouter();
  const ui = useUI();
  const { toast, confirmar } = ui;
  const { userId, user } = useAuth();

  const [club, setClub] = useState(null);
  const [team, setTeam] = useState(null);
  const [provas, setProvas] = useState([]);
  const [roster, setRoster] = useState(null);
  const [etapa, setEtapa] = useState(0);
  const [aGuardar, setAGuardar] = useState(false);
  const [info, setInfo] = useState({
    opponentName: '',
    opponentShortName: '',
    competitionId: '',
    timing: '',
    scheduledAt: dataHoraPorOmissao(),
    homeOrAway: 'HOME',
    notes: '',
  });
  const [escolhidos, setEscolhidos] = useState([]);
  const [lineup, setLineup] = useState({});
  const [procura, setProcura] = useState('');

  useEffect(() => {
    (async () => {
      const t = await teams.get(teamId);
      setTeam(t);
      setClub(await clubs.get(clubId));
      const lista = await competitions.listByTeam(teamId);
      setProvas(lista);
      const inicial = lista.length === 1 ? lista[0] : null;
      setInfo((i) => ({
        ...i,
        timing: timingOf(inicial || t),
        competitionId: i.competitionId || inicial?.id || '',
      }));
      setRoster((await players.listByTeam(teamId)).filter((p) => p.isActive));
    })();
  }, [clubId, teamId]);

  const candidatos = useMemo(
    () =>
      (roster || [])
        .filter((p) => escolhidos.includes(p.id))
        .map((p) => ({
          playerId: p.id,
          name: p.name,
          number: p.shirtNumber,
          preferredPosition: p.preferredPosition,
        })),
    [roster, escolhidos]
  );
  const provaEscolhida = provas.find((c) => c.id === info.competitionId) || null;
  const limiteConvocados = maxSquadOf(provaEscolhida);

  if (!roster) return <p className="muted">A carregar…</p>;

  if (!roster.length) {
    return (
      <>
        <PageHead title="Novo jogo" backTo={rotas.escalao(clubId, teamId)} />
        <Empty
          action={
            <button
              className="btn btn--primary"
              onClick={() => router.push(rotas.jogadorNovo(clubId, teamId))}
            >
              Criar jogador
            </button>
          }
        >
          Não existem jogadores ativos. Crie o plantel antes de marcar um jogo.
        </Empty>
      </>
    );
  }

  // Todo o jogo pertence a uma prova — é o que permite ver as estatísticas do
  // campeonato separadas das dos particulares. Sem nenhuma criada não há por
  // onde começar, e mais vale dizê-lo já do que na quarta etapa.
  if (!provas.length) {
    return (
      <>
        <PageHead
          title="Novo jogo"
          subtitle={team?.name}
          backTo={rotas.escalao(clubId, teamId)}
        />
        <Empty
          action={
            <button className="btn btn--primary" onClick={criarProva}>
              Criar competição
            </button>
          }
        >
          Este escalão ainda não tem competições. Todo o jogo pertence a uma — campeonato, taça ou
          particulares — para as estatísticas de cada prova ficarem separadas. Crie aqui a primeira e
          continue.
        </Empty>
      </>
    );
  }

  /**
   * Criar uma prova sem sair daqui.
   *
   * Quem está a marcar um jogo contra uma equipa nova descobre a meio que a
   * prova ainda não existe. Mandá-lo à aba das Competições era perder o
   * adversário, a data e o local já escritos — e voltar a começar. Aqui a prova
   * nasce numa janela e fica logo escolhida.
   *
   * A janela recolhe também as regras que todos os jogos da prova herdam.
   */
  async function criarProva() {
    const dados = await ui.open((close) => (
      <NovaProva defaultTiming={timingOf(team)} onClose={close} />
    ));
    if (!dados) return;
    const prova = await competitions.create(teamId, dados);
    sync.saveNow(userId, user?.email);
    setProvas((lista) => [...lista, prova].sort((a, b) => a.name.localeCompare(b.name, 'pt')));
    setInfo((i) => ({ ...i, competitionId: prova.id, timing: timingOf(prova) }));
    toast(t('novo.provaCriada', { nome: prova.name }), 'ok');
  }

  const campo = (k) => ({
    value: info[k],
    onChange: (e) => setInfo((i) => ({ ...i, [k]: e.target.value })),
  });

  function alternarConvocado(id) {
    setEscolhidos((atual) => {
      if (atual.includes(id)) {
        // Retira do cinco inicial se foi desconvocado.
        setLineup((l) => {
          const proximo = { ...l };
          for (const [pos, pid] of Object.entries(proximo)) if (pid === id) delete proximo[pos];
          return proximo;
        });
        return atual.filter((x) => x !== id);
      }
      if (limiteConvocados != null && atual.length >= limiteConvocados) {
        toast(t('validacao.muitosConvocados', { n: limiteConvocados }), 'error');
        return atual;
      }
      return [...atual, id];
    });
  }

  async function guardar(abrir) {
    if (aGuardar) return;
    setAGuardar(true);
    try {
      const permissao = await canCreateMatch();
      if (!permissao.allowed) {
        toast(
          permissao.reason === 'free_limit_reached'
            ? t('licencas.limiteJogos')
            : t('licencas.redeParaCriar'),
          'error',
          5200
        );
        if (permissao.reason === 'free_limit_reached') {
          const abrir = await ui.open((close) => <LicenseLimitDialog close={close} />);
          if (abrir) router.push(`${rotas.conta()}#licencas`);
        }
        return;
      }
      const jogo = await matches.create(teamId, {
        opponentName: info.opponentName,
        opponentShortName: info.opponentShortName,
        competitionId: info.competitionId,
        timing: info.timing,
        homeOrAway: info.homeOrAway,
        scheduledAt: new Date(info.scheduledAt).getTime(),
        season: club?.currentSeason || null,
        notes: info.notes,
      });

      const inverso = {};
      for (const [pos, pid] of Object.entries(lineup)) if (pid) inverso[pid] = pos;

      await squad.replace(
        jogo.id,
        roster
          .filter((p) => escolhidos.includes(p.id))
          .map((p) => ({
            playerId: p.id,
            playerNameSnapshot: p.name,
            shirtNumberSnapshot: p.shirtNumber,
            preferredPosition: p.preferredPosition,
            initialPosition: inverso[p.id] || null,
            initialLocation: inverso[p.id] ? LOCATION.COURT : LOCATION.BENCH,
          }))
      );

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
      toast(t('novo.criado'), 'ok');
      router.push(abrir ? rotas.jogoPreparar(jogo.id) : rotas.jogos(clubId, teamId));
    } catch (err) {
      toast(t('novo.naoCriou', { erro: err.message }), 'error');
    } finally {
      setAGuardar(false);
    }
  }

  const nav = (voltarLabel, seguinteLabel, aoSeguinte) => (
    <div className="wizard__nav">
      <button
        className="btn btn--ghost"
        type="button"
        onClick={() => (etapa === 0 ? router.push(rotas.jogos(clubId, teamId)) : setEtapa(etapa - 1))}
      >
        {voltarLabel}
      </button>
      <button className="btn btn--primary" type="button" onClick={aoSeguinte}>
        {seguinteLabel}
      </button>
    </div>
  );

  return (
    <>
      <PageHead title="Novo jogo" subtitle={[club?.name, team?.name].filter(Boolean).join(" · ")} backTo={rotas.jogos(clubId, teamId)} />

      <ol className="stepper">
        {ETAPAS.map((chave, i) => (
          <li
            key={chave}
            className={`stepper__item ${i === etapa ? 'is-active' : ''} ${i < etapa ? 'is-done' : ''}`}
          >
            <span className="stepper__n">{i + 1}</span>
            {t(chave)}
          </li>
        ))}
      </ol>

      <div className="wizard" data-tour="create-match">
        {etapa === 0 ? (
          <div className="card form">
            <div className="form__row">
              <Field label={t('prep.adversario')}>
                <input
                  className="input"
                  placeholder={t('novo.nomeAdversario')}
                  {...campo('opponentName')}
                />
              </Field>
              <Field label={t('prep.abreviatura')} hint={t('novo.abreviaturaDica')}>
                <input
                  className="input"
                  placeholder={t('novo.abreviaturaPlaceholder')}
                  maxLength={12}
                  {...campo('opponentShortName')}
                />
              </Field>
            </div>
            <div className="form__row">
              <Field label={t('prep.dataHora')}>
                <input className="input" type="datetime-local" {...campo('scheduledAt')} />
              </Field>
              <Field label={t('prep.casaOuFora')}>
                <select className="input" {...campo('homeOrAway')}>
                  <option value="HOME">{t('local.HOME')}</option>
                  <option value="AWAY">{t('local.AWAY')}</option>
                </select>
              </Field>
            </div>
            <div className="form__row">
              <Field
                label={t('prep.competicao')}
                hint={provas.length ? t('novo.competicaoDica') : t('novo.semCompeticoes')}
              >
                <div className="comprova">
                  <select
                    className="input"
                    value={info.competitionId}
                    onChange={(event) => {
                      const prova = provas.find((c) => c.id === event.target.value);
                      setInfo((i) => ({
                        ...i,
                        competitionId: event.target.value,
                        timing: timingOf(prova || team),
                      }));
                    }}
                  >
                    <option value="">{t('novo.escolherCompeticao')}</option>
                    {provas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    data-tour="create-competition"
                    onClick={criarProva}
                    title={t('novo.criarProva')}
                  >
                    {t('novo.criarProvaCurto')}
                  </button>
                </div>
              </Field>
              <Field label={t('prep.tipoJogo')} hint={t('novo.tipoJogoDaCompeticao')}>
                <input className="input" value={timingLabel(info.timing)} readOnly />
              </Field>
            </div>
            <Field label={t('prep.notas')}>
              <textarea className="input input--area" rows={3} {...campo('notes')} />
            </Field>
            {nav(t('comum.cancelar'), t('novo.continuar'), () => {
              const erro = validateMatchInfo({
                opponentName: info.opponentName,
                periodDurationMs: timingConfig({ timing: info.timing }).periodDurationMs,
              });
              if (erro) return toast(mensagemErro(erro), 'error');
              if (!info.competitionId) return toast(t('novo.escolhaCompeticao'), 'error');
              setEtapa(1);
            })}
          </div>
        ) : null}

        {etapa === 1 ? (
          <div className="card">
            <div className="toolbar">
              <input
                className="input input--search"
                placeholder={t('plantel.procurar')}
                value={procura}
                onChange={(e) => setProcura(e.target.value)}
              />
              <span className="toolbar__spacer" />
              <span className={`counter ${limiteConvocados != null && escolhidos.length >= limiteConvocados ? 'is-full' : ''}`}>
                {escolhidos.length}/{limiteConvocados ?? '∞'}
              </span>
            </div>

            <div className="pickgrid">
              {roster
                .filter(
                  (p) =>
                    !procura ||
                    p.name.toLowerCase().includes(procura.toLowerCase()) ||
                    String(p.shirtNumber).includes(procura)
                )
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`pick ${escolhidos.includes(p.id) ? 'is-on' : ''}`}
                    onClick={() => alternarConvocado(p.id)}
                  >
                    <span className="pick__num">{p.shirtNumber}</span>
                    <span className="pick__name">{p.name}</span>
                    <span className="pick__pos">{positionLabel(p.preferredPosition)}</span>
                  </button>
                ))}
            </div>

            {nav(t('comum.voltar'), t('novo.continuar'), async () => {
              const erro = validateSquadSelection(escolhidos, limiteConvocados);
              if (erro) return toast(mensagemErro(erro), 'error');
              if (!(await confirmarPoucosConvocados(confirmar, escolhidos.length))) return;
              setEtapa(2);
            })}
          </div>
        ) : null}

        {etapa === 2 ? (
          <div className="card">
            <CourtPicker candidates={candidatos} lineup={lineup} onChange={setLineup} />
            <p className="muted">
              {t('novo.posicoesPreenchidas', {
                n: countFilled(lineup),
                banco: candidatos.length - countFilled(lineup),
              })}
            </p>
            {nav(t('comum.voltar'), t('novo.continuar'), () => {
              const erro = validateLineup(lineup, escolhidos);
              if (erro) return toast(mensagemErro(erro), 'error');
              setEtapa(3);
            })}
          </div>
        ) : null}

        {etapa === 3 ? (
          <Confirmacao
            club={club}
            competicaoNome={provas.find((c) => c.id === info.competitionId)?.name}
            info={info}
            lineup={lineup}
            escolhidos={roster.filter((p) => escolhidos.includes(p.id))}
            aGuardar={aGuardar}
            onVoltar={() => setEtapa(2)}
            onGuardar={guardar}
          />
        ) : null}
      </div>
    </>
  );
}

function Confirmacao({
  club,
  competicaoNome,
  info,
  lineup,
  escolhidos,
  aGuardar,
  onVoltar,
  onGuardar,
}) {
  const t = useT();
  const emCampo = Object.entries(lineup).filter(([, v]) => v);
  const idsEmCampo = new Set(emCampo.map(([, v]) => v));

  return (
    <div className="card">
      <dl className="review">
        <div>
          <dt>{t('prep.adversario')}</dt>
          <dd>{info.opponentName}</dd>
        </div>
        <div>
          <dt>{t('novo.data')}</dt>
          <dd>{dateLabel(new Date(info.scheduledAt).getTime())}</dd>
        </div>
        <div>
          <dt>{t('lista.local')}</dt>
          <dd>{homeAwayLabel(info.homeOrAway)}</dd>
        </div>
        <div>
          <dt>{t('prep.competicao')}</dt>
          <dd>{competicaoNome || '—'}</dd>
        </div>
        <div>
          <dt>{t('novo.tempoDeJogo')}</dt>
          <dd>{timingLabel(info.timing) || '—'}</dd>
        </div>
        <div>
          <dt>{t('prep.convocados')}</dt>
          <dd>{t('novo.nJogadores', { n: escolhidos.length })}</dd>
        </div>
      </dl>

      <h3 className="section">{t('novo.emCampo')}</h3>
      <div className="chiprow">
        {emCampo.map(([pos, pid]) => {
          const p = escolhidos.find((c) => c.id === pid);
          return (
            <span key={pos} className="chip chip--static">
              <strong>{p.shirtNumber}</strong> {p.name} · {positionLabel(pos)}
            </span>
          );
        })}
      </div>

      <h3 className="section">{t('novo.noBanco')}</h3>
      <div className="chiprow">
        {escolhidos
          .filter((p) => !idsEmCampo.has(p.id))
          .map((p) => (
            <span key={p.id} className="chip chip--static">
              <strong>{p.shirtNumber}</strong> {p.name}
            </span>
          ))}
      </div>

      <div className="wizard__nav">
        <button className="btn btn--ghost" type="button" onClick={onVoltar}>
          Voltar
        </button>
        <button
          className="btn btn--ghost"
          type="button"
          disabled={aGuardar}
          onClick={() => onGuardar(false)}
        >
          {aGuardar ? 'A guardar…' : 'Guardar jogo'}
        </button>
        <button
          className="btn btn--primary"
          type="button"
          disabled={aGuardar}
          onClick={() => onGuardar(true)}
        >
          {aGuardar ? 'A guardar…' : 'Guardar e abrir'}
        </button>
      </div>
    </div>
  );
}

function dataHoraPorOmissao() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * A janela de criar uma prova a partir do jogo novo.
 *
 * Fecha com o nome, ou com `null` se se desistir. O botão de confirmar só
 * acende com alguma coisa escrita — uma prova sem nome não se distingue de
 * outra na lista.
 */
function NovaProva({ defaultTiming, onClose }) {
  const t = useT();
  const [nome, setNome] = useState('');
  const [timing, setTiming] = useState(defaultTiming);
  const [maxSquad, setMaxSquad] = useState('14');
  const limpo = nome.trim();
  const concluir = () => onClose({
    name: limpo,
    timing,
    maxSquad: maxSquad === '' ? null : Number(maxSquad),
  });

  return (
    <Dialog title={t('novo.criarProva')} onClose={() => onClose(null)}>
      <Field label={t('competicao.nome')} hint={t('novo.criarProvaDica')}>
        <input
          className="input"
          autoFocus
          value={nome}
          maxLength={60}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && limpo) concluir();
          }}
        />
      </Field>
      <div className="form__row">
        <Field label={t('competicao.tipoTempo')}>
          <select className="input" value={timing} onChange={(e) => setTiming(e.target.value)}>
            {Object.values(MATCH_TIMING).map((value) => (
              <option key={value} value={value}>{timingLabel(value)}</option>
            ))}
          </select>
        </Field>
        <Field label={t('competicao.maxConvocados')}>
          <select className="input" value={maxSquad} onChange={(e) => setMaxSquad(e.target.value)}>
            <option value="">{t('competicao.semLimite')}</option>
            {Array.from({ length: 18 }, (_, index) => index + 5).map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </Field>
      </div>
      <footer className="modal__actions">
        <button className="btn btn--ghost" onClick={() => onClose(null)}>
          {t('comum.cancelar')}
        </button>
        <button className="btn btn--primary" disabled={!limpo} onClick={concluir}>
          {t('competicoes.criar')}
        </button>
      </footer>
    </Dialog>
  );
}
