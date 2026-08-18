import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://futsal-sub-stats.vercel.app"),
  title: "FutsalSubStats: cada segundo em campo, contado",
  description: "Aponta substituições, golos e faltas. O FutsalSubStats conta automaticamente o tempo de cada jogador, mesmo sem internet.",
  applicationName: "FutsalSubStats",
  openGraph: {
    title: "FutsalSubStats: cada segundo em campo, contado",
    description: "O tempo de jogo de cada jogador, sem depender da memória e mesmo sem internet.",
    type: "website", locale: "pt_PT", siteName: "FutsalSubStats",
    images: [{ url: "/og-card.svg", width: 1200, height: 630, alt: "FutsalSubStats, cronómetro e campo de futsal" }],
  },
  twitter: { card: "summary_large_image", title: "FutsalSubStats: cada segundo em campo, contado", description: "O tempo de jogo de cada jogador, mesmo sem internet.", images: ["/og-card.svg"] },
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt"><body>{children}</body></html>;
}
