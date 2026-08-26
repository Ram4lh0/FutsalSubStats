'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  guidedTutorialSteps,
  readGuidedTutorialState,
  setGuidedTutorialStep,
  startGuidedTutorial,
  stopGuidedTutorial,
  TUTORIAL_EVENT,
} from '@/lib/tutorial.js';
import { rotas } from '@/lib/routes.js';
import { clubs, teams, matches, loadMatch } from '@/lib/data/repository.js';
import { MATCH_STATUS, LIVE_STATUSES } from '@/domain/constants.js';
import { useT } from '@/lib/i18n/index.js';
import { useUI } from '@/lib/ui.jsx';

async function primeiroContexto() {
  const listaClubes = await clubs.list();
  const club = listaClubes[0] || null;
  const listaEscaloes = club ? await teams.listByClub(club.id) : [];
  const team = listaEscaloes[0] || null;
  const listaJogos = team ? await matches.listByTeam(team.id) : [];

  let live = null;
  let ready = null;
  let finished = null;
  for (const match of listaJogos) {
    const loaded = await loadMatch(match.id).catch(() => null);
    const status = loaded?.state?.status;
    if (!live && LIVE_STATUSES.includes(status)) live = match;
    if (!ready && [MATCH_STATUS.DRAFT, MATCH_STATUS.READY].includes(status)) ready = match;
    if (!finished && status === MATCH_STATUS.FINISHED) finished = match;
  }

  return { club, team, live, ready, finished, match: live || ready || finished || listaJogos[0] || null };
}

function destinoDoPasso(step, ctx) {
  const clubId = ctx.club?.id;
  const teamId = ctx.team?.id;
  const match = step.id === 'summary'
    ? (ctx.finished || ctx.live || ctx.ready || ctx.match)
    : step.id === 'live' || step.id === 'halftime'
      ? (ctx.live || ctx.ready || ctx.match)
      : (ctx.ready || ctx.match);

  if (step.id === 'club') return rotas.dashboard();
  if (!clubId) return rotas.dashboard();
  if (step.id === 'team') return rotas.clube(clubId);
  if (!teamId) return rotas.clube(clubId);
  if (step.id === 'competitions') return rotas.competicoes(clubId, teamId);
  if (step.id === 'players') return rotas.plantel(clubId, teamId);
  if (step.id === 'match') return rotas.jogos(clubId, teamId);
  if (step.id === 'setup') return match ? rotas.jogoPreparar(match.id) : rotas.jogoNovo(clubId, teamId);
  if (step.id === 'live' || step.id === 'halftime') return match ? rotas.jogoAoVivo(match.id) : rotas.jogoNovo(clubId, teamId);
  if (step.id === 'summary') return match ? rotas.jogoResumo(match.id) : rotas.jogos(clubId, teamId);
  if (step.id === 'stats') return rotas.escalao(clubId, teamId);
  if (step.id === 'dashboard') return rotas.painelEscalao(clubId, teamId);
  return rotas.dashboard();
}

export default function GuidedTutorial() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const { dialogOpen } = useUI();
  const [state, setState] = useState({ active: false, step: 0 });
  const [ctx, setCtx] = useState(null);

  const atualizar = useCallback(() => setState(readGuidedTutorialState()), []);

  useEffect(() => {
    atualizar();
    window.addEventListener(TUTORIAL_EVENT, atualizar);
    window.addEventListener('storage', atualizar);
    return () => {
      window.removeEventListener(TUTORIAL_EVENT, atualizar);
      window.removeEventListener('storage', atualizar);
    };
  }, [atualizar]);

  useEffect(() => {
    if (!state.active) return;
    let vivo = true;
    primeiroContexto().then((next) => {
      if (vivo) setCtx(next);
    });
    return () => {
      vivo = false;
    };
  }, [state.active, state.step]);

  const stepIndex = Math.max(0, Math.min(guidedTutorialSteps.length - 1, state.step || 0));
  const step = guidedTutorialSteps[stepIndex];

  useEffect(() => {
    if (!state.active || !step?.target) return;
    const alvo = document.querySelector(step.target);
    if (!alvo) return;
    alvo.classList.add('guided-tour-highlight');
    alvo.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    return () => alvo.classList.remove('guided-tour-highlight');
  }, [state.active, step, pathname]);

  if (!state.active || dialogOpen) return null;

  const ultimo = stepIndex === guidedTutorialSteps.length - 1;
  const faltaBase = !ctx?.club && step.id !== 'club';
  const faltaEscalao = ctx?.club && !ctx?.team && !['club', 'team'].includes(step.id);
  const faltaJogo = ctx?.team && !ctx?.match && ['setup', 'live', 'halftime', 'summary'].includes(step.id);

  function navegarParaPasso(index) {
    const nextIndex = Math.max(0, Math.min(guidedTutorialSteps.length - 1, index));
    const nextStep = guidedTutorialSteps[nextIndex];
    setGuidedTutorialStep(nextIndex);
    router.push(destinoDoPasso(nextStep, ctx || {}));
  }

  function anterior() {
    if (stepIndex === 0) return;
    navegarParaPasso(stepIndex - 1);
  }

  function seguinte() {
    if (ultimo) return stopGuidedTutorial();
    navegarParaPasso(stepIndex + 1);
  }

  return (
    <aside className="guided-tour" role="dialog" aria-live="polite" aria-label={t('tutorial.titulo')}>
      <div className="guided-tour__panel">
        <div className="guided-tour__top">
          <span className="guided-tour__progress">
            {t('tutorial.progresso', { atual: stepIndex + 1, total: guidedTutorialSteps.length })}
          </span>
          <button className="btn btn--tiny btn--ghost" type="button" onClick={stopGuidedTutorial}>
            {t('tutorial.ignorar')}
          </button>
        </div>
        <h2>{t(step.titleKey)}</h2>
        <p>{t(step.textKey)}</p>
        {faltaBase ? <p className="guided-tour__hint">{t('tutorial.guiado.precisaClube')}</p> : null}
        {faltaEscalao ? <p className="guided-tour__hint">{t('tutorial.guiado.precisaEscalao')}</p> : null}
        {faltaJogo ? <p className="guided-tour__hint">{t('tutorial.guiado.precisaJogo')}</p> : null}
        <div className="guided-tour__actions">
          <button className="btn btn--ghost" type="button" disabled={stepIndex === 0} onClick={anterior}>
            {t('tutorial.anterior')}
          </button>
          <button className="btn btn--primary" type="button" onClick={seguinte}>
            {ultimo ? t('tutorial.concluir') : t('tutorial.seguinte')}
          </button>
        </div>
        <button className="guided-tour__restart" type="button" onClick={() => startGuidedTutorial(router)}>
          {t('tutorial.guiado.recomecar')}
        </button>
      </div>
    </aside>
  );
}
