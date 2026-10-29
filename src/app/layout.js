// Os estilos estavam todos num globals.css de 4 mil linhas; agora vivem em
// src/app/estilos/, um ficheiro por zona. A ordem conta (a cascata é a mesma
// de antes): o que vem depois ganha ao que vem antes, com a mesma
// especificidade.
import './estilos/01-base.css';
import './estilos/02-componentes.css';
import './estilos/03-tabelas-e-formularios.css';
import './estilos/04-jogo-ao-vivo.css';
import './estilos/05-modais-e-responsivo.css';
import './estilos/06-painel-e-impressao.css';
import './estilos/07-treino.css';
import './estilos/08-registos-e-extras.css';
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
