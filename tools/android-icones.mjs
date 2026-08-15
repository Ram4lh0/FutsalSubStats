// tools/android-icones.mjs — os ícones e o arranque da app Android.
//
// Porque existe: o `cap add android` deixa lá o logótipo do Capacitor e um
// ecrã de arranque branco. Numa app de tema escuro, o branco dá um clarão a
// cada abertura — e o logótipo de outra pessoa é pior do que nenhum.
//
// Porque é um script e não uns cliques no Android Studio: o Android quer o mesmo
// ícone em cinco tamanhos, o primeiro plano noutros cinco, e onze ecrãs de
// arranque de proporções diferentes. Vinte e um ficheiros feitos à mão saem
// desalinhados; feitos aqui, saem todos do mesmo desenho e voltam a sair iguais
// no dia em que o ícone mudar.
//
// A geometria do ícone adaptável, que é o que engana toda a gente: o primeiro
// plano tem 108 dp de lado, mas o sistema só garante que se vê o quadrado
// central de 72 dp — o resto pode ser cortado em círculo, em quadrado ou no
// formato que o fabricante quiser. Por isso o campo é desenhado dentro desses
// 66%, com margem de sobra.
//
//   node tools/android-icones.mjs
//
// Precisa do `sharp`, que já vem com o Next.js. Se não estiver lá:
//   npm i -D sharp

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const RES = join(RAIZ, 'android', 'app', 'src', 'main', 'res');

const FUNDO = '#0b1220'; // o mesmo fundo da app
const RELVA = '#12331f';
const LINHA = '#22c55e';
const BOLA = '#e8fdf0';

/* ------------------------------------------------------------ o desenho */

/**
 * O campo, em SVG, dentro de uma caixa quadrada de `lado`.
 *
 * `escala` é a fração da caixa que o campo ocupa. Para o primeiro plano do
 * ícone adaptável usa-se 0.62, que deixa o desenho inteiro dentro do quadrado
 * central de 72/108 mesmo depois de o sistema o cortar em círculo.
 */
function campoSvg(lado, escala, comFundo) {
  const larg = lado * escala;
  const alt = larg * 0.78;
  const x = (lado - larg) / 2;
  const y = (lado - alt) / 2;
  const traco = Math.max(2, larg * 0.028);
  const cx = lado / 2;
  const cy = lado / 2;
  const rCirculo = alt * 0.21;
  const rBola = alt * 0.082;
  const cantos = larg * 0.03;

  const fundo = comFundo
    ? `<rect width="${lado}" height="${lado}" rx="${lado * 0.22}" fill="${FUNDO}"/>`
    : '';

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}">
    ${fundo}
    <rect x="${x}" y="${y}" width="${larg}" height="${alt}" rx="${cantos}"
          fill="${RELVA}" stroke="${LINHA}" stroke-width="${traco}"/>
    <line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + alt}"
          stroke="${LINHA}" stroke-width="${traco}"/>
    <circle cx="${cx}" cy="${cy}" r="${rCirculo}"
            fill="none" stroke="${LINHA}" stroke-width="${traco}"/>
    <circle cx="${cx}" cy="${cy}" r="${rBola}" fill="${BOLA}"/>
  </svg>`);
}

/** O ecrã de arranque: o campo pequeno, ao centro, sobre o fundo da app. */
function arranqueSvg(larg, alt) {
  const lado = Math.min(larg, alt) * 0.34;
  const x = (larg - lado) / 2;
  const y = (alt - lado) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${larg}" height="${alt}">
    <rect width="${larg}" height="${alt}" fill="${FUNDO}"/>
    <svg x="${x}" y="${y}" width="${lado}" height="${lado}"
         viewBox="0 0 ${lado} ${lado}">
      ${campoSvg(lado, 0.9, false).toString().replace(/<\/?svg[^>]*>/g, '')}
    </svg>
  </svg>`);
}

/* ------------------------------------------------------------ os ficheiros */

// 48 dp para o ícone, 108 dp para o primeiro plano. Os números são esses
// tamanhos multiplicados pela densidade de cada pasta.
const DENSIDADES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];

const ARRANQUES = [
  ['drawable', 480, 320],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
];

async function principal() {
  let feitos = 0;

  for (const [nome, fator] of DENSIDADES) {
    const dir = join(RES, `mipmap-${nome}`);
    mkdirSync(dir, { recursive: true });

    const icone = Math.round(48 * fator);
    const frente = Math.round(108 * fator);

    // Ícone antigo (quadrado com cantos) — para versões anteriores ao Android 8,
    // e para os sítios onde o sistema não usa o adaptável.
    await sharp(campoSvg(icone, 0.66, true)).png().toFile(join(dir, 'ic_launcher.png'));

    // Redondo: os lançadores da Samsung e outros pedem-no à parte.
    const raio = icone / 2;
    const mascara = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${icone}" height="${icone}">
        <circle cx="${raio}" cy="${raio}" r="${raio}" fill="#fff"/>
      </svg>`
    );
    await sharp(campoSvg(icone, 0.62, true))
      .composite([{ input: mascara, blend: 'dest-in' }])
      .png()
      .toFile(join(dir, 'ic_launcher_round.png'));

    // Primeiro plano do adaptável: sem fundo — quem o desenha é a camada de
    // trás, e é isso que deixa o sistema animar as duas em separado.
    await sharp(campoSvg(frente, 0.62, false))
      .png()
      .toFile(join(dir, 'ic_launcher_foreground.png'));

    feitos += 3;
  }

  for (const [pasta, larg, alt] of ARRANQUES) {
    const dir = join(RES, pasta);
    mkdirSync(dir, { recursive: true });
    await sharp(arranqueSvg(larg, alt)).png().toFile(join(dir, 'splash.png'));
    feitos += 1;
  }

  // A cor de trás do ícone adaptável. Vinha a branco, que numa app escura dá um
  // anel claro à volta do campo em metade dos lançadores.
  writeFileSync(
    join(RES, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${FUNDO}</color>
</resources>
`
  );
  feitos += 1;

  console.log(`✓ Android: ${feitos} ficheiros de ícone e arranque gerados.`);
}

principal().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
