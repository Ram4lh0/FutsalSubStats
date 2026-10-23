// lib/routes.js — todos os endereços da app, num sítio só.
//
// Porque é que os ids vão em parâmetros e não no caminho:
//
// Para a app poder viver dentro do iPad em vez de ir buscar o site a cada
// abertura, o Next tem de produzir ficheiros soltos, sem servidor. E um ficheiro
// só pode ser escrito para um endereço que se conheça na altura de compilar.
// `/matches/a3f9…/live` não se conhece — o identificador nasce quando se cria o
// jogo. `/match/live?m=a3f9…` conhece-se: é sempre o mesmo ficheiro, e o id
// chega-lhe pela pergunta.
//
// A regra: nenhum endereço é escrito à mão no resto do código. Todos saem daqui.
// Assim mudar a forma dos endereços é mexer neste ficheiro, e o verificador
// `tools/check-routes.mjs` avisa quem se esquecer.

/** Os nomes dos parâmetros, curtos porque aparecem na barra de endereço. */
export const PARAM = {
  club: 'c',
  team: 't',
  match: 'm',
  player: 'p',
  competition: 'k',
  training: 'ts',
  play: 'j',
  // O token do link público de uma jogada. Não é um id da base: é a chave que
  // abre aquela jogada a quem não tem conta.
  share: 's',
};

function comIds(base, ids = {}) {
  const q = new URLSearchParams();
  for (const [chave, nome] of Object.entries(PARAM)) {
    const valor = ids[chave];
    if (valor) q.set(nome, valor);
  }
  const texto = q.toString();
  return texto ? `${base}?${texto}` : base;
}

export const rotas = {
  raiz: () => '/',
  jogo: () => '/jogo',
  login: () => '/login',
  dashboard: () => '/dashboard',
  conta: () => '/account',
  equipaTecnica: () => '/staff',
  tutorial: () => '/tutorial',
  privacidade: () => '/privacy',
  // Definir ou mudar a palavra-passe. É também o destino dos links do convite e
  // da recuperação — por isso tem de funcionar **sem sessão iniciada**, e os
  // parâmetros `th` e `tipo` (que o email traz) são lidos lá dentro em vez de
  // virem daqui: quem os escreve é o modelo do email, não a app.
  palavraPasse: () => '/password',
  // Página pública de eliminação de conta. Existe porque a Google a exige para
  // apps que deixam criar conta: além do botão lá dentro, tem de haver um
  // endereço na web, acessível sem sessão iniciada, que explique o que se apaga.
  apagarConta: () => '/delete-account',

  /* ------------------------------------------------------------- clubes */
  clubeNovo: () => '/clubs/new',
  clube: (club) => comIds('/club', { club }),
  escaloes: (club) => {
    const base = comIds('/club', { club });
    return `${base}${base.includes('?') ? '&' : '?'}view=teams`;
  },
  clubeEditar: (club) => comIds('/club/edit', { club }),
  // Os resultados e números de todos os escalões do clube, por semana. É um
  // add-on ('visao-geral-clube') e entra pelo seletor de escalões.
  visaoGeralClube: (club) => comIds('/club/overview', { club }),

  /* ----------------------------------------------------------- escalões */
  escalaoNovo: (club) => comIds('/team/new', { club }),
  escalao: (club, team) => comIds('/team', { club, team }),
  escalaoEditar: (club, team) => comIds('/team/edit', { club, team }),
  plantel: (club, team) => comIds('/team/roster', { club, team }),
  jogos: (club, team) => comIds('/team/matches', { club, team }),
  jogoNovo: (club, team) => comIds('/team/matches/new', { club, team }),
  estatisticas: (club, team) => comIds('/team/statistics', { club, team }),
  // O painel visual do escalão: os mesmos números da aba de estatísticas, em
  // forma em vez de tabela.
  painelEscalao: (club, team) => comIds('/team/dashboard', { club, team }),
  // Quem vê e quem edita este escalão. Só o dono do clube lá chega, e só faz
  // sentido com a licença de Clube — um treinador sozinho não tem com quem
  // partilhar.
  acessos: (club, team) => comIds('/team/access', { club, team }),

  /* -------------------------------------------------------- competições */
  competicoes: (club, team) => comIds('/team/competitions', { club, team }),
  competicaoNova: (club, team) => comIds('/team/competitions/new', { club, team }),
  competicaoEditar: (club, team, competition) =>
    comIds('/team/competitions/edit', { club, team, competition }),
  competicao: (club, team, competition) =>
    comIds('/team/competition', { club, team, competition }),

  /* ---------------------------------------------------------- jogadores */
  jogadorNovo: (club, team) => comIds('/team/players/new', { club, team }),
  jogador: (club, team, player) => comIds('/team/player', { club, team, player }),
  jogadorEditar: (club, team, player) => comIds('/team/player/edit', { club, team, player }),

  /* ------------------------------------------------------------- treino */
  // A aba Treino tem duas sub-abas, como a Análise: o calendário (com as
  // presenças por baixo) e o quadro tático.
  treinos: (club, team) => comIds('/team/training', { club, team }),
  treino: (club, team, training) => comIds('/team/training/session', { club, team, training }),
  rotinaTreino: (club, team) => comIds('/team/training/routine', { club, team }),
  quadroTatico: (club, team) => comIds('/team/tactics', { club, team }),
  jogada: (club, team, play) => comIds('/team/tactics/play', { club, team, play }),
  // O link que vai por WhatsApp. Abre sem conta nem app, e por isso fica fora
  // de `/team`.
  jogadaPublica: (share) => comIds('/jogada', { share }),

  /* --------------------------------------------------------------- jogo */
  jogoPreparar: (match) => comIds('/match/setup', { match }),
  jogoAoVivo: (match) => comIds('/match/live', { match }),
  jogoResumo: (match) => comIds('/match/summary', { match }),
  jogoHistorico: (match) => comIds('/match/events', { match }),
  // Acompanhar um jogo que outro treinador está a registar (add-on 'ao-vivo').
  // Só de leitura, e fora de `/match/live` de propósito: não trava a
  // sincronização nem encolhe o cabeçalho como o ecrã de registo.
  jogoAssistir: (match) => comIds('/match/watch', { match }),
};

