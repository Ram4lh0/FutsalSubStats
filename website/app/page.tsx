"use client";

import { useEffect, useMemo, useState } from "react";
import { translations, type Language } from "./translations";

const CONTACT_EMAIL = "review.futsalsubstats@gmail.com";
// Add the public store URLs here when the apps are published.
const APP_STORE_URL: string | null = null;
const PLAY_STORE_URL: string | null = null;
// Onde a app vive. O botão de instalar leva aqui antes de explicar os passos:
// "Adicionar ao ecrã principal" guarda a página **em que a pessoa está**, por
// isso feito a partir deste site o que ficava no telemóvel era o site, não a app.
const APP_URL = "https://futsalsubstats.vercel.app";

const demoPlayers = {
  1: { number: 1, name: "Rui Almeida", role: "goalkeeper" },
  2: { number: 2, name: "Tiago Nunes", role: "wing" },
  4: { number: 4, name: "André Costa", role: "defender" },
  5: { number: 5, name: "Pedro Lima", role: "leftWing" },
  6: { number: 6, name: "João Marques", role: "rightWing" },
  7: { number: 7, name: "Miguel Faria", role: "universal" },
  8: { number: 8, name: "Bruno Serra", role: "defender" },
  9: { number: 9, name: "Nuno Teixeira", role: "pivot" },
} as const;
type DemoPlayerNumber = keyof typeof demoPlayers;

const fieldPositions = [
  { x: 14, y: 50 },
  { x: 38, y: 50 },
  { x: 64, y: 26 },
  { x: 64, y: 74 },
  { x: 87, y: 50 },
] as const;
const initialOnCourt: DemoPlayerNumber[] = [1, 4, 5, 6, 9];
const initialBench: DemoPlayerNumber[] = [2, 7, 8];
const initialTimes: Record<DemoPlayerNumber, number> = { 1: 436, 2: 214, 4: 401, 5: 378, 6: 329, 7: 187, 8: 153, 9: 352 };

