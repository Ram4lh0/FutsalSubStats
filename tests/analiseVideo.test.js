// tests/analiseVideo.test.js — a lógica pura da Análise de vídeo.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORIAS_VIDEO,
  CLIPE_MINIMO_MS,
  FILTRO_VAZIO,
  SUBTIPOS_DE_REGISTO,
  VALENCIA,
  acertarIntervalo,
  alternarFiltro,
  anteriorNaFila,
  chaveDoSubtipo,
  clipeAcabou,
  clipesDaSessao,
  contarPorJogador,
  fichaDoJogador,
  filtrarClipes,
  fonteDaAnalise,
  idConversa,
  intervaloDoToque,
  intervaloManual,
  juntarASessao,
  lerLinkYouTube,
  lerTempoDoLink,
  linkYouTubeNoSegundo,
  miniaturaYouTube,
  moverNaLista,
  normalizarMargens,
  opcoesDeFiltro,
  ordenarClipes,
  pendentesDoJogador,
  problemasDoCatalogoVideo,
  resumoDaAnalise,
  seguinteNaFila,
  tempoVideo,
  tirarDaSessao,
} from '../src/domain/analiseVideo.js';
import { CATALOGO as CATALOGO_REGISTOS } from '../src/domain/registos.js';
import {
  videoAnalysisMapper,
  videoClipMapper,
  videoSessionMapper,
  videoTalkMapper,
} from '../src/lib/data/mappers.js';
import pt from '../src/lib/i18n/pt.js';
import { PARAM, rotas } from '../src/lib/routes.js';

const ID = 'pEZLkEneQPE';

/* ------------------------------------------------------------- o link */

test('lê todas as formas de link do YouTube', () => {
  const casos = [
    `https://youtube.com/watch?v=${ID}&feature=shared`,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}&list=abc`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=xyz`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `youtube.com/watch?v=${ID}`,
    `  youtu.be/${ID}  `,
    ID,
  ];
  for (const caso of casos) {
    assert.deepEqual(lerLinkYouTube(caso), { id: ID, inicioSeg: 0 }, caso);
  }
});

test('lê o tempo do link, em qualquer forma', () => {
  assert.equal(lerLinkYouTube(`https://youtu.be/${ID}?t=90`).inicioSeg, 90);
  assert.equal(lerLinkYouTube(`https://www.youtube.com/watch?v=${ID}&t=1m30s`).inicioSeg, 90);
  assert.equal(lerLinkYouTube(`https://www.youtube.com/watch?v=${ID}&t=1h2m3s`).inicioSeg, 3723);
  assert.equal(lerLinkYouTube(`https://www.youtube.com/embed/${ID}?start=42`).inicioSeg, 42);
  assert.equal(lerTempoDoLink('75s'), 75);
  assert.equal(lerTempoDoLink('lixo'), 0);
  assert.equal(lerTempoDoLink(null), 0);
});