/**
 * O histórico e o resumo lembram-se de onde vieram, para o botão "atrás" não
 * atirar sempre para o mesmo sítio. O endereço de origem viaja como parâmetro,
 * e por isso tem de ser codificado.
 */
export function comOrigem(destino, { de, atras } = {}) {
  const separador = destino.includes('?') ? '&' : '?';
  const extra = [];
  if (de) extra.push(`from=${encodeURIComponent(de)}`);
  if (atras) extra.push(`back=${encodeURIComponent(atras)}`);
  return extra.length ? `${destino}${separador}${extra.join('&')}` : destino;
}

/**
 * Qual das abas corresponde ao ecrã em que estamos.
 *
 * Parece uma comparação trivial e não é, porque os dois lados nunca têm a mesma
 * forma. O `usePathname` do Next devolve `/team/roster/` — com a barra no fim,
 * por causa do `trailingSlash` que a exportação estática obriga — e sem os
 * parâmetros. As rotas daqui devolvem `/team/roster?c=…&t=…`: sem barra no fim
 * e com os ids colados. Um `===` entre as duas coisas é sempre falso, e o
 * resultado era nenhuma aba ficar acesa em ecrã nenhum.
 *
 * A regra é o prefixo mais comprido, e não a igualdade, para que as páginas
 * penduradas numa aba a mantenham acesa: em `/team/matches/new` continua acesa
 * a de Jogos. Como `/team` é prefixo de todas as outras, tem de ser o mais
 * comprido a ganhar — senão as Estatísticas ficavam acesas em todo o lado.
 *
 * @param {string} atual o que o `usePathname` devolveu
 * @param {string[]} destinos os endereços das abas, pela ordem em que aparecem
 * @returns {number} o índice da aba acesa, ou -1 se nenhuma servir
 */
export function abaActiva(atual, destinos) {
  const limpar = (e) => (e || '').split('?')[0].replace(/\/+$/, '') || '/';
  const aqui = limpar(atual);

  let escolhida = -1;
  let maisComprido = -1;

  destinos.forEach((destino, i) => {
    const base = limpar(destino);
    // `aqui === base` apanha a própria aba; o resto apanha o que está por baixo
    // dela. A barra na comparação não é detalhe: sem ela, `/team` dava-se como
    // prefixo de `/teamXYZ`, que é outra página.
    const debaixo = aqui === base || aqui.startsWith(`${base}/`);
    if (debaixo && base.length > maisComprido) {
      maisComprido = base.length;
      escolhida = i;
    }
  });

  return escolhida;
}

/**
 * Estamos no ecrã do jogo ao vivo?
 *
 * Existe por causa da mesma armadilha que apagava as abas: com `trailingSlash`,
 * o `usePathname` devolve `/match/live/` — com barra no fim. O teste que aqui
 * estava era `/\/live$/`, que nunca dava verdade em lado nenhum.
 *
 * E isso não era só cosmético. Esta resposta decide duas coisas:
 *
 *   · a classe `is-live`, que encolhe o cabeçalho e tira o fundo;
 *   · **travar a sincronização periódica enquanto o jogo decorre** — que é o
 *     que evita ir buscar dados ao servidor entre uma substituição e a
 *     seguinte.
 *
 * Compara-se o caminho todo, e não só o fim: `/live` sozinho podia um dia
 * aparecer noutro sítio e ninguém ligaria as duas coisas.
 */
export function noJogoAoVivo(atual) {
  return /\/match\/live\/?$/.test(atual || '');
}
