import './globals.css';
import { Suspense } from 'react';
import Providers from './providers.jsx';
import MainNavigation from '@/components/MainNavigation.jsx';
import GuidedTutorial from '@/components/GuidedTutorial.jsx';

export const metadata = {
  title: 'Futsal SubStats',
  description: 'Acompanhamento de jogos de futsal em tempo real.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Futsal SubStats',
  // No iPad, "Adicionar ao ecrã principal" abre a app em ecrã inteiro, sem a
  // barra do Safari a roubar altura ao campo.
  appleWebApp: {
    capable: true,
    title: 'Futsal SubStats',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b1120',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-PT">
      <body>
        <Providers>
          <div className="app" id="app">
            <Suspense fallback={null}>
              <MainNavigation />
            </Suspense>
            <main className="view" id="view">
              {children}
            </main>
            <GuidedTutorial />
          </div>
        </Providers>
      </body>
    </html>
  );
}