test('recusa o que não é um vídeo do YouTube', () => {
  for (const caso of [
    '',
    null,
    'olá',
    'https://vimeo.com/123456789',
    'https://www.youtube.com/watch?v=curto',
    'https://www.youtube.com/channel/UCabc',
    'https://www.youtube.com/playlist?list=PL123',
    `https://evil.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
  ]) {
    assert.equal(lerLinkYouTube(caso), null, String(caso));
  }
});

test('miniatura, plano B e fonte da análise', () => {
  assert.equal(miniaturaYouTube(ID), `https://img.youtube.com/vi/${ID}/mqdefault.jpg`);
  assert.equal(linkYouTubeNoSegundo(ID, 83.9), `https://www.youtube.com/watch?v=${ID}&t=83s`);
  assert.equal(linkYouTubeNoSegundo(ID, 0), `https://www.youtube.com/watch?v=${ID}`);
  assert.deepEqual(fonteDaAnalise({ youtubeId: ID }), { tipo: 'youtube', id: ID });
  assert.deepEqual(fonteDaAnalise({ provider: 'youtube', youtubeId: ID }), { tipo: 'youtube', id: ID });
  assert.equal(fonteDaAnalise({ provider: 'outra', youtubeId: ID }), null, 'fonte que ainda não existe');
  assert.equal(fonteDaAnalise(null), null);
});

/* --------------------------------------------------------- o catálogo */

test('o catálogo não tem problemas e todos os nomes existem no dicionário', () => {
  assert.deepEqual(problemasDoCatalogoVideo(), []);
  for (const c of CATEGORIAS_VIDEO) {
    assert.ok(pt[`video.cat.${c.id}`], `falta video.cat.${c.id}`);
    for (const s of c.subtipos) assert.ok(pt[chaveDoSubtipo(s)], `falta ${chaveDoSubtipo(s)}`);
  }
  for (const v of Object.values(VALENCIA)) assert.ok(pt[`video.valencia.${v}`]);
});

test('os subtipos que são registos existem mesmo nos registos da app', () => {
  for (const id of SUBTIPOS_DE_REGISTO) {
    assert.ok(CATALOGO_REGISTOS[id], `${id} não é um registo`);
    assert.equal(chaveDoSubtipo(id), `registos.nome.${id}`);
  }
  assert.equal(chaveDoSubtipo('contra_ataque'), 'video.sub.contra_ataque');
});

test('o catálogo apanha repetidos e cores inválidas', () => {
  const problemas = problemasDoCatalogoVideo([
    { id: 'a', cor: '#fff', icone: 'x', subtipos: [] },
    { id: 'a', cor: '#ffffff', icone: '', subtipos: ['s', 's'] },
  ]);
  assert.equal(problemas.length, 4, problemas.join('\n'));
});

/* -------------------------------------------------------------- clipes */

test('um toque corta [t−6 s, t+4 s] por omissão', () => {
  assert.deepEqual(intervaloDoToque(60000), { startMs: 54000, endMs: 64000 });
});

test('as margens são configuráveis', () => {
  assert.deepEqual(intervaloDoToque(60000, { antesMs: 10000, depoisMs: 2000 }), {
    startMs: 50000,
    endMs: 62000,
  });
  assert.deepEqual(normalizarMargens({ antesMs: 'x', depoisMs: 999999 }), {
    antesMs: 6000,
    depoisMs: 60000,
  });
  assert.deepEqual(normalizarMargens({ antesMs: 0, depoisMs: 0 }), { antesMs: 0, depoisMs: CLIPE_MINIMO_MS });
});

test('o clipe fica preso ao vídeo: nem antes do zero, nem depois do fim', () => {
  assert.deepEqual(intervaloDoToque(2000), { startMs: 0, endMs: 6000 });
  assert.deepEqual(intervaloDoToque(99000, undefined, 100000), { startMs: 93000, endMs: 100000 });
  // Toque mesmo no fim: ainda dá um clipe com a duração mínima.
  const fim = intervaloDoToque(100000, { antesMs: 0, depoisMs: 4000 }, 100000);
  assert.equal(fim.endMs, 100000);
  assert.equal(fim.endMs - fim.startMs, CLIPE_MINIMO_MS);
});

test('o clipe manual aceita início e fim por qualquer ordem', () => {
  assert.deepEqual(intervaloManual(30000, 12000), { startMs: 12000, endMs: 30000 });
  assert.deepEqual(intervaloManual(5000, 5000), { startMs: 5000, endMs: 5000 + CLIPE_MINIMO_MS });
});

test('acertar o início ou o fim nunca atravessa o outro lado', () => {
  const clipe = { startMs: 10000, endMs: 20000 };
  assert.deepEqual(acertarIntervalo(clipe, { startMs: 9000 }), { startMs: 9000, endMs: 20000 });
  assert.deepEqual(acertarIntervalo(clipe, { endMs: 21000 }), { startMs: 10000, endMs: 21000 });
  assert.deepEqual(acertarIntervalo(clipe, { startMs: 25000 }), {
    startMs: 20000 - CLIPE_MINIMO_MS,
    endMs: 20000,
  });
  assert.deepEqual(acertarIntervalo(clipe, { endMs: 3000 }), {
    startMs: 10000,
    endMs: 10000 + CLIPE_MINIMO_MS,
  });
  assert.deepEqual(acertarIntervalo({ startMs: 500, endMs: 5000 }, { startMs: -500 }), {
    startMs: 0,
    endMs: 5000,
  });
});

test('os clipes ordenam-se pelo tempo do vídeo', () => {
  const lista = [
    { id: 'c', startMs: 30000, endMs: 40000 },
    { id: 'a', startMs: 10000, endMs: 20000 },
    { id: 'b', startMs: 10000, endMs: 25000 },
  ];
  assert.deepEqual(ordenarClipes(lista).map((c) => c.id), ['a', 'b', 'c']);
  assert.equal(lista[0].id, 'c', 'não mexe na lista que recebeu');
});

/* -------------------------------------------------------------- filtros */

const CLIPES = [
  { id: '1', startMs: 0, endMs: 1000, category: 'ataque', subtype: 'finalizacao', valence: 'bom', playerIds: ['joao'] },
  { id: '2', startMs: 2000, endMs: 3000, category: 'defesa', subtype: 'coberturas', valence: 'corrigir', playerIds: ['joao', 'rui'] },
  { id: '3', startMs: 4000, endMs: 5000, category: 'ataque', subtype: 'paralelas', valence: null, playerIds: [] },
  { id: '4', startMs: 6000, endMs: 7000, category: null, subtype: null, valence: 'corrigir', playerIds: ['rui'] },
];

test('filtra por categoria, subtipo, jogador e valência', () => {
  const ids = (f) => filtrarClipes(CLIPES, { ...FILTRO_VAZIO, ...f }).map((c) => c.id);
  assert.deepEqual(ids({}), ['1', '2', '3', '4']);
  assert.deepEqual(ids({ categorias: ['ataque'] }), ['1', '3']);
  assert.deepEqual(ids({ categorias: ['ataque', 'defesa'] }), ['1', '2', '3'], 'dentro do grupo é OU');
  assert.deepEqual(ids({ subtipos: ['coberturas'] }), ['2']);
  assert.deepEqual(ids({ jogadores: ['rui'] }), ['2', '4']);
  assert.deepEqual(ids({ valencias: ['neutro'] }), ['3'], 'sem valência conta como neutro');
  assert.deepEqual(ids({ jogadores: ['joao'], valencias: ['corrigir'] }), ['2'], 'entre grupos é E');
  assert.deepEqual(ids({ categorias: ['ataque'], jogadores: ['rui'] }), []);
});

test('os chips ligam e desligam, e o subtipo cai quando a categoria sai', () => {
  let f = alternarFiltro(FILTRO_VAZIO, 'categorias', 'ataque');
  f = alternarFiltro(f, 'subtipos', 'finalizacao');
  assert.deepEqual(f.subtipos, ['finalizacao']);
  f = alternarFiltro(f, 'categorias', 'defesa');
  assert.deepEqual(f.subtipos, ['finalizacao'], 'o ataque continua escolhido');
  f = alternarFiltro(f, 'categorias', 'ataque');
  assert.deepEqual(f.categorias, ['defesa']);
  assert.deepEqual(f.subtipos, [], 'finalização não é da defesa');
  assert.deepEqual(FILTRO_VAZIO.categorias, [], 'o filtro vazio não foi mexido');
});

test('só há chips do que existe nos clipes', () => {
  const o = opcoesDeFiltro(CLIPES);
  assert.deepEqual(o.categorias, ['ataque', 'defesa']);
  assert.deepEqual(o.valencias, ['bom', 'corrigir', 'neutro']);
  assert.deepEqual(o.jogadores.sort(), ['joao', 'rui']);
});

/* ------------------------------------------------------------- playlist */

test('a fila passa ao seguinte e pára no fim', () => {
  assert.equal(seguinteNaFila(CLIPES, null).id, '1');
  assert.equal(seguinteNaFila(CLIPES, '2').id, '3');
  assert.equal(seguinteNaFila(CLIPES, '4'), null);
  assert.equal(seguinteNaFila([], null), null);
  assert.equal(anteriorNaFila(CLIPES, '3').id, '2');
  assert.equal(anteriorNaFila(CLIPES, '1'), null);
});

test('o clipe acaba no fim, com folga para o tique do leitor', () => {
  const clipe = { startMs: 1000, endMs: 5000 };
  assert.equal(clipeAcabou(clipe, 4000), false);
  assert.equal(clipeAcabou(clipe, 4950), true);
  assert.equal(clipeAcabou(null, 9999), false);
});

test('o tempo do vídeo lê-se como no YouTube', () => {
  assert.equal(tempoVideo(0), '0:00');
  assert.equal(tempoVideo(65400), '1:05');
  assert.equal(tempoVideo(65400, { decimas: true }), '1:05.4');
  assert.equal(tempoVideo(3723000), '1:02:03');
});

/* -------------------------------------------------------------- sessões */

test('reordenar, juntar e tirar clipes de uma sessão', () => {
  assert.deepEqual(moverNaLista(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moverNaLista(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moverNaLista(['a', 'b'], 0, 99), ['b', 'a']);
  assert.deepEqual(moverNaLista(['a', 'b'], 9, 0), ['a', 'b']);
  assert.deepEqual(juntarASessao(['a', 'b'], ['b', 'c', null, 'c']), ['a', 'b', 'c']);
  assert.deepEqual(tirarDaSessao(['a', 'b', 'c'], 'b'), ['a', 'c']);
});

test('a sessão mantém a sua ordem e salta clipes apagados', () => {
  const porId = new Map([
    ['a', { id: 'a' }],
    ['b', { id: 'b', deletedAt: 123 }],
    ['c', { id: 'c' }],
  ]);
  const clipes = clipesDaSessao({ clipIds: ['c', 'b', 'x', 'a', 'c'] }, porId);
  assert.deepEqual(clipes.map((c) => c.id), ['c', 'a']);
  assert.deepEqual(clipesDaSessao(null, porId), []);
});

/* ----------------------------------------------------------- conversas */

test('o id da conversa é estável e próprio de cada par', () => {
  assert.equal(idConversa('c1', 'p1'), idConversa('c1', 'p1'));
  assert.notEqual(idConversa('c1', 'p1'), idConversa('c1', 'p2'));
  assert.match(idConversa('c1', 'p1'), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('conta os clipes por mostrar a cada jogador', () => {
  const conversas = [
    { clipId: '1', playerId: 'joao', talkedAt: 1000 },
    { clipId: '2', playerId: 'rui', talkedAt: null }, // desmarcada: não conta
  ];
  const contas = contarPorJogador([...CLIPES, { id: '9', playerIds: ['joao'], deletedAt: 5 }], conversas);
  assert.deepEqual(contas.get('joao'), { total: 2, pendentes: 1 });
  assert.deepEqual(contas.get('rui'), { total: 2, pendentes: 2 });
  assert.deepEqual(pendentesDoJogador(CLIPES, 'joao', conversas).map((c) => c.id), ['2']);
});

test('a ficha do jogador agrupa por categoria e valência', () => {
  const ficha = fichaDoJogador(CLIPES, 'rui', [{ clipId: '4', playerId: 'rui', talkedAt: 777 }]);
  assert.deepEqual(ficha.map((g) => g.categoria), ['defesa', null]);
  assert.equal(ficha[0].grupos[0].valencia, 'corrigir');
  assert.equal(ficha[0].grupos[0].clipes[0].faladoEm, null);
  assert.equal(ficha[1].grupos[0].clipes[0].faladoEm, 777);
});

test('o cartão da análise conta clipes e jogadores marcados', () => {
  assert.deepEqual(resumoDaAnalise([...CLIPES, { id: 'x', playerIds: ['ze'], deletedAt: 1 }]), {
    clipes: 4,
    jogadores: 2,
  });
});

/* -------------------------------------------------------------- mapeadores */

test('a análise vai e volta do servidor sem perder nada', () => {
  const local = {
    id: 'a1',
    teamId: 't1',
    title: 'Jogo com o Sporting',
    provider: 'youtube',
    youtubeId: ID,
    matchId: null,
    recordedOn: '2026-11-08',
    createdBy: 'u1',
    deletedAt: null,
  };
  const row = videoAnalysisMapper.toRow(local);
  assert.equal(row.youtube_id, ID);
  assert.equal(row.recorded_on, '2026-11-08');
  const volta = videoAnalysisMapper.fromRow({ ...row, created_at: '2026-11-08T10:00:00Z', updated_at: '2026-11-08T10:00:00Z' });
  for (const k of Object.keys(local)) assert.deepEqual(volta[k], local[k], k);
  assert.equal(volta.dirty, false);
});

test('o clipe vai e volta, com os tempos inteiros e os jogadores em lista', () => {
  const local = {
    id: 'c1',
    analysisId: 'a1',
    teamId: 't1',
    startMs: 54000,
    endMs: 64000,
    category: 'ataque',
    subtype: 'finalizacao',
    valence: 'bom',
    playerIds: ['p1', 'p2'],
    note: 'Boa diagonal',
    createdBy: 'u1',
    deletedAt: null,
  };
  const row = videoClipMapper.toRow({ ...local, startMs: 54000.4 });
  assert.equal(row.start_ms, 54000);
  assert.deepEqual(row.player_ids, ['p1', 'p2']);
  const volta = videoClipMapper.fromRow({ ...row, player_ids: null });
  assert.deepEqual(volta.playerIds, [], 'sem jogadores vem lista vazia, nunca null');
  assert.equal(videoClipMapper.fromRow(row).note, 'Boa diagonal');
});

test('a sessão e a conversa vão e voltam', () => {
  const sessao = videoSessionMapper.fromRow(
    videoSessionMapper.toRow({
      id: 's1',
      teamId: 't1',
      title: 'Conversa com o João',
      clipIds: ['c1', 'c2'],
      playerId: 'p1',
      shareToken: null,
      shareExpiresAt: null,
      deletedAt: null,
    })
  );
  assert.deepEqual(sessao.clipIds, ['c1', 'c2']);
  assert.equal(sessao.playerId, 'p1');

  const conversa = videoTalkMapper.fromRow(
    videoTalkMapper.toRow({ id: 'k1', clipId: 'c1', playerId: 'p1', teamId: 't1', talkedAt: 1762600000000, note: null })
  );
  assert.equal(conversa.talkedAt, 1762600000000);
  assert.equal(videoTalkMapper.toRow({ id: 'k1', clipId: 'c1', playerId: 'p1', teamId: 't1', talkedAt: null }).talked_at, null);
});

/* ------------------------------------------------------- o repositório */

test('três toques seguidos na folha do clipe não se pisam uns aos outros', async () => {
  const { analises, clipes } = await import('../src/lib/data/video.js');
  const analise = await analises.guardar('equipa-1', { youtubeId: ID, title: 'Jogo' });
  const clipe = await clipes.criar(analise, { startMs: 54000, endMs: 64000, category: 'ataque' });

  // Sem esperar por nenhum: é assim que os botões da folha os disparam.
  await Promise.all([
    clipes.editar(clipe.id, { subtype: 'finalizacao' }),
    clipes.editar(clipe.id, { valence: 'bom' }),
    clipes.alternarJogador(clipe.id, 'p1'),
    clipes.alternarJogador(clipe.id, 'p2'),
    clipes.editar(clipe.id, { note: 'Boa diagonal' }),
    clipes.acertar(clipe.id, { deltaStartMs: -1000 }),
    clipes.acertar(clipe.id, { deltaStartMs: -1000 }),
  ]);

  const fim = await clipes.get(clipe.id);
  assert.equal(fim.subtype, 'finalizacao');
  assert.equal(fim.valence, 'bom');
  assert.deepEqual(fim.playerIds, ['p1', 'p2']);
  assert.equal(fim.note, 'Boa diagonal');
  assert.equal(fim.startMs, 52000, 'dois toques em −1 s dão 2 s');
  assert.equal(fim.dirty, true, 'fica por enviar');

  await clipes.alternarJogador(clipe.id, 'p1');
  assert.deepEqual((await clipes.get(clipe.id)).playerIds, ['p2']);
});

test('mudar de categoria leva o subtipo; apagar a análise leva os clipes', async () => {
  const { analises, clipes, sessoes } = await import('../src/lib/data/video.js');
  const analise = await analises.guardar('equipa-2', { youtubeId: ID, title: 'Treino' });
  const a = await clipes.criar(analise, { startMs: 0, endMs: 5000, category: 'ataque', subtype: 'paralelas' });
  const b = await clipes.duplicar(a.id);
  assert.notEqual(b.id, a.id);
  assert.equal(b.subtype, 'paralelas');

  assert.equal((await clipes.editar(a.id, { category: 'defesa' })).subtype, null);

  const sessao = await sessoes.criar('equipa-2', { title: 'Reunião', clipIds: [a.id] });
  await Promise.all([sessoes.juntar(sessao.id, [b.id, a.id]), sessoes.renomear(sessao.id, 'Bolas paradas')]);
  const s = await sessoes.get(sessao.id);
  assert.deepEqual(s.clipIds, [a.id, b.id]);
  assert.equal(s.title, 'Bolas paradas');

  await analises.apagar(analise.id);
  assert.equal(await analises.get(analise.id), null);
  assert.deepEqual(await clipes.listByAnalysis(analise.id), []);
  assert.equal((await sessoes.get(sessao.id)).clipIds.length, 2, 'a sessão fica; os clipes apagados saltam-se ao mostrar');
});

test('"já falámos" marca e desmarca sem apagar a linha', async () => {
  const { conversas } = await import('../src/lib/data/video.js');
  const clipe = { id: 'clipe-x', teamId: 'equipa-3' };
  const marcada = await conversas.marcar(clipe, 'p1');
  assert.ok(marcada.talkedAt);
  assert.equal(marcada.id, idConversa('clipe-x', 'p1'));
  const desmarcada = await conversas.marcar(clipe, 'p1', false);
  assert.equal(desmarcada.talkedAt, null);
  assert.equal((await conversas.listByTeam('equipa-3')).length, 1);
  assert.equal(await conversas.marcar(clipe, 'p9', false), null, 'desmarcar o que nunca foi marcado não cria nada');
});

test('o tempo do link colado não colide com os ids na barra de endereço', () => {
  const url = new URL(rotas.analiseVideo('clube', 'escalao', 'video', 262.7), 'https://x');
  assert.equal(url.searchParams.get(PARAM.team), 'escalao');
  assert.equal(url.searchParams.getAll(PARAM.team).length, 1);
  assert.equal(url.searchParams.get(PARAM.video), 'video');
  assert.equal(url.searchParams.get('inicio'), '262');
  assert.equal(new URL(rotas.analiseVideo('c', 'e', 'v'), 'https://x').searchParams.has('inicio'), false);
  assert.ok(!Object.values(PARAM).includes('inicio'));
});
