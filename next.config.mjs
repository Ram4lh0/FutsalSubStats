/**
 * O Next produz ficheiros soltos, sem servidor.
 *
 * Duas razões, e a segunda é a que manda:
 *
 * 1. Na Vercel continua a funcionar tal e qual — a app é toda do lado do
 *    cliente, nunca houve nada a acontecer no servidor.
 * 2. É o que permite pôr a app dentro do iPad. Um ficheiro só pode ser escrito
 *    para um endereço conhecido na altura de compilar, e é por isso que os ids
 *    do clube, do escalão e do jogo viajam na barra de endereço em vez do
 *    caminho (ver src/lib/routes.js).
 *
 * `trailingSlash` faz cada página nascer como `pasta/index.html`, que é a forma
 * que um sistema de ficheiros sabe servir sem ninguém a decidir por ele.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
