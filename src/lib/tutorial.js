'use client';

import { rotas } from './routes.js';

export const TUTORIAL_ACTIVE_KEY = 'futsal-guided-tutorial-active';
export const TUTORIAL_STEP_KEY = 'futsal-guided-tutorial-step';
export const TUTORIAL_EVENT = 'futsal-guided-tutorial-change';

export const guidedTutorialSteps = [
  {
    id: 'club',
    titleKey: 'tutorial.guiado.clubeTitulo',
    textKey: 'tutorial.guiado.clubeTexto',
    target: '[data-tour="create-club"], [data-tour="club-save"]',
    skipWhen: 'hasClub',
  },
  {
    id: 'team',
    titleKey: 'tutorial.guiado.escalaoTitulo',
    textKey: 'tutorial.guiado.escalaoTexto',
    target: '[data-tour="create-team"], [data-tour="team-save"]',
    skipWhen: 'hasTeam',
  },
  {
    id: 'competitions',
    titleKey: 'tutorial.guiado.competicoesTitulo',
    textKey: 'tutorial.guiado.competicoesTexto',
    target: '[data-tour="create-competition"], [data-tour="edit-competition"], [data-tour="competitions"]',
  },
  {
    id: 'players',
    titleKey: 'tutorial.guiado.jogadoresTitulo',
    textKey: 'tutorial.guiado.jogadoresTexto',
    target: '[data-tour="create-player"], [data-tour="player-save"]',
  },
  {
    id: 'match',
    titleKey: 'tutorial.guiado.jogoTitulo',
    textKey: 'tutorial.guiado.jogoTexto',
    target: '[data-tour="create-match"]',
  },
  {
    id: 'matchSquad',
    titleKey: 'tutorial.guiado.convocadosTitulo',
    textKey: 'tutorial.guiado.convocadosTexto',
    target: '[data-tour="match-squad"]',
  },
  {
    id: 'matchLineup',
    titleKey: 'tutorial.guiado.cincoTitulo',
    textKey: 'tutorial.guiado.cincoTexto',
    target: '[data-tour="match-lineup"]',
  },
  {
    id: 'matchConfirm',
    titleKey: 'tutorial.guiado.guardarJogoTitulo',
    textKey: 'tutorial.guiado.guardarJogoTexto',
    target: '[data-tour="match-save-open"]',
  },
  {
    id: 'setup',
    titleKey: 'tutorial.guiado.prepararTitulo',
    textKey: 'tutorial.guiado.prepararTexto',
    target: '[data-tour="match-setup"]',
  },
  {
    id: 'live',
    titleKey: 'tutorial.guiado.acoesTitulo',
    textKey: 'tutorial.guiado.acoesTexto',
    target: '[data-tour="live-court"]',
    autoHideMs: 20000,
  },
  {
    id: 'halftime',
    titleKey: 'tutorial.guiado.intervaloTitulo',
    textKey: 'tutorial.guiado.intervaloTexto',
    target: '[data-tour="halftime-summary"], [data-tour="halftime-player-stats"]',
  },
  {
    id: 'liveSecond',
    titleKey: 'tutorial.guiado.segundaParteTitulo',
    textKey: 'tutorial.guiado.segundaParteTexto',
    target: '[data-tour="live-court"]',
    autoHideMs: 20000,
  },
  {
    id: 'summary',
    titleKey: 'tutorial.guiado.resumoTitulo',
    textKey: 'tutorial.guiado.resumoTexto',
    target: '[data-tour="match-summary"]',
  },
  {
    id: 'summaryHome',
    titleKey: 'tutorial.guiado.voltarEscalaoTitulo',
    textKey: 'tutorial.guiado.voltarEscalaoTexto',
    target: '[data-tour="summary-home"]',
  },
  {
    id: 'openTeam',
    titleKey: 'tutorial.guiado.abrirEscalaoTitulo',
    textKey: 'tutorial.guiado.abrirEscalaoTexto',
    target: '[data-tour="open-team"]',
  },
  {
    id: 'stats',
    titleKey: 'tutorial.guiado.estatisticasTitulo',
    textKey: 'tutorial.guiado.estatisticasTexto',
    target: '[data-tour="team-stats"]',
  },
  {
    id: 'dashboard',
    titleKey: 'tutorial.guiado.dashboardTitulo',
    textKey: 'tutorial.guiado.dashboardTexto',
    target: '[data-tour="team-dashboard"]',
  },
];

function emitChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(TUTORIAL_EVENT));
}

export function readGuidedTutorialState() {
  if (typeof window === 'undefined') return { active: false, step: 0 };
  return {
    active: window.localStorage.getItem(TUTORIAL_ACTIVE_KEY) === '1',
    step: Number(window.localStorage.getItem(TUTORIAL_STEP_KEY) || 0),
  };
}

export function setGuidedTutorialStep(step) {
  if (typeof window === 'undefined') return;
  const next = Math.max(0, Math.min(guidedTutorialSteps.length - 1, Number(step) || 0));
  window.localStorage.setItem(TUTORIAL_STEP_KEY, String(next));
  emitChange();
}

export function setGuidedTutorialStepById(id) {
  if (typeof window === 'undefined') return;
  if (window.localStorage.getItem(TUTORIAL_ACTIVE_KEY) !== '1') return;
  const index = guidedTutorialSteps.findIndex((step) => step.id === id);
  if (index < 0) return;
  setGuidedTutorialStep(index);
}

export function stopGuidedTutorial() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TUTORIAL_ACTIVE_KEY);
  window.localStorage.removeItem(TUTORIAL_STEP_KEY);
  emitChange();
}

export function startGuidedTutorial(router) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TUTORIAL_ACTIVE_KEY, '1');
  window.localStorage.setItem(TUTORIAL_STEP_KEY, '0');
  emitChange();
  router?.push(rotas.dashboard());
}
