// Páginas de texto (guias, preços, versões ES/EN) — feitas para quem pesquisa
// no Google e para os motores de IA (AI Overviews, ChatGPT, Perplexity) terem
// uma página concreta para citar. A home é uma montra interativa; estas são
// texto corrido, renderizado no servidor, sem nada que dependa de JavaScript.

import Link from "next/link";

export const SITE_URL = "https://futsalsubstats.com";
export const APP_STORE_URL = "https://apps.apple.com/pt/app/futsal-substats/id6804845572";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.futsalsubstats.app";
export const WEB_APP_URL = "https://futsalsubstats.vercel.app";
export const CONTACT_EMAIL = "review.FutsalSubStats@gmail.com";

export type Section = { heading: string; paragraphs?: string[]; list?: string[] };
export type Faq = { question: string; answer: string };

export const GUIDE_LINKS = [
  { href: "/contar-minutos-futsal", label: "Controlar os minutos no futsal" },
  { href: "/estatisticas-futsal", label: "Estatísticas de futsal para treinadores" },
  { href: "/papel-excel-ou-app", label: "Papel, Excel ou app?" },
  { href: "/precos", label: "Preços" },
  { href: "/es/app-futbol-sala", label: "Español" },
  { href: "/en/futsal-stats-app", label: "English" },
] as const;

const UI = {
  pt: { home: "Página inicial", cta: "Experimentar a app", stores: "Disponível no iPhone, iPad, Android e no browser.", faq: "Perguntas frequentes", more: "Ler também", updated: "Atualizado a" },
  es: { home: "Inicio", cta: "Probar la app", stores: "Disponible en iPhone, iPad, Android y en el navegador.", faq: "Preguntas frecuentes", more: "Leer también", updated: "Actualizado el" },
  en: { home: "Home", cta: "Try the app", stores: "Available on iPhone, iPad, Android and in the browser.", faq: "Frequently asked questions", more: "Read next", updated: "Updated" },
} as const;

export function ArticlePage({
  lang = "pt",
  path,
  title,
  lead,
  sections,
  faq = [],
  children,
}: {
  lang?: keyof typeof UI;
  path: string;
  title: string;
  lead: string;
  sections: Section[];
  faq?: Faq[];
  children?: React.ReactNode;
}) {
  const ui = UI[lang];
  const updated = "2026-10-28";
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description: lead,
      inLanguage: lang,
      dateModified: updated,
      url: `${SITE_URL}${path}`,
      publisher: { "@type": "Organization", name: "Futsal SubStats", url: SITE_URL, logo: `${SITE_URL}/logo.png` },
      about: { "@type": "SoftwareApplication", name: "Futsal SubStats", url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Futsal SubStats", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: title, item: `${SITE_URL}${path}` },
      ],
    },
    ...(faq.length ? [{
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })),
    }] : []),
  ];

  return <main className="guide" lang={lang}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <header className="guide-header">
      <Link href="/" className="brand" aria-label="Futsal SubStats"><span className="brand-mark"><img src="/logo.png" alt="" width={36} height={36}/></span><span>Futsal <b>SubStats</b></span></Link>
      <Link href="/" className="guide-home">{ui.home}</Link>
    </header>
    <article className="guide-article">
      <h1>{title}</h1>
      <p className="guide-lead">{lead}</p>
      {sections.map((section) => <section key={section.heading}>
        <h2>{section.heading}</h2>
        {section.paragraphs?.map((p) => <p key={p}>{p}</p>)}
        {section.list && <ul>{section.list.map((item) => <li key={item}>{item}</li>)}</ul>}
      </section>)}
      {children}
      {faq.length > 0 && <section>
        <h2>{ui.faq}</h2>
        {faq.map((item) => <div className="guide-faq" key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></div>)}
      </section>}
      <div className="guide-cta">
        <Link className="button" href="/#try-demo">{ui.cta}</Link>
        <p>{ui.stores} <a href={APP_STORE_URL}>App Store</a> · <a href={PLAY_STORE_URL}>Google Play</a> · <a href={WEB_APP_URL}>Web</a></p>
      </div>
      <p className="guide-updated">{ui.updated} {updated}</p>
    </article>
    <nav className="guide-more" aria-label={ui.more}>
      <b>{ui.more}</b>
      {GUIDE_LINKS.filter((link) => link.href !== path).map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
    </nav>
  </main>;
}