type IconName = "clock" | "swap" | "chart" | "folder" | "wifi" | "shield" | "mail" | "check" | "arrow" | "globe" | "ball" | "share" | "dots" | "apple" | "android";
function Icon({ name }: { name: IconName }) {
  const paths = {
    clock: <><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>,
    swap: <><path d="M7 7h11l-3-3M17 17H6l3 3"/><path d="m18 7-3 3M6 17l3-3"/></>,
    chart: <><path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3 19h18"/></>,
    folder: <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/>,
    wifi: <><path d="M4 9a12 12 0 0 1 16 0M7 13a7.5 7.5 0 0 1 10 0M10.5 16.5a2.3 2.3 0 0 1 3 0"/><circle cx="12" cy="19" r=".7" fill="currentColor" stroke="none"/><path d="m4 4 16 16"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6z"/><path d="m9.5 12 1.6 1.6 3.8-4"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>,
    check: <path d="m5 12 4 4L19 6"/>, arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
    ball: <><circle cx="12" cy="12" r="9"/><path d="m12 8 3 2-1 4h-4l-1-4zM12 8V3M15 10l4-2M14 14l3 4M10 14l-3 4M9 10 5 8"/></>,
    // O botão de partilha do iOS e o menu de três pontos do Android, desenhados
    // como a pessoa os vê no telemóvel. Uma seta para cima a sair de uma caixa,
    // e três pontos na vertical: é por isto que ela tem de procurar.
    share: <><path d="M12 15V3m0 0L8.5 6.5M12 3l3.5 3.5"/><path d="M7 11H5v10h14V11h-2"/></>,
    dots: <><circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/></>,
    apple: <path d="M15.5 3c.2 1.3-.3 2.5-1 3.3-.8.9-1.9 1.5-3 1.4-.2-1.2.4-2.5 1.1-3.3.8-.9 2.1-1.5 2.9-1.4M18.6 16.4c-.5 1.2-.8 1.7-1.5 2.7-1 1.4-2.3 3.2-4 3.2-1.5 0-1.9-1-3.9-1-2 0-2.5 1-4 1-1.7 0-2.9-1.6-3.9-3-2.8-4-3.1-8.7-1.4-11.2 1.2-1.8 3.1-2.8 4.9-2.8 1.8 0 3 1 4.5 1 1.5 0 2.4-1 4.5-1 1.6 0 3.2.9 4.4 2.4-3.9 2.1-3.2 7.6.4 8.7"/>,
    android: <><path d="M6 11h12v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z"/><path d="M6 11a6 6 0 0 1 12 0"/><path d="m8 5 1.2 2M16 5l-1.2 2"/><path d="M3.5 12v4M20.5 12v4M10 19v2.5M14 19v2.5"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function LiveMatch({ t }: { t: (typeof translations)[Language] }) {
  const initialClock = 9 * 60 + 42;
  const [seconds, setSeconds] = useState(initialClock);
  const [running, setRunning] = useState(true);
  const [homeGoals, setHomeGoals] = useState(2);
  const [awayGoals, setAwayGoals] = useState(1);
  const [onCourt, setOnCourt] = useState<DemoPlayerNumber[]>(initialOnCourt);
  const [onBench, setOnBench] = useState<DemoPlayerNumber[]>(initialBench);
  const [playerTimes, setPlayerTimes] = useState<Record<DemoPlayerNumber, number>>(initialTimes);
  const [enteredAt, setEnteredAt] = useState<Record<number, number>>({ 1: -148, 4: -133, 5: -94, 6: -94, 9: -121 });
  const [exitedAt, setExitedAt] = useState<Record<number, number>>({});
  const [selectedField, setSelectedField] = useState<DemoPlayerNumber | null>(null);
  const [selectedBench, setSelectedBench] = useState<DemoPlayerNumber | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!running || seconds <= 0) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => value - 1);
      setPlayerTimes((current) => {
        const next = { ...current };
        onCourt.forEach((number) => { next[number] += 1; });
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, seconds, onCourt]);
  const elapsed = initialClock - seconds;
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const formatDuration = (value: number) => `${String(Math.floor(Math.max(0, value) / 60)).padStart(2, "0")}:${String(Math.max(0, value) % 60).padStart(2, "0")}`;
  const swapPlayers = (outgoing: DemoPlayerNumber, incoming: DemoPlayerNumber) => {
    setOnCourt((current) => current.map((number) => number === outgoing ? incoming : number));
    setOnBench((current) => current.map((number) => number === incoming ? outgoing : number));
    setEnteredAt((current) => ({ ...current, [incoming]: elapsed }));
    setExitedAt((current) => ({ ...current, [outgoing]: elapsed }));
    setNotice(`${demoPlayers[incoming].name} ${t.demo.enters} ${demoPlayers[outgoing].name}`);
    setSelectedField(null);
    setSelectedBench(null);
    window.setTimeout(() => setNotice(""), 1600);
  };
  const chooseField = (outgoing: DemoPlayerNumber) => {
    if (selectedBench) { swapPlayers(outgoing, selectedBench); return; }
    setSelectedField(outgoing);
    setSelectedBench(null);
    setNotice(t.demo.pickBench);
  };
  const chooseBench = (incoming: DemoPlayerNumber) => {
    if (selectedField) { swapPlayers(selectedField, incoming); return; }
    setSelectedBench(incoming);
    setSelectedField(null);
    setNotice(t.demo.pickField);
  };
  return <div className="match-window" aria-label={t.demo.label}>
    <div className="match-topbar"><span className="live-dot"><i /> {t.demo.live}</span><div className="match-score"><span className="score-team"><small>CAP</small><span className="score-stepper"><button type="button" aria-label={t.demo.decreaseHome} onClick={() => setHomeGoals((value) => Math.max(0, value - 1))}>−</button><b>{homeGoals}</b><button type="button" aria-label={t.demo.increaseHome} onClick={() => setHomeGoals((value) => value + 1)}>+</button></span></span><em>—</em><span className="score-team"><small>ADV</small><span className="score-stepper"><button type="button" aria-label={t.demo.decreaseAway} onClick={() => setAwayGoals((value) => Math.max(0, value - 1))}>−</button><b>{awayGoals}</b><button type="button" aria-label={t.demo.increaseAway} onClick={() => setAwayGoals((value) => value + 1)}>+</button></span></span></div><button className="icon-button" type="button" aria-label={t.demo.undo}>↶</button></div>
    <div className="timer-row"><div><small>{t.demo.part}</small><strong>{time}</strong></div><button type="button" className={`timer-control ${running ? "pause" : "play"}`} onClick={() => setRunning(!running)}><span>{running ? "Ⅱ" : "▶"}</span>{running ? t.demo.pause : t.demo.resume}</button></div>
    <div className="court"><span className="half-line"/><span className="center-circle"/><span className="area left"/><span className="area right"/>
      {onCourt.map((number, index) => { const player = demoPlayers[number]; const position = fieldPositions[index]; const role = t.demo.roles[player.role]; return <button key={number} type="button" className={`field-player-card ${selectedField === number ? "selected" : ""} ${selectedBench ? "ready" : ""}`} style={{ left:`${position.x}%`, top:`${position.y}%` }} onClick={() => chooseField(number)} aria-label={`${player.name}, ${role}`}>
        <span className="player-card-top"><b>{player.number}</b><small>{role}</small><i>●</i></span>
        <strong>{player.name}</strong>
        <span className="player-time">{t.demo.totalTime} <b>{formatDuration(playerTimes[number])}</b></span>
        <span className="player-status">{t.demo.playingFor} {formatDuration(elapsed - (enteredAt[number] ?? elapsed))}</span>
      </button>; })}
      <div className={`swap-notice ${notice ? "show" : ""}`}>{notice}</div>
    </div>
    <div className="bench-label"><span>{t.demo.bench}</span><small>{t.demo.tap}</small></div>
    <div className="bench-list">{onBench.map((number) => { const player = demoPlayers[number]; const role = t.demo.roles[player.role]; return <button key={number} type="button" onClick={() => chooseBench(number)} className={`${selectedField ? "ready" : ""} ${selectedBench === number ? "selected" : ""}`} aria-label={`${player.number} ${player.name}, ${role}`}>
      <span className="bench-card-top"><b>{player.number}</b><small>{role}</small></span><strong>{player.name}</strong>
      <span className="bench-time">{t.demo.totalTime} <b>{formatDuration(playerTimes[number])}</b></span>
      <span className={exitedAt[number] === undefined ? "bench-status muted" : "bench-status"}>{exitedAt[number] === undefined ? t.demo.notEntered : `${t.demo.leftAgo} ${formatDuration(elapsed - exitedAt[number])}`}</span>
    </button>; })}</div>
  </div>;
}

