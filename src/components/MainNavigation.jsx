'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth.jsx';
import { clubs, teams, loadMatch, findLiveMatch, profile, statConfig } from '@/lib/data/repository.js';
import { DATA_UPDATED_EVENT } from '@/lib/data/sync.js';
import { localClubLicenseActive } from '@/lib/license.js';
import { addonsAtivos } from '@/domain/addons.js';
import { PARAM, noJogoAoVivo, rotas } from '@/lib/routes.js';
import { guidedTutorialSteps, readGuidedTutorialState, setGuidedTutorialStepById } from '@/lib/tutorial.js';
import { useT } from '@/lib/i18n/index.js';

const SELECTED_TEAM_KEY = 'futsal-selected-team-context';

// A "Visão geral do clube" (add-on) entra no seletor como se fosse mais um
// escalão. O valor da opção leva este prefixo e o id do clube, para nunca se
// confundir com o id de um escalão.
const VISAO = 'visao:';

function naVisaoGeral(pathname) {
  return /^\/club\/overview\/?$/.test(pathname || '');
}

function routeIdsFrom(searchParams) {
  const q = searchParams || new URLSearchParams();
  return {
    clubId: q.get(PARAM.club),
    teamId: q.get(PARAM.team),
    matchId: q.get(PARAM.match),
  };
}

function readStoredTeam() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem(SELECTED_TEAM_KEY) || 'null');
  } catch {
    return null;
  }
}

function storeTeam(item) {
  if (typeof window === 'undefined' || !item) return;
  window.localStorage.setItem(
    SELECTED_TEAM_KEY,
    JSON.stringify({ clubId: item.club.id, teamId: item.team.id })
  );
}

function areaFromPath(pathname) {
  if (/^\/staff\/?$/.test(pathname || '')) return 'staff';
  if (/^\/account\/?$|^\/password\/?$|^\/privacy\/?$|^\/delete-account\/?$/.test(pathname || '')) return 'profile';
  // A visão geral fica debaixo de Jogo: é lá que se escolhe o escalão e é lá
  // que se vêem os resultados.
  if (naVisaoGeral(pathname)) return 'game';
  if (/^\/jogo\/?$/.test(pathname || '') || /^\/match\//.test(pathname || '') || /^\/team\/matches/.test(pathname || '')) return 'game';
  if (/^\/team\/(training|tactics)(\/|$)/.test(pathname || '')) return 'training';
  if (/^\/club/.test(pathname || '') || /^\/team\/(roster|competitions|competition|edit|new|access|players)/.test(pathname || '')) return 'teams';
  if (/^\/team(\/dashboard|\/player)?\/?$/.test(pathname || '')) return 'analysis';
  return 'teams';
}

function isPublicPath(pathname) {
  return /^\/login\/?$|^\/privacy\/?$|^\/delete-account\/?$|^\/jogada\/?$/.test(pathname || '');
}

function targetFor(area, selected) {
  if (area === 'profile') return rotas.conta();
  if (area === 'staff') return rotas.equipaTecnica();
  if (!selected?.club?.id || !selected?.team?.id) return rotas.jogo();
  if (area === 'game') return rotas.jogos(selected.club.id, selected.team.id);
  if (area === 'analysis') return rotas.escalao(selected.club.id, selected.team.id);
  if (area === 'training') return rotas.treinos(selected.club.id, selected.team.id);
  return rotas.plantel(selected.club.id, selected.team.id);
}

function Icon({ type }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.9',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };
  if (type === 'game') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="m12 4 2.5 5-2.5 3-2.5-3L12 4Z" />
        <path d="m4.8 9 4.7.2 2.5 2.8-1.5 4.2-4.7.8" />
        <path d="m19.2 9-4.7.2L12 12l1.5 4.2 4.7.8" />
      </svg>
    );
  }
  if (type === 'teams') {
    return (
      <svg {...common}>
        <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M3.5 20c.5-3.2 2-5 4.5-5s4 1.8 4.5 5" />
        <path d="M11.5 20c.5-3.2 2-5 4.5-5s4 1.8 4.5 5" />
      </svg>
    );
  }
  if (type === 'training') {
    // Um apito.
    return (
      <svg {...common}>
        <path d="M3 10.5a4.5 4.5 0 0 0 4.5 4.5h3.7l2.3 3.6a3 3 0 0 0 5.1-.2l1.6-2.9a3 3 0 0 0-.9-3.9L15 8H7.5A4.5 4.5 0 0 0 3 10.5Z" />
        <circle cx="7.5" cy="10.5" r="1.4" />
        <path d="M13 8V5.5" />
      </svg>
    );
  }
  if (type === 'analysis') {
    return (
      <svg {...common}>
        <path d="M5 20V10" />
        <path d="M12 20V4" />
        <path d="M19 20v-7" />
      </svg>
    );
  }
  if (type === 'staff') {
    return (
      <svg {...common}>
        <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M3.5 20c.5-3.2 2-5 4.5-5 1.2 0 2.2.4 3 1.1" />
        <path d="M16 8v6" />
        <path d="M13 11h6" />
        <path d="M13.5 20c.4-2.4 1.6-3.8 3.8-3.8 1.8 0 3 1 3.7 2.8" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21c1.1-4.2 3.6-6 7.5-6s6.4 1.8 7.5 6" />
    </svg>
  );
}

