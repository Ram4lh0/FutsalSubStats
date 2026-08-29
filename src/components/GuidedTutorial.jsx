'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

function limitar(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function insetSeguro(nome) {
  if (typeof window === 'undefined') return 0;
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue(nome);
  const valor = Number.parseFloat(raw);
  return Number.isFinite(valor) ? valor : 0;
}

// O painel vive sempre encostado à direita (é o `right` fixo do CSS que
// nunca é tocado aqui): o que este cálculo escolhe é só a posição vertical,
// para tentar não tapar o próprio elemento em destaque. Antes também
// centrava o painel por baixo do alvo, o que era o motivo de tantas vezes
// ficar mesmo em cima dos botões de confirmar/preencher — daí a ideia de
// deixar de mexer no eixo horizontal.
function posicaoDoPainel(box) {
  if (typeof window === 'undefined') return {};
  const margem = 12;
  const margemTopo = Math.max(margem, insetSeguro('--seguro-cima') + 8);
  const margemFundo = Math.max(margem, insetSeguro('--seguro-baixo') + 8);
  const largura = Math.min(360, window.innerWidth - margem * 2);
  const alturaEstimada = window.innerWidth < 700 ? 340 : 280;

  if (!box) return { width: largura };

  const espacoAbaixo = window.innerHeight - box.bottom;
  const espacoAcima = box.top;
  const preferirBaixo = espacoAbaixo >= alturaEstimada || espacoAbaixo >= espacoAcima;
  const topPreferido = preferirBaixo ? box.bottom + 14 : box.top - alturaEstimada - 14;
  const top = limitar(
    topPreferido,
    margemTopo,
    Math.max(margemTopo, window.innerHeight - alturaEstimada - margemFundo)
  );
  return {
    width: largura,
    top,
    bottom: 'auto',
    maxHeight: Math.max(150, window.innerHeight - top - margemFundo),
  };
}

function caixaUnida(elementos) {
  const rects = elementos
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);
  if (!rects.length) return null;
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const left = Math.min(...rects.map((r) => r.left));
  return { top, right, bottom, left, width: right - left, height: bottom - top };
}

function passoSaltado(step, ctx) {
  if (!step || !ctx) return false;
  if (step.skipWhen === 'hasClub') return Boolean(ctx.club);
  if (step.skipWhen === 'hasTeam') return Boolean(ctx.team);
  return false;
}

function passosUteis(ctx) {
  return guidedTutorialSteps.filter((s) => !passoSaltado(s, ctx));
}

function indiceUtilAPartir(index, ctx, direcao = 1) {
  let i = limitar(index, 0, guidedTutorialSteps.length - 1);
  while (i >= 0 && i < guidedTutorialSteps.length) {
    if (!passoSaltado(guidedTutorialSteps[i], ctx)) return i;
    i += direcao;
  }
  return null;
}

function passoVisivel(step) {
  if (!step?.target || typeof document === 'undefined') return false;
  return Boolean(document.querySelector(step.target));
}

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

  if (step.id === 'club') return rotas.jogo();
  if (!clubId) return rotas.jogo();
  if (step.id === 'team') return rotas.clube(clubId);
  if (!teamId) return rotas.clube(clubId);
  if (step.id === 'competitions') return rotas.competicoes(clubId, teamId);
  if (step.id === 'players') return rotas.plantel(clubId, teamId);
  if (step.id === 'match') return rotas.jogos(clubId, teamId);
  if (step.id === 'setup') return match ? rotas.jogoPreparar(match.id) : rotas.jogoNovo(clubId, teamId);
  if (step.id === 'live' || step.id === 'halftime') return match ? rotas.jogoAoVivo(match.id) : rotas.jogoNovo(clubId, teamId);
  if (step.id === 'liveSecond') return match ? rotas.jogoAoVivo(match.id) : rotas.jogoNovo(clubId, teamId);
  if (step.id === 'summary') return match ? rotas.jogoResumo(match.id) : rotas.jogos(clubId, teamId);
  if (step.id === 'summaryHome') return match ? rotas.jogoResumo(match.id) : rotas.jogos(clubId, teamId);
  if (step.id === 'stats') return rotas.escalao(clubId, teamId);
  if (step.id === 'dashboard') return rotas.painelEscalao(clubId, teamId);
  return rotas.jogo();
}