/**
 * O sistema do aparelho, ou nada.
 *
 * Não é para servir conteúdo diferente — é só para poupar uma pergunta a quem
 * está no telemóvel. Se falhar, cai no chooser, que funciona sempre.
 *
 * O iPad é o caso chato: desde o iPadOS 13 diz-se Macintosh. Distingue-se por
 * ter toque, que um Mac a sério não tem.
 */
function detectarSistema(): "ios" | "android" | null {
  if (typeof window === "undefined") return null;
  const ua = window.navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1) return "ios";
  return null;
}

function InstallDialog({ t, onClose }: { t: (typeof translations)[Language]; onClose: () => void }) {
  const c = t.install;
  // Começa no que o aparelho disser. A `null` é o ecrã de escolha — num
  // computador é sempre onde se começa, porque não há nada para adivinhar.
  const [sistema, setSistema] = useState<"ios" | "android" | null>(() => detectarSistema());
  const detectado = useMemo(() => detectarSistema() !== null, []);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onClose]);

  const passos = sistema === "ios" ? c.iosSteps : c.androidSteps;

  return <div className="install-backdrop" onClick={onClose} role="presentation">
    <div className="install-modal" role="dialog" aria-modal="true" aria-label={c.title} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="install-close" onClick={onClose} aria-label={c.close}>×</button>
      <h3>{c.title}</h3>
      <p>{sistema ? c.intro : c.chooseHint}</p>

      {!sistema ? <>
        <div className="install-choice">
          <button type="button" onClick={() => setSistema("ios")}><Icon name="apple"/>{c.iphone}</button>
          <button type="button" onClick={() => setSistema("android")}><Icon name="android"/>{c.android}</button>
        </div>
      </> : <>
        {/* O ícone que ela tem de procurar, à escala a que aparece no telemóvel.
            Vale mais do que a frase que o descreve. */}
        <div className="install-glyph">
          <Icon name={sistema === "ios" ? "share" : "dots"}/>
          <span>{passos[1]}</span>
        </div>
        <ol className="install-steps">{passos.map((passo) => <li key={passo}>{passo}</li>)}</ol>
        <a className="button" href={APP_URL} target="_blank" rel="noreferrer">{c.openApp}<Icon name="arrow"/></a>
        <p className="install-note">{c.openHint}</p>
        <p className="install-note">{c.offlineNote}</p>
        {/* Sempre disponível, mesmo quando acertámos: o telemóvel onde a pessoa
            quer a app pode não ser aquele em que está a ler isto. */}
        <button type="button" className="install-back" onClick={() => setSistema(null)}>
          {detectado ? c.wrongDevice : c.chooseTitle}
        </button>
      </>}
    </div>
  </div>;
}

