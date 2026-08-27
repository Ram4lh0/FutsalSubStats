'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth.jsx';
import { clubs, teams, loadMatch, findLiveMatch, profile } from '@/lib/data/repository.js';
import { DATA_UPDATED_EVENT } from '@/lib/data/sync.js';
import { PARAM, noJogoAoVivo, rotas } from '@/lib/routes.js';
import { useT } from '@/lib/i18n/index.js';

const SELECTED_TEAM_KEY = 'futsal-selected-team-context';

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
  if (/^\/match\//.test(pathname || '') || /^\/team\/matches/.test(pathname || '')) return 'game';
  if (/^\/club/.test(pathname || '') || /^\/team\/(roster|competitions|competition|edit|new|access|players)/.test(pathname || '')) return 'teams';
  if (/^\/team(\/dashboard|\/player)?\/?$/.test(pathname || '')) return 'analysis';
  return 'teams';
}

function isPublicPath(pathname) {
  return /^\/login\/?$|^\/privacy\/?$|^\/delete-account\/?$/.test(pathname || '');
}

function targetFor(area, selected) {
  if (area === 'profile') return rotas.conta();
  if (area === 'staff') return rotas.equipaTecnica();
  if (!selected?.club?.id || !selected?.team?.id) return rotas.dashboard();
  if (area === 'game') return rotas.jogos(selected.club.id, selected.team.id);
  if (area === 'analysis') return rotas.escalao(selected.club.id, selected.team.id);
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

  const area = areaFromPath(pathname);
  const routeIds = useMemo(() => routeIdsFrom(searchParams), [searchParams]);
  const selected = useMemo(
    () => items.find((item) => item.team.id === selectedId) || items[0] || null,
    [items, selectedId]
  );

  const load = useCallback(async () => {
    const list = [];
    for (const club of await clubs.list()) {
      for (const team of await teams.listByClub(club.id)) list.push({ club, team });
    }

    let nextId = routeIds.teamId;
    if (!nextId && routeIds.matchId) {
      const loaded = await loadMatch(routeIds.matchId).catch(() => null);
      nextId = loaded?.match?.teamId || null;
    }
    const stored = readStoredTeam();
    if (!nextId && stored?.teamId) nextId = stored.teamId;
    if (!list.some((item) => item.team.id === nextId)) nextId = list[0]?.team.id || null;

    const nextSelected = list.find((item) => item.team.id === nextId);
    if (nextSelected) storeTeam(nextSelected);
    const perfil = await profile.get();
    setItems(list);
    setSelectedId(nextId);
    setLicencaClube(perfil?.licenca === 'clube');
    setLive(await findLiveMatch());
  }, [routeIds.matchId, routeIds.teamId]);

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
    { id: 'teams', label: t('nav.equipas') },
    { id: 'analysis', label: t('nav.analise') },
    ...(licencaClube ? [{ id: 'staff', label: t('nav.equipaTecnica') }] : []),
    { id: 'profile', label: t('nav.perfil') },
  ];

  function go(nextArea) {
    router.push(targetFor(nextArea, selected));
  }

  function trocarEscalao(teamId) {
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
      <aside className="mainnav mainnav--side" aria-label={t('nav.principal')}>
        <button className="mainnav__brand" type="button" onClick={() => go('teams')}>
          FutsalSubStats
        </button>
        <NavButtons items={navItems} active={area} onGo={go} />
        {live ? (
          <button className="mainnav__live" type="button" onClick={() => router.push(rotas.jogoAoVivo(live.id))}>
            {t('nav.jogoEmCurso')}
          </button>
        ) : null}
      </aside>

      <header className="mainnav-top">
        {showContext ? (
          <label className="context-picker">
            <span>{selected.club.shortName || selected.club.name}</span>
            <select
              value={selected.team.id}
              onChange={(e) => trocarEscalao(e.target.value)}
              aria-label={t('nav.trocarEscalao')}
            >
              {items.map((item) => (
                <option key={item.team.id} value={item.team.id}>
                  {item.team.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="mainnav-top__spacer" />
        )}
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
      aria-current={active === item.id ? 'page' : undefined}
      onClick={() => onGo(item.id)}
    >
      <Icon type={item.id} />
      <span>{item.label}</span>
    </button>
  ));
}
