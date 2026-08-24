import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://futsal-sub-stats.vercel.app"),
  title: "FutsalSubStats: minutos e estatísticas para treinadores de futsal",
  description: "Regista substituições, golos, faltas e cartões em poucos toques. O tempo de cada jogador fica contado, mesmo sem rede no pavilhão.",
  applicationName: "FutsalSubStats",
  openGraph: {
    title: "FutsalSubStats: minutos e estatísticas para treinadores de futsal",
    description: "Substituições, tempo em campo e estatísticas por jogador, mesmo sem internet.",
    type: "website", locale: "pt_PT", siteName: "FutsalSubStats",
    images: [{ url: "/og-card.svg", width: 1200, height: 630, alt: "FutsalSubStats, cronómetro e campo de futsal" }],
  },
  twitter: { card: "summary_large_image", title: "FutsalSubStats: minutos e estatísticas para treinadores de futsal", description: "Substituições, tempo em campo e estatísticas por jogador, mesmo sem internet.", images: ["/og-card.svg"] },
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt"><body>{children}</body></html>;
}