export default function Home() {
  const [lang, setLang] = useState<Language>("pt");
  const [menuOpen, setMenuOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const t = useMemo(() => translations[lang], [lang]);
  useEffect(() => {
    const saved = window.localStorage.getItem("futsal-language") as Language | null;
    if (!saved || !translations[saved]) return;
    const frame = window.requestAnimationFrame(() => setLang(saved));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; window.localStorage.setItem("futsal-language", lang); }, [lang]);
  useEffect(() => { const observer = new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add("visible")), { threshold:.12 }); document.querySelectorAll(".reveal").forEach((el) => observer.observe(el)); return () => observer.disconnect(); }, [lang]);
  const emailHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t.contact.subject)}&body=${encodeURIComponent(t.contact.body)}`;
  // Enquanto não houver lojas, instalar é adicionar ao ecrã principal — e isso
  // explica-se, não se faz por link. Quando as lojas existirem, a constante
  // deixa de ser `null` e o botão passa a levar lá directamente.
  const handleInstall = () => {
    const storeUrl = /Android/i.test(window.navigator.userAgent) ? PLAY_STORE_URL : APP_STORE_URL;
    if (storeUrl) { window.location.href = storeUrl; return; }
    setInstallOpen(true);
  };

  return <main>
    <header className="site-header">
      <a href="#top" className="brand" aria-label="FutsalSubStats"><span className="brand-mark"><Icon name="ball"/></span><span>Futsal<b>SubStats</b></span></a>
      <nav className={menuOpen ? "open" : ""} aria-label={t.nav.label}><a href="#try-demo" onClick={() => setMenuOpen(false)}>{t.nav.tryHere}</a><a href="#features" onClick={() => setMenuOpen(false)}>{t.nav.features}</a><a href="#licenses" onClick={() => setMenuOpen(false)}>{t.nav.licenses}</a><a href="#contact" onClick={() => setMenuOpen(false)}>{t.nav.contact}</a></nav>
      <div className="header-actions"><label className="language-select"><span className="sr-only">{t.nav.language}</span><Icon name="globe"/><select aria-label={t.nav.language} value={lang} onChange={(e) => setLang(e.target.value as Language)}><option value="pt">PT</option><option value="en">EN</option><option value="es">ES</option></select></label><button type="button" className="button small header-install" onClick={handleInstall}>{t.nav.install}</button><button className="menu-button" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label={t.nav.menu}><span/><span/></button></div>
    </header>

    <section className="hero" id="top"><div className="hero-grid" aria-hidden="true"/><div className="hero-glow glow-one"/><div className="hero-glow glow-two"/>
      <div className="hero-copy reveal"><div className="eyebrow"><i/> {t.hero.eyebrow}</div><h1>{t.hero.titleStart} <span>{t.hero.titleHighlight}</span></h1><p>{t.hero.description}</p><div className="hero-actions"><a className="button" href="#experience">{t.hero.primary}<Icon name="arrow"/></a><a className="text-link" href="#licenses">{t.hero.secondary}<span>↓</span></a></div><div className="hero-proof"><span><Icon name="wifi"/>{t.hero.proofOffline}</span><span><Icon name="shield"/>{t.hero.proofPrivacy}</span><span><Icon name="globe"/>PT · EN · ES</span></div></div>
      <div className="hero-visual reveal" id="try-demo"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="try-callout"><span>↘</span><div><b>{t.demo.tryTitle}</b><small>{t.demo.tryText}</small></div></div><div className="device-shell"><div className="device-camera"/><LiveMatch t={t}/></div></div>
      <a className="scroll-cue" href="#experience"><span/>{t.hero.scroll}</a>
    </section>

    <section className="statement reveal" id="experience"><p>{t.statement.kicker}</p><h2>{t.statement.title} <span>{t.statement.highlight}</span></h2></section>

    <section className="feature-story" id="features"><div className="section-heading reveal"><span className="section-number">01</span><div><p>{t.features.kicker}</p><h2>{t.features.title}</h2></div><p className="section-intro">{t.features.intro}</p></div>
      <div className="feature-grid">{(["swap","clock","ball","clock","swap"] as IconName[]).map((icon,index) => { const item=t.features.items[index]; return <article className={`feature-card reveal card-${index+1}`} key={item.title}><span className="feature-icon"><Icon name={icon}/></span><span className="feature-tag">{item.tag}</span><h3>{item.title}</h3><p>{item.text}</p></article>; })}</div>
    </section>

    <section className="results-section"><div className="results-copy reveal"><span className="section-number">02</span><p>{t.results.kicker}</p><h2>{t.results.title}</h2><p>{t.results.intro}</p><ul>{t.results.points.map((point) => <li key={point}><Icon name="check"/>{point}</li>)}</ul></div>
      <div className="stats-panel reveal"><div className="panel-bar"><div><i/><i/><i/></div><span>{t.results.season}</span><small>{t.results.export}</small></div><div className="stats-head"><div><small>{t.results.games}</small><b>18</b></div><div className="record-stat"><small>V / E / D</small><b>12 / 2 / 4</b></div><div><small>{t.results.goals}</small><b>74</b></div></div><div className="player-table-scroll"><div className="player-table"><div className="table-header"><span>Nº</span><span>{t.results.player}</span><span>{t.results.goalsShort}</span><span>{t.results.assists}</span><span>{t.results.goalPart}</span><span>{t.results.concededPart}</span><span>{t.results.cards}</span><span>{t.results.entries}</span><span>{t.results.average}</span></div>{[["4","André Costa","16","11","44","19","3","09","31:42"],["5","Pedro Lima","14","07","39","22","2","08","28:19"],["9","Nuno Teixeira","11","12","35","17","1","07","26:55"],["2","Tiago Nunes","08","04","28","15","4","06","22:16"]].map((row,index) => <div className="table-row" key={row[1]}>{row.map((value,column) => column===0?<span className="jersey" key={column}>{value}</span>:column===1?<b key={column}>{value}</b>:<span className={column===8?"mono":""} key={column}>{value}</span>)}<i style={{width:`${88-index*13}%`}}/></div>)}</div></div></div>
    </section>

    <section className="offline-section" id="offline"><div className="offline-glow"/><div className="offline-visual reveal"><div className="signal-rings"><i/><i/><i/></div><div className="offline-device"><span className="offline-notch"/><span className="offline-icon"><Icon name="wifi"/><b>{t.offline.local}</b></span><small>{t.offline.device}</small></div><div className="sync-path"><i/><i/><i/></div><div className="data-card data-one"><Icon name="folder"/><span><b>{t.offline.saved}</b><small>{t.offline.device}</small></span><Icon name="check"/></div><div className="data-card data-two"><Icon name="chart"/><span><b>{t.offline.synced}</b><small>{t.offline.connection}</small></span><Icon name="check"/></div></div><div className="offline-copy reveal"><span className="section-number">03</span><p>{t.offline.kicker}</p><h2>{t.offline.title}</h2><p>{t.offline.text}</p><div className="offline-detail"><Icon name="shield"/><div><b>{t.offline.privacyTitle}</b><span>{t.offline.privacyText}</span></div></div></div></section>

    <section className="licenses" id="licenses"><div className="section-heading centered reveal"><span className="section-number">04</span><div><p>{t.licenses.kicker}</p><h2>{t.licenses.title}</h2></div><p className="section-intro">{t.licenses.intro}</p></div><div className="pricing-grid">{(["coach","club"] as const).map((type) => { const plan=t.licenses[type]; return <article className={`price-card reveal ${type==="club"?"featured":""}`} key={type}>{type==="club"&&<span className="recommended">{t.licenses.recommended}</span>}<p>{plan.label}</p><h3>{plan.name}</h3><p className="plan-description">{plan.description}</p><ul>{plan.features.map((f)=><li key={f}><Icon name="check"/>{f}</li>)}</ul><a className="button" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${t.licenses.request}: ${plan.name}`)}`}>{t.licenses.request}<Icon name="arrow"/></a></article>; })}</div><div className="trial-note reveal"><span><Icon name="ball"/></span><div className="trial-copy"><b>{t.licenses.trialTitle}</b><p>{t.licenses.trialText}</p></div><div className="install-action"><button type="button" className="button" onClick={handleInstall}>{t.licenses.installNow}<Icon name="arrow"/></button></div></div></section>

    <section className="contact-section" id="contact"><div className="contact-card reveal"><div><p>{t.contact.kicker}</p><h2>{t.contact.title}</h2><span>{t.contact.text}</span></div><a className="button" href={emailHref}><Icon name="mail"/>{t.contact.button}</a><small>{CONTACT_EMAIL}</small></div></section>
    <section className="faq-section"><div className="faq-heading reveal"><p>{t.faq.kicker}</p><h2>{t.faq.title}</h2></div><div className="faq-list reveal">{t.faq.items.map((item)=><details key={item.question}><summary>{item.question}<span>+</span></summary><p>{item.answer}</p></details>)}</div></section>
    {installOpen && <InstallDialog t={t} onClose={() => setInstallOpen(false)}/>}
    <footer><a href="#top" className="brand" aria-label="FutsalSubStats"><span className="brand-mark"><Icon name="ball"/></span><span>Futsal<b>SubStats</b></span></a><p>{t.footer.tagline}</p><div><a href={`mailto:${CONTACT_EMAIL}`}>{t.nav.contact}</a><a href="#licenses">{t.nav.licenses}</a><span>© 2026 FutsalSubStats</span></div></footer>
  </main>;
}
