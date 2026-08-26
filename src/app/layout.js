import './globals.css';
import Providers from './providers.jsx';
import AppBar from '@/components/AppBar.jsx';
import GuidedTutorial from '@/components/GuidedTutorial.jsx';

export const metadata = {
  title: 'FutsalSubStats',
  description: 'Acompanhamento de jogos de futsal em tempo real.',
  manifest: '/manifest.webmanifest',
  applicationName: 'FutsalSubStats',
  // No iPad, "Adicionar ao ecrã principal" abre a app em ecrã inteiro, sem a
  // barra do Safari a roubar altura ao campo.
  appleWebApp: {
    capable: true,
    title: 'FutsalSubStats',
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
            <AppBar />
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
