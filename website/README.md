# FutsalSubStats — website

Landing page responsiva da aplicação FutsalSubStats, com demonstração interativa de um jogo, apresentação das funcionalidades, modo offline, estatísticas, licenças e contactos.

## Desenvolvimento local

Requisitos:

- Node.js 22.13 ou superior
- npm

```bash
npm install
npm run dev
```

## Validação e build

```bash
npm run lint
npm run build
```

O build produz o artefacto de produção em `dist/`, preparado para um runtime Cloudflare Worker.

## Estrutura principal

- `app/page.tsx` — conteúdo e interações da landing page
- `app/translations.ts` — textos em português, inglês e espanhol
- `app/globals.css` — design e comportamento responsivo
- `public/` — ícones e imagem de partilha

Não utiliza base de dados nem autenticação. Todo o conteúdo desta landing page é frontend.