export default function MainNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useT();
  const { session, remote, ready } = useAuth();
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [live, setLive] = useState(null);
  const [licencaClube, setLicencaClube] = useState(false);
  const [clubesComVisao, setClubesComVisao] = useState(() => new Set());
  const [sideCollapsed, setSideCollapsed] = useState(false);

  const area = areaFromPath(pathname);
  const routeIds = useMemo(() => routeIdsFrom(searchParams), [searchParams]);
  const selected = useMemo(
    () => items.find((item) => item.team.id === selectedId) || items[0] || null,
    [items, selectedId]
  );

  const load = useCallback(async () => {
    const list = [];
    const comVisao = new Set();
    for (const club of await clubs.list()) {
      for (const team of await teams.listByClub(club.id)) {
        list.push({ club, team });
        // A visão geral é do clube, mas os add-ons são do escalão: basta um
        // escalão com ela ligada para o clube a ter.
        if (!comVisao.has(club.id)) {
          const config = await statConfig.get(team.id).catch(() => null);
          if (addonsAtivos(config).has('visao-geral-clube')) comVisao.add(club.id);
        }
      }
    }

    let nextId = routeIds.teamId;
    if (!nextId && routeIds.matchId) {
      const loaded = await loadMatch(routeIds.matchId).catch(() => null);
      nextId = loaded?.match?.teamId || null;
    }
    const stored = readStoredTeam();
    if (!nextId && stored?.teamId) nextId = stored.teamId;
    if (!list.some((item) => item.team.id === nextId)) nextId = list[0]?.team.id || null;
    // Na visão geral de um clube, o escalão de contexto tem de ser desse clube.
    if (routeIds.clubId && !routeIds.teamId) {
      const doClube = list.filter((item) => item.club.id === routeIds.clubId);
      if (doClube.length && !doClube.some((item) => item.team.id === nextId)) nextId = doClube[0].team.id;
    }

    const nextSelected = list.find((item) => item.team.id === nextId);
    if (nextSelected) storeTeam(nextSelected);
    const perfil = await profile.get();
    setItems(list);
    setSelectedId(nextId);
    setLicencaClube(localClubLicenseActive(perfil));
    setClubesComVisao(comVisao);
    setLive(await findLiveMatch());
  }, [routeIds.clubId, routeIds.matchId, routeIds.teamId]);

  useEffect(() => {
    if (!ready || (remote && !session)) return;
    load();
    window.addEventListener(DATA_UPDATED_EVENT, load);
    return () => window.removeEventListener(DATA_UPDATED_EVENT, load);
  }, [load, ready, remote, session]);

  useEffect(() => {
    if (!routeIds.teamId || !items.some((item) => item.team.id === routeIds.teamId)) return;
    setSelectedId(routeIds.teamId);
    const routeItem = items.find((item) => item.team.id === routeIds.teamId);
    if (routeItem) storeTeam(routeItem);
  }, [items, routeIds.teamId]);

  if (!ready || isPublicPath(pathname)) return null;

  const navItems = [
    { id: 'game', label: t('nav.jogo') },
    { id: 'training', label: t('nav.treino') },
    { id: 'teams', label: t('nav.equipas') },
    { id: 'analysis', label: t('nav.analise') },
    ...(licencaClube ? [{ id: 'staff', label: t('nav.equipaTecnica') }] : []),
    { id: 'profile', label: t('nav.perfil') },
  ];

  function go(nextArea) {
    // O tutorial guiado aponta para esta aba depois de um jogo terminado
    // (o resumo já não manda voltar à "casa" — manda entrar aqui, que é
    // onde ficam as estatísticas e o dashboard). Como a navegação principal
    // está sempre visível, o avanço do passo tem de ser explícito neste
    // clique; sem isto o tutorial ficava preso em "vai à Análise" mesmo
    // depois de a pessoa lá estar.
    if (nextArea === 'analysis') {
      const tutorial = readGuidedTutorialState();
      if (tutorial.active && guidedTutorialSteps[tutorial.step]?.id === 'summaryHome') {
        setGuidedTutorialStepById('stats');
      }
    }
    router.push(targetFor(nextArea, selected));
  }

  function trocarEscalao(teamId) {
    if (teamId.startsWith(VISAO)) {
      router.push(rotas.visaoGeralClube(teamId.slice(VISAO.length)));
      return;
    }
    const next = items.find((item) => item.team.id === teamId);
    if (!next) return;
    setSelectedId(teamId);
    storeTeam(next);
    if (area !== 'profile') router.push(targetFor(area, next));
  }

  const showContext = selected && !['profile', 'staff'].includes(area) && !noJogoAoVivo(pathname);
  const showTeamsLink = selected && area === 'teams' && !noJogoAoVivo(pathname);

  return (
    <>
      <aside className={`mainnav mainnav--side ${sideCollapsed ? 'is-collapsed' : ''}`} aria-label={t('nav.principal')}>
        <div className="mainnav__sidehead">
          <button className="mainnav__brand" type="button" onClick={() => go('teams')}>
            <span>Futsal SubStats</span>
          </button>
          <button
            className="mainnav__collapse"
            type="button"
            aria-label={sideCollapsed ? t('nav.abrirMenu') : t('nav.recolherMenu')}
            onClick={() => setSideCollapsed((v) => !v)}
          >
            {sideCollapsed ? '›' : '‹'}
          </button>
        </div>
        <NavButtons items={navItems} active={area} onGo={go} />
        {live ? (
          <button className="mainnav__live" type="button" onClick={() => router.push(rotas.jogoAoVivo(live.id))}>
            {t('nav.jogoEmCurso')}
          </button>
        ) : null}
      </aside>

      <header className="mainnav-top">
        {showContext ? (
          <div className="context-picker">
            {/* O nome do clube leva ao seu cartão — é lá que o dono muda o
                nome e os outros dados. Fica fora do `label` de propósito: um
                `label` sem `htmlFor` ativa o controlo que envolve ao ser
                clicado em qualquer ponto, e um botão próprio evita que este
                clique abra sem querer a lista de escalões ao lado. */}
            <button
              type="button"
              className="context-picker__club"
              onClick={() => router.push(rotas.clube(selected.club.id))}
              title={t('nav.abrirClube')}
            >
              {selected.club.shortName || selected.club.name}
            </button>
            <label className="context-picker__escalao">
              <select
                value={
                  naVisaoGeral(pathname) && clubesComVisao.has(selected.club.id)
                    ? `${VISAO}${selected.club.id}`
                    : selected.team.id
                }
                onChange={(e) => trocarEscalao(e.target.value)}
                aria-label={t('nav.trocarEscalao')}
              >
                {items.map((item, i) => (
                  <Fragment key={item.team.id}>
                    {/* Antes do primeiro escalão de cada clube que a tenha. */}
                    {clubesComVisao.has(item.club.id) && items[i - 1]?.club.id !== item.club.id ? (
                      <option value={`${VISAO}${item.club.id}`}>{t('visao.opcao')}</option>
                    ) : null}
                    <option value={item.team.id}>{item.team.name}</option>
                  </Fragment>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <span className="mainnav-top__spacer" />
        )}
        <span className="mainnav-top__spacer" />
        {live && !noJogoAoVivo(pathname) ? (
          <button className="btn btn--tiny btn--fecha" type="button" onClick={() => router.push(rotas.jogoAoVivo(live.id))}>
            {t('nav.jogoEmCurso')}
          </button>
        ) : null}
        {showTeamsLink ? (
          <button
            className="btn btn--tiny btn--ghost"
            type="button"
            onClick={() => router.push(rotas.escaloes(selected.club.id))}
          >
            {t('nav.verEscaloes')}
          </button>
        ) : null}
      </header>

      <nav className="mainnav mainnav--bottom" aria-label={t('nav.principal')}>
        <NavButtons items={navItems} active={area} onGo={go} />
      </nav>
    </>
  );
}

function NavButtons({ items, active, onGo }) {
  return items.map((item) => (
    <button
      key={item.id}
      className={`mainnav__item ${active === item.id ? 'is-active' : ''}`}
      type="button"
      data-tour={item.id === 'analysis' ? 'nav-analysis' : undefined}
      aria-current={active === item.id ? 'page' : undefined}
      onClick={() => onGo(item.id)}
    >
      <Icon type={item.id} />
      <span>{item.label}</span>
    </button>
  ));
}