export default function GuidedTutorial() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const { dialogOpen } = useUI();
  const [state, setState] = useState({ active: false, step: 0 });
  const [ctx, setCtx] = useState(null);
  const [targetBox, setTargetBox] = useState(null);
  const [cardHidden, setCardHidden] = useState(false);
  const [autoHideRemaining, setAutoHideRemaining] = useState(null);
  const hideTimer = useRef(null);
  const countdownTimer = useRef(null);

  const atualizar = useCallback(() => setState(readGuidedTutorialState()), []);
  const stepIndex = Math.max(0, Math.min(guidedTutorialSteps.length - 1, state.step || 0));
  const step = guidedTutorialSteps[stepIndex];

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
  }, [state.active, state.step, pathname]);

  useEffect(() => {
    setCardHidden(false);
  }, [state.step, pathname]);

  useEffect(() => () => {
    window.clearTimeout(hideTimer.current);
    window.clearInterval(countdownTimer.current);
  }, []);

  useEffect(() => {
    window.clearTimeout(hideTimer.current);
    window.clearInterval(countdownTimer.current);
    setAutoHideRemaining(null);
    if (!state.active || !step?.autoHideMs) return undefined;
    const deadline = Date.now() + step.autoHideMs;
    const updateRemaining = () => {
      setAutoHideRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    updateRemaining();
    countdownTimer.current = window.setInterval(updateRemaining, 250);
    hideTimer.current = window.setTimeout(() => {
      window.clearInterval(countdownTimer.current);
      setAutoHideRemaining(null);
      setCardHidden(true);
    }, step.autoHideMs);
    return () => {
      window.clearTimeout(hideTimer.current);
      window.clearInterval(countdownTimer.current);
    };
  }, [state.active, step]);

  useEffect(() => {
    if (!state.active || !ctx || !passoSaltado(step, ctx)) return;
    const nextIndex = indiceUtilAPartir(stepIndex + 1, ctx, 1);
    if (nextIndex == null) return stopGuidedTutorial();
    setGuidedTutorialStep(nextIndex);
    router.replace(destinoDoPasso(guidedTutorialSteps[nextIndex], ctx));
  }, [ctx, router, state.active, step, stepIndex]);

  useEffect(() => {
    if (!state.active || !step?.target || passoSaltado(step, ctx)) return;
    setTargetBox(null);
    const alvos = Array.from(document.querySelectorAll(step.target));
    if (!alvos.length) {
      setTargetBox(null);
      return;
    }
    const medir = () => {
      setTargetBox(caixaUnida(alvos));
    };
    alvos.forEach((alvo) => alvo.classList.add('guided-tour-highlight'));
    alvos[0].scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    const id = window.setTimeout(medir, 280);
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
      alvos.forEach((alvo) => alvo.classList.remove('guided-tour-highlight'));
    };
  }, [ctx, state.active, step, pathname]);

  useEffect(() => {
    // Um passo `manual` (o alvo dele vive na navegação principal, sempre no
    // ecrã) nunca entra nesta conta: nem como candidato para onde saltar —
    // estaria sempre "visível", mesmo no passo 1 — nem como algo a corrigir
    // enquanto é o passo atual. A entrada e a saída desse passo ficam a
    // cargo de quem chama `setGuidedTutorialStepById` explicitamente.
    if (!state.active || !ctx || step?.manual) return;
    const visiveis = guidedTutorialSteps
      .map((s, index) => ({ s, index }))
      .filter(({ s }) => !passoSaltado(s, ctx) && !s.manual && passoVisivel(s));
    if (!visiveis.length || visiveis.some(({ index }) => index === stepIndex)) return;
    const seguinteVisivel = visiveis.find(({ index }) => index > stepIndex) || visiveis[visiveis.length - 1];
    if (seguinteVisivel) setGuidedTutorialStep(seguinteVisivel.index);
  }, [ctx, pathname, state.active, step, stepIndex]);

  if (!state.active || dialogOpen || passoSaltado(step, ctx)) return null;

  const uteis = passosUteis(ctx);
  const posicaoUtil = Math.max(0, uteis.findIndex((s) => s.id === step.id));
  const ultimo = posicaoUtil === uteis.length - 1;
  const faltaBase = !ctx?.club && step.id !== 'club';
  const faltaEscalao = ctx?.club && !ctx?.team && !['club', 'team'].includes(step.id);
  const faltaJogo = ctx?.team && !ctx?.match && ['setup', 'live', 'halftime'].includes(step.id);

  function navegarParaPasso(index, direcao = 1) {
    const nextIndex = Math.max(0, Math.min(guidedTutorialSteps.length - 1, index));
    const util = ctx ? indiceUtilAPartir(nextIndex, ctx, direcao) : nextIndex;
    if (util == null) return stopGuidedTutorial();
    const nextStep = guidedTutorialSteps[util];
    setGuidedTutorialStep(util);
    router.push(destinoDoPasso(nextStep, ctx || {}));
  }

  function anterior() {
    if (posicaoUtil <= 0) return;
    navegarParaPasso(stepIndex - 1, -1);
  }

  function seguinte() {
    if (ultimo) return stopGuidedTutorial();
    navegarParaPasso(stepIndex + 1, 1);
  }

  // Esconder é agora uma escolha que fica — nada de reaparecer sozinho ao
  // fim de 5 segundos. O que traz o card de volta é a saliência (o botão em
  // `mostrarCard`), sempre visível encostada à borda.
  function esconderCard() {
    window.clearTimeout(hideTimer.current);
    window.clearInterval(countdownTimer.current);
    setAutoHideRemaining(null);
    setCardHidden(true);
  }

  function mostrarCard() {
    window.clearTimeout(hideTimer.current);
    window.clearInterval(countdownTimer.current);
    setAutoHideRemaining(null);
    setCardHidden(false);
  }

  const panelStyle = posicaoDoPainel(targetBox);
  const spotlightStyle = targetBox
    ? {
        top: targetBox.top - 8,
        left: targetBox.left - 8,
        width: targetBox.width + 16,
        height: targetBox.height + 16,
      }
    : null;

  return (
    <aside className="guided-tour" role="dialog" aria-live="polite" aria-label={t('tutorial.titulo')}>
      {spotlightStyle ? <div className="guided-tour__spotlight" style={spotlightStyle} /> : null}
      {cardHidden ? (
        <button
          type="button"
          className="guided-tour__tab"
          onClick={mostrarCard}
          aria-label={t('tutorial.guiado.mostrarCard')}
          title={t('tutorial.guiado.mostrarCard')}
        >
          <span aria-hidden="true">‹</span>
        </button>
      ) : (
        <div className="guided-tour__panel" style={panelStyle}>
          <div className="guided-tour__top">
            <span className="guided-tour__progress">
              {t('tutorial.progresso', { atual: posicaoUtil + 1, total: uteis.length })}
            </span>
            <div className="guided-tour__topactions">
              <button className="btn btn--tiny btn--ghost" type="button" onClick={esconderCard}>
                {t('tutorial.guiado.esconderCard')}
              </button>
              <button className="btn btn--tiny btn--ghost" type="button" onClick={stopGuidedTutorial}>
                {t('tutorial.ignorar')}
              </button>
            </div>
          </div>
          <h2>{t(step.titleKey)}</h2>
          {step.textKey ? <p>{t(step.textKey)}</p> : null}
          {step.actionKey ? (
            <div className="guided-tour__note">
              <span>{t('tutorial.guiado.fazer')}</span>
              <p>{t(step.actionKey)}</p>
            </div>
          ) : null}
          {step.autoHideMs && autoHideRemaining != null ? (
            <p className="guided-tour__countdown">
              {t('tutorial.guiado.desapareceEm', { s: autoHideRemaining })}
            </p>
          ) : null}
          {faltaBase ? <p className="guided-tour__hint">{t('tutorial.guiado.precisaClube')}</p> : null}
          {faltaEscalao ? <p className="guided-tour__hint">{t('tutorial.guiado.precisaEscalao')}</p> : null}
          {faltaJogo ? <p className="guided-tour__hint">{t('tutorial.guiado.precisaJogo')}</p> : null}
          <div className="guided-tour__actions">
            <button className="btn btn--ghost" type="button" disabled={posicaoUtil <= 0} onClick={anterior}>
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
      )}
    </aside>
  );
}
