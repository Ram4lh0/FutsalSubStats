// domain/addons.js — o catálogo dos add-ons que se ligam por escalão.
//
// REGRA DO PROJETO: uma feature nova (uma vista no painel da época, um passo
// extra no registo do jogo, um bloco no resumo, …) nasce como add-on,
// DESLIGADA por omissão. Liga-se escalão a escalão no painel de administração
// (`npm run painel`, "gerir" de cada conta), sem mexer em mais nada:
//
//   1. Acrescentar a entrada em `ADDONS`, aqui em baixo.
//   2. No ecrã, perguntar `useAddons(teamId).has('o-id')` (lib/useAddons.js)
//      e só mostrar a feature se for verdade.
//   3. Um teste em tests/addons.test.js se tiver dependências.
//
// O painel desenha o catálogo sozinho: a caixa aparece no grupo certo.
//
// A config é do ESCALÃO, não da conta: quem tem acesso a um escalão (dono ou
// treinador com acesso) fica com os mesmos add-ons. Fica em `team_stat_config`:
// os registos extra na coluna `registos` (vinham de antes, ver
// domain/registos.js) e o resto na coluna `addons`.
//
// Regra de ouro, como nos registos: um id nunca muda de significado. Para
// tirar um add-on da app inteira sem apagar configs põe-se `disponivel: false`.

import { CATALOGO as CATALOGO_REGISTOS, REGISTOS, registosLigados } from './registos.js';

/** Os grupos, pela ordem em que aparecem no painel. */
export const GRUPOS = [
  { id: 'registos', nome: 'Registos no jogo ao vivo' },
  { id: 'jogo', nome: 'Jogo ao vivo' },
  { id: 'resumo', nome: 'Intervalo e resumo do jogo' },
  { id: 'dashboard', nome: 'Painel da época' },
  { id: 'treino', nome: 'Treino' },
  { id: 'clube', nome: 'Clube' },
];

/** O nome de cada registo extra, no painel. A app tem os seus nos dicionários. */
export const NOME_REGISTO = {
  remate: 'Remates',
  defesa_gr: 'Defesas do GR',
  recuperacao: 'Recuperações',
  fora: 'Foras',
  canto: 'Cantos',
  acao: 'Ações +/−',
  remate_adv: 'Remates do adversário',
  perda_bola: 'Perdas de bola',
};

/**
 * Os add-ons que não são registos. Cada entrada:
 *
 *   'mapa-baliza': {
 *     grupo: 'resumo',              // um dos GRUPOS (não 'registos')
 *     nome: 'Zona da baliza',       // como aparece no painel
 *     depende: ['remate'],          // ids de registos ou de outros add-ons
 *     disponivel: true,             // false tira-o da app inteira
 *     paraTodos: false,             // true: ligado em todos os escalões
 *   },
 *
 * As dependências não se ligam sozinhas: o add-on só fica activo se elas
 * também estiverem ligadas. O painel avisa quando faltam.
 */
export const ADDONS = {
  // Uma entrada "Visão geral do clube" no seletor de escalões: os resultados
  // de todos os escalões no fim de semana, numa só janela, e a comparação
  // entre eles. Aparece no clube quando está ligada em pelo menos um dos seus
  // escalões, e mostra os escalões a que a pessoa tem acesso.
  'visao-geral-clube': {
    grupo: 'clube',
    nome: 'Visão geral do clube',
  },
  // "Assistir ao vivo": um interruptor na preparação do jogo deixa quem tem
  // acesso ao escalão acompanhar o jogo em direto noutro telemóvel (lista
  // "Jogos ao vivo" na aba Jogos e ecrã só de leitura). Ver domain/aoVivo.js.
  'ao-vivo': {
    grupo: 'jogo',
    nome: 'Assistir ao vivo',
  },
};

/* ----------------------------------------------------------------- leitura */

function entrada(id, catalogo) {
  return Object.prototype.hasOwnProperty.call(catalogo, id) ? catalogo[id] : null;
}

/** O catálogo inteiro como o painel o mostra: registos primeiro, depois o resto. */
export function catalogoDeAddons(catalogo = ADDONS) {
  const registos = REGISTOS.filter((id) => CATALOGO_REGISTOS[id].disponivel).map((id) => ({
    id,
    nome: NOME_REGISTO[id] || id,
    grupo: 'registos',
    campo: 'registos',
    depende: [],
    paraTodos: false,
  }));
  const outros = Object.entries(catalogo)
    .filter(([, a]) => a.disponivel !== false)
    .map(([id, a]) => ({
      id,
      nome: a.nome || id,
      grupo: a.grupo,
      campo: 'addons',
      depende: a.depende || [],
      paraTodos: Boolean(a.paraTodos),
    }));
  return [...registos, ...outros];
}

/**
 * Os add-ons activos de um escalão, a partir da sua config (a linha de
 * `team_stat_config`, ou nada). Inclui os registos ligados, os add-ons ligados
 * cujas dependências estejam todas activas, e os que são `paraTodos`.
 *
 * @returns {Set<string>}
 */
export function addonsAtivos(config, catalogo = ADDONS) {
  const ativos = new Set(registosLigados(config?.registos));
  const pedidos = new Set(Array.isArray(config?.addons) ? config.addons : []);

  const candidatos = Object.entries(catalogo).filter(
    ([id, a]) => a.disponivel !== false && (a.paraTodos || pedidos.has(id))
  );

  // As dependências podem ser outros add-ons: repete até não mudar nada. Um
  // ciclo nunca fica activo, porque nenhum dos dois entra primeiro.
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const [id, a] of candidatos) {
      if (ativos.has(id)) continue;
      if ((a.depende || []).every((d) => ativos.has(d))) {
        ativos.add(id);
        mudou = true;
      }
    }
  }
  return ativos;
}

/**
 * Valida uma lista de add-ons para gravar. Devolve `{ addons }` (sem
 * repetidos, pela ordem do catálogo) ou `{ erro, desconhecidos }`. Os
 * registos não entram aqui: têm a sua coluna e `validarListaDeRegistos`.
 */
export function validarListaDeAddons(lista, catalogo = ADDONS) {
  if (!Array.isArray(lista)) return { erro: 'a lista de add-ons tem de ser um array' };
  const desconhecidos = lista.filter((id) => {
    const a = entrada(id, catalogo);
    return !a || a.disponivel === false;
  });
  if (desconhecidos.length) {
    return { erro: `add-on desconhecido: ${desconhecidos.join(', ')}`, desconhecidos };
  }
  const pedidos = new Set(lista);
  return { addons: Object.keys(catalogo).filter((id) => pedidos.has(id)) };
}

/**
 * Problemas no catálogo que não se deviam deixar passar: um id repetido com
 * um registo, um grupo que não existe, uma dependência que não existe. Os
 * testes correm isto sobre o `ADDONS` verdadeiro.
 */
export function problemasDoCatalogo(catalogo = ADDONS) {
  const problemas = [];
  const grupos = new Set(GRUPOS.map((g) => g.id).filter((g) => g !== 'registos'));
  for (const [id, a] of Object.entries(catalogo)) {
    if (entrada(id, CATALOGO_REGISTOS)) problemas.push(`${id}: o id já é de um registo`);
    if (!grupos.has(a.grupo)) problemas.push(`${id}: grupo desconhecido "${a.grupo}"`);
    if (!a.nome) problemas.push(`${id}: falta o nome`);
    for (const d of a.depende || []) {
      if (!entrada(d, CATALOGO_REGISTOS) && !entrada(d, catalogo)) {
        problemas.push(`${id}: depende de "${d}", que não existe`);
      }
    }
  }
  return problemas;
}
