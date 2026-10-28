import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://futsalsubstats.com"),
  alternates: { canonical: "/" },
  title: "Futsal SubStats: minutos e estatísticas para treinadores de futsal",
  description: "Regista substituições, golos, faltas e cartões em poucos toques. O tempo de cada jogador fica contado, mesmo sem rede no pavilhão.",
  applicationName: "Futsal SubStats",
  openGraph: {
    title: "Futsal SubStats: minutos e estatísticas para treinadores de futsal",
    description: "Substituições, tempo em campo e estatísticas por jogador, mesmo sem internet.",
    type: "website", locale: "pt_PT", siteName: "Futsal SubStats",
    images: [{ url: "/og-card.svg", width: 1200, height: 630, alt: "Futsal SubStats, cronómetro e campo de futsal" }],
  },
  twitter: { card: "summary_large_image", title: "Futsal SubStats: minutos e estatísticas para treinadores de futsal", description: "Substituições, tempo em campo e estatísticas por jogador, mesmo sem internet.", images: ["/og-card.svg"] },
  other: { "codex-preview": "development" },
  icons: { icon: "/logo.png", shortcut: "/logo.png", apple: "/logo.png" },
};

// Dados estruturados (schema.org) para o Google e os motores de IA saberem que
// "Futsal SubStats" é uma app, quanto custa, onde se instala e quem a faz.
const SITE_URL = "https://futsalsubstats.com";
const offer = (name: string, price: string, description: string) => ({
  "@type": "Offer", name, price, priceCurrency: "EUR", description,
  priceSpecification: { "@type": "UnitPriceSpecification", price, priceCurrency: "EUR", valueAddedTaxIncluded: false, unitText: "época" },
  url: `${SITE_URL}/precos`, availability: "https://schema.org/InStock",
});
const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "Futsal SubStats",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    email: "review.FutsalSubStats@gmail.com",
    foundingLocation: { "@type": "Place", name: "Portugal" },
    sameAs: [
      "https://apps.apple.com/pt/app/futsal-substats/id6804845572",
      "https://play.google.com/store/apps/details?id=com.futsalsubstats.app",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: "Futsal SubStats",
    url: SITE_URL,
    inLanguage: ["pt", "es", "en"],
    publisher: { "@id": `${SITE_URL}/#organization` },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#app`,
    name: "Futsal SubStats",
    alternateName: ["FutsalSubStats", "Futsal Sub Stats"],
    description: "App para treinadores de futsal registarem substituições, golos, assistências, faltas, cartões e perdas de bola durante o jogo e verem os minutos e as estatísticas de cada jogador. Funciona sem internet.",
    applicationCategory: "SportsApplication",
    operatingSystem: "iOS, iPadOS, Android, Web",
    inLanguage: ["pt", "es", "en"],
    url: SITE_URL,
    image: `${SITE_URL}/logo.png`,
    installUrl: ["https://apps.apple.com/pt/app/futsal-substats/id6804845572", "https://play.google.com/store/apps/details?id=com.futsalsubstats.app"],
    featureList: [
      "Substituições com um toque e minutos por jogador",
      "Cronómetro com tempo parado ou corrido por escalão",
      "Golos, assistências, faltas, cartões e perdas de bola",
      "Expulsões com tempo de castigo e guarda-redes avançado (5x4)",
      "Funciona sem internet e sincroniza depois",
      "Painéis de equipa e de jogador, exportação Excel/CSV e PDF",
      "Licença de clube com vários escalões e treinadores",
    ],
    publisher: { "@id": `${SITE_URL}/#organization` },
    offers: [
      offer("Treinador", "35.00", "Um treinador e um escalão, por época. Primeiro mês gratuito."),
      offer("Personalizado de Treinador", "60.00", "Licença de treinador com estatísticas personalizadas e acompanhamento individual, por época."),
      offer("Clube", "89.99", "Até cinco escalões e vários treinadores, por época. Preço com desconto (antes 129€)."),
      offer("Personalizado", "209.99", "Licença Clube com estatísticas e dashboards personalizados e acompanhamento individual, por época. Preço com desconto (antes 299€)."),
    ],
  },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt"><body>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    {children}
  </body></html>;
}
