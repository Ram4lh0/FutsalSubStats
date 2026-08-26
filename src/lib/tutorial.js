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
    target: '[data-tour="create-club"]',
  },
  {
    id: 'team',
    titleKey: 'tutorial.guiado.escalaoTitulo',
    textKey: 'tutorial.guiado.escalaoTexto',
    target: '[data-tour="create-team"]',
  },
  {
    id: 'competitions',
    titleKey: 'tutorial.guiado.competicoesTitulo',
    textKey: 'tutorial.guiado.competicoesTexto',
    target: '[data-tour="competitions"]',
  },
  {
    id: 'players',
    titleKey: 'tutorial.guiado.jogadoresTitulo',
    textKey: 'tutorial.guiado.jogadoresTexto',
    target: '[data-tour="create-player"]',
  },
  {
    id: 'match',
    titleKey: 'tutorial.guiado.jogoTitulo',
    textKey: 'tutorial.guiado.jogoTexto',
    target: '[data-tour="create-match"]',
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
  },
  {
    id: 'halftime',
    titleKey: 'tutorial.guiado.intervaloTitulo',
    textKey: 'tutorial.guiado.intervaloTexto',
    target: '[data-tour="live-clock"]',
  },
  {
    id: 'summary',
    titleKey: 'tutorial.guiado.resumoTitulo',
    textKey: 'tutorial.guiado.resumoTexto',
    target: '[data-tour="match-summary"]',
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
