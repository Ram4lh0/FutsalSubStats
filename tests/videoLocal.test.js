// tests/videoLocal.test.js — os vídeos do computador na Análise de vídeo.
//
// O que aqui se garante, sem browser:
//
//   · só os metadados do ficheiro (nome, tamanho, tipo, data, duração) chegam
//     à base local e ao servidor — nunca o ficheiro, um Blob ou um endereço
//     `blob:`;
//   · as análises antigas, sem origem guardada, continuam a ser do YouTube;
//   · a origem escolhe o leitor certo e a troca entre vídeos não fica presa;
//   · os endereços temporários são sempre libertados;
//   · voltar a ligar (o mesmo ficheiro, outro, um que não abre) nunca toca nos
//     clipes nem nas sessões.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FONTE,
  analisesLocaisDosClipes,
  areaDaImagem,
  diferencasDoFicheiro,
  fonteDaAnalise,
  mesmaFonte,
  mesmoFicheiro,
  metadadosDoFicheiro,
  miniaturaDaAnalise,
  origemDaAnalise,
  passoDeAbertura,
  pontoNaCaixa,
  pontoNaImagem,
  tamanhoLegivel,
  tituloDoFicheiro,
} from '../src/domain/analiseVideo.js';
import { videoAnalysisMapper } from '../src/lib/data/mappers.js';
import * as db from '../src/lib/data/local.js';
import { analises, clipes, sessoes } from '../src/lib/data/video.js';
import {
  ACEITA_VIDEO,
  criarUrlTemporaria,
  desligarFicheiro,
  desligarTodos,
  erroDoVideoLocal,
  ficheiroLigado,
  libertarUrlTemporaria,
  ligarFicheiro,
  motivoDaFalha,
  sondarVideo,
  subscreverFicheiros,
  urlsTemporariasVivas,
  versaoDosFicheiros,
} from '../src/lib/videoLocal.js';

const EQUIPA = '22222222-2222-4222-8222-222222222222';
const CHAVES_DOS_METADADOS = ['durationMs', 'lastModified', 'name', 'size', 'type'];

/** Um `File` de mentira: tem o que o browser dá, mais um conteúdo que nunca deve ser lido. */
function ficheiroFalso({ name = 'jogo.mp4', size = 5_800_000_000, type = 'video/mp4', lastModified = 1_780_000_000_000, legivel = true } = {}) {
  const lido = { bytes: 0 };
  return {
    name,
    size,
    type,
    lastModified,
    lido,
    slice(inicio, fim) {
      return {
        async arrayBuffer() {
          if (!legivel) throw new Error('NotReadableError');
          lido.bytes += fim - inicio;
          return new ArrayBuffer(fim - inicio);
        },
      };
    },
    // Se alguém tentar ler o ficheiro inteiro, o teste rebenta.
    arrayBuffer() {
      throw new Error('o ficheiro inteiro nunca deve ser lido');
    },
    text() {
      throw new Error('o ficheiro inteiro nunca deve ser lido');
    },
    stream() {
      throw new Error('o ficheiro inteiro nunca deve ser lido');
    },
  };
}

/** Troca `URL.createObjectURL`/`revokeObjectURL` por duplos que contam. */
function comUrlsFalsas(fn) {
  const criar = URL.createObjectURL;
  const revogar = URL.revokeObjectURL;
  const registo = { criadas: [], revogadas: [] };
  let n = 0;
  URL.createObjectURL = (f) => {
    const url = `blob:teste/${++n}`;
    registo.criadas.push({ url, ficheiro: f });
    return url;
  };
  URL.revokeObjectURL = (url) => registo.revogadas.push(url);
  const repor = () => {
    URL.createObjectURL = criar;
    URL.revokeObjectURL = revogar;
  };
  return Promise.resolve()
    .then(() => fn(registo))
    .finally(repor);
}

/** Um `<video>` de mentira: reage a `src` com metadados ou com um erro. */
function videoFalso({ largura = 1920, altura = 1080, duracao = 5400, erro = null } = {}) {
  const v = {
    preload: '',
    muted: false,
    videoWidth: 0,
    videoHeight: 0,
    duration: NaN,
    error: null,
    onloadedmetadata: null,
    onerror: null,
    fontes: [],
    removeAttribute() {},
    load() {},
  };
  Object.defineProperty(v, 'src', {
    set(url) {
      v.fontes.push(url);
      queueMicrotask(() => {
        if (erro) {
          v.error = { code: erro };
          v.onerror?.();
        } else {
          v.videoWidth = largura;
          v.videoHeight = altura;
          v.duration = duracao;
          v.onloadedmetadata?.();
        }
      });
    },
  });
  return v;
}

/* ============================================================ metadados */

test('metadados: do ficheiro fica só o que o identifica', () => {
  const f = ficheiroFalso();
  const meta = metadadosDoFicheiro(f, { durationMs: 5_400_000 });
  assert.deepEqual(Object.keys(meta).sort(), CHAVES_DOS_METADADOS);
  assert.deepEqual(meta, {
    name: 'jogo.mp4',
    size: 5_800_000_000,
    type: 'video/mp4',
    lastModified: 1_780_000_000_000,
    durationMs: 5_400_000,
  });
  // É texto e números: serve para a base local e para o servidor.
  assert.deepEqual(JSON.parse(JSON.stringify(meta)), meta);
  assert.equal(f.lido.bytes, 0);
});

test('metadados: sem nome não há ficheiro; nomes enormes são cortados', () => {
  assert.equal(metadadosDoFicheiro(null), null);
  assert.equal(metadadosDoFicheiro('jogo.mp4'), null);
  assert.equal(metadadosDoFicheiro({ size: 10 }), null);
  assert.equal(metadadosDoFicheiro({ name: '   ' }), null);
  const comprido = metadadosDoFicheiro({ name: 'a'.repeat(5000) });
  assert.ok(comprido.name.length <= 255);
  // Cabe sempre no limite da coluna do servidor (2048 bytes).
  assert.ok(JSON.stringify(metadadosDoFicheiro({ name: 'é'.repeat(5000), type: 'x'.repeat(5000) })).length < 2048);
});

test('metadados: um endereço blob: ou um Blob metidos à força não passam', () => {
  const meta = metadadosDoFicheiro({
    name: 'jogo.mp4',
    size: 1,
    url: 'blob:http://localhost/abc',
    blob: new Blob(['x']),
    file: ficheiroFalso(),
  });
  assert.deepEqual(Object.keys(meta).sort(), CHAVES_DOS_METADADOS);
  assert.ok(!JSON.stringify(meta).includes('blob:'));
});

test('ficheiro diferente: nome, tamanho ou data', () => {
  const guardado = metadadosDoFicheiro(ficheiroFalso());
  assert.deepEqual(diferencasDoFicheiro(guardado, ficheiroFalso()), []);
  assert.equal(mesmoFicheiro(guardado, ficheiroFalso()), true);
  assert.deepEqual(diferencasDoFicheiro(guardado, ficheiroFalso({ name: 'outro.mp4' })), ['name']);
  assert.deepEqual(diferencasDoFicheiro(guardado, ficheiroFalso({ size: 1 })), ['size']);
  assert.deepEqual(diferencasDoFicheiro(guardado, ficheiroFalso({ lastModified: 5 })), ['lastModified']);
  assert.deepEqual(
    diferencasDoFicheiro(guardado, ficheiroFalso({ name: 'x.mp4', size: 2, lastModified: 3 })),
    ['name', 'size', 'lastModified']
  );
  assert.equal(mesmoFicheiro(guardado, ficheiroFalso({ size: 1 })), false);
  // O tipo não conta: o mesmo ficheiro vem sem tipo nalguns browsers.
  assert.equal(mesmoFicheiro(guardado, ficheiroFalso({ type: '' })), true);
  // Um campo que falte de um lado não prende a análise.
  assert.equal(mesmoFicheiro({ name: 'jogo.mp4' }, ficheiroFalso()), true);
  // Sem nada guardado não há com que comparar: não se pergunta nada.
  assert.deepEqual(diferencasDoFicheiro(null, ficheiroFalso()), []);
  assert.equal(mesmoFicheiro(null, ficheiroFalso()), false);
});

test('título e tamanho a partir do ficheiro', () => {
  assert.equal(tituloDoFicheiro('Jogo_com_o_Sporting.mp4'), 'Jogo com o Sporting');
  assert.equal(tituloDoFicheiro('C:\\Videos\\jornada 3.final.MOV'), 'jornada 3.final');
  assert.equal(tituloDoFicheiro('/home/x/treino.webm'), 'treino');
  assert.equal(tituloDoFicheiro('semextensao'), 'semextensao');
  assert.equal(tituloDoFicheiro(''), '');
  assert.equal(tamanhoLegivel(5_800_000_000), '5,4 GB');
  assert.equal(tamanhoLegivel(5_800_000_000, '.'), '5.4 GB');
  assert.equal(tamanhoLegivel(900), '900 B');
  assert.equal(tamanhoLegivel(null), '');
});

/* ======================================================= origem e fonte */

test('compatibilidade: uma análise antiga, sem origem, é do YouTube', () => {
  const antiga = { id: 'a1', youtubeId: 'dQw4w9WgXcQ', title: 'Jogo' };
  assert.equal(origemDaAnalise(antiga), FONTE.YOUTUBE);
  assert.deepEqual(fonteDaAnalise(antiga), { tipo: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.ok(miniaturaDaAnalise(antiga).includes('dQw4w9WgXcQ'));
  // E a que vem do servidor sem a coluna nova.
  const doServidor = videoAnalysisMapper.fromRow({ id: 'a1', team_id: EQUIPA, title: 'Jogo', youtube_id: 'dQw4w9WgXcQ' });
  assert.equal(doServidor.provider, 'youtube');
  assert.equal(doServidor.localFile, null);
  assert.deepEqual(fonteDaAnalise(doServidor), { tipo: 'youtube', id: 'dQw4w9WgXcQ' });
});

test('origem: a análise local aponta para a própria análise, não para um endereço', () => {
  const local = { id: 'a2', provider: 'local', localFile: metadadosDoFicheiro(ficheiroFalso()) };
  const fonte = fonteDaAnalise(local);
  assert.equal(fonte.tipo, FONTE.LOCAL);
  assert.equal(fonte.id, 'a2');
  assert.equal(fonte.ficheiro.name, 'jogo.mp4');
  assert.equal(miniaturaDaAnalise(local), null);
  assert.ok(!JSON.stringify(fonte).includes('blob:'));
  // Uma origem que esta versão não conhece não rebenta: não há fonte.
  assert.equal(fonteDaAnalise({ id: 'a3', provider: 'vimeo' }), null);
  assert.equal(fonteDaAnalise(null), null);
});

test('mesma fonte: o tipo e a referência', () => {
  const yt = { tipo: 'youtube', id: 'dQw4w9WgXcQ' };
  assert.equal(mesmaFonte(yt, { ...yt }), true);
  assert.equal(mesmaFonte(yt, { tipo: 'youtube', id: 'aaaaaaaaaaa' }), false);
  assert.equal(mesmaFonte(yt, { tipo: 'local', id: 'dQw4w9WgXcQ' }), false);
  assert.equal(mesmaFonte({ tipo: 'local', id: 'a2', ficheiro: { name: 'a' } }, { tipo: 'local', id: 'a2', ficheiro: { name: 'b' } }), true);
  assert.equal(mesmaFonte(null, yt), false);
});

test('leitor: como se passa de um vídeo para outro', () => {
  const ytA = { tipo: 'youtube', id: 'aaaaaaaaaaa' };
  const ytB = { tipo: 'youtube', id: 'bbbbbbbbbbb' };
  const locA = { tipo: 'local', id: 'a1' };
  const locB = { tipo: 'local', id: 'a2' };
  assert.equal(passoDeAbertura(ytA, null, true), null);
  // O mesmo vídeo, leitor livre: salta-se.
  assert.equal(passoDeAbertura(ytA, { ...ytA }, true), 'ir');
  assert.equal(passoDeAbertura(locA, { ...locA }, true), 'ir');
  // YouTube → YouTube: o leitor troca lá dentro.
  assert.equal(passoDeAbertura(ytA, ytB, true), 'dentro');
  // Mudança de origem ou de ficheiro: monta-se outro leitor.
  assert.equal(passoDeAbertura(ytA, locA, true), 'trocar');
  assert.equal(passoDeAbertura(locA, ytA, true), 'trocar');
  assert.equal(passoDeAbertura(locA, locB, true), 'trocar');
  assert.equal(passoDeAbertura(null, ytA, true), 'trocar');
  // Com o leitor ainda a abrir (ou um pedido por cumprir), o pedido novo
  // substitui o antigo em vez de mexer num vídeo que não é o dele.
  for (const [atual, alvo] of [[ytA, ytA], [ytA, ytB], [locA, locA], [locA, ytA]]) {
    assert.equal(passoDeAbertura(atual, alvo, false), 'trocar');
  }
});

test('sessões: os vídeos locais de onde vêm os clipes', () => {
  const analisesPorId = new Map([
    ['y', { id: 'y', youtubeId: 'dQw4w9WgXcQ' }],
    ['l1', { id: 'l1', provider: 'local', localFile: { name: 'a.mp4' } }],
    ['l2', { id: 'l2', provider: 'local', localFile: { name: 'b.mp4' } }],
  ]);
  const lista = [
    { id: 'c1', analysisId: 'l2' },
    { id: 'c2', analysisId: 'y' },
    { id: 'c3', analysisId: 'l1' },
    { id: 'c4', analysisId: 'l2' },
    { id: 'c5', analysisId: 'apagada' },
  ];
  assert.deepEqual(analisesLocaisDosClipes(lista, analisesPorId).map((a) => a.id), ['l2', 'l1']);
  assert.deepEqual(analisesLocaisDosClipes([{ id: 'c2', analysisId: 'y' }], analisesPorId), []);
  assert.deepEqual(analisesLocaisDosClipes(null, analisesPorId), []);
});

/* ============================================================ servidor */

test('servidor: sobem os metadados, e só nas análises locais', () => {
  const local = {
    id: 'a2',
    teamId: EQUIPA,
    title: 'Jogo',
    provider: 'local',
    youtubeId: null,
    localFile: { ...metadadosDoFicheiro(ficheiroFalso(), { durationMs: 1000 }), url: 'blob:x', file: {} },
  };
  const linha = videoAnalysisMapper.toRow(local);
  assert.equal(linha.provider, 'local');
  assert.equal(linha.youtube_id, null);
  assert.deepEqual(Object.keys(linha.local_file).sort(), CHAVES_DOS_METADADOS);
  assert.ok(!JSON.stringify(linha).includes('blob:'));

  const yt = videoAnalysisMapper.toRow({ id: 'a1', teamId: EQUIPA, title: 'Jogo', youtubeId: 'dQw4w9WgXcQ' });
  assert.equal(yt.provider, 'youtube');
  assert.ok(!('local_file' in yt));

  // Ida e volta: o que desce é o que subiu.
  const volta = videoAnalysisMapper.fromRow({ ...linha, team_id: EQUIPA });
  assert.equal(volta.provider, 'local');
  assert.deepEqual(volta.localFile, metadadosDoFicheiro(ficheiroFalso(), { durationMs: 1000 }));
});

/* ========================================================= base local */

test('persistência: uma análise local guarda só a origem e os metadados', async () => {
  const f = ficheiroFalso();
  const analise = await analises.guardar(EQUIPA, {
    provider: FONTE.LOCAL,
    localFile: metadadosDoFicheiro(f, { durationMs: 5_400_000 }),
    title: 'Jogo com o Sporting',
  });
  const guardada = await db.get(db.STORES.videoAnalyses, analise.id);
  assert.equal(guardada.provider, 'local');
  assert.equal(guardada.youtubeId, null);
  assert.deepEqual(Object.keys(guardada.localFile).sort(), CHAVES_DOS_METADADOS);
  assert.equal(guardada.dirty, true);
  const texto = JSON.stringify(guardada);
  assert.ok(!texto.includes('blob:'));
  assert.deepEqual(JSON.parse(texto), guardada);
  assert.equal(f.lido.bytes, 0);

  // Aparece na lista do escalão, ao lado das do YouTube.
  const yt = await analises.guardar(EQUIPA, { youtubeId: 'dQw4w9WgXcQ', title: 'YouTube' });
  assert.equal(yt.provider, 'youtube');
  assert.equal(yt.localFile, null);
  const ids = (await analises.listByTeam(EQUIPA)).map((a) => a.id);
  assert.ok(ids.includes(analise.id) && ids.includes(yt.id));
});

test('persistência: mesmo que alguém passe o File, só ficam os metadados', async () => {
  const f = ficheiroFalso({ name: 'direto.mp4' });
  const analise = await analises.guardar(EQUIPA, { localFile: f, title: 'Direto' });
  const guardada = await db.get(db.STORES.videoAnalyses, analise.id);
  assert.equal(guardada.provider, 'local');
  assert.deepEqual(Object.keys(guardada.localFile).sort(), CHAVES_DOS_METADADOS);
  assert.equal(typeof guardada.localFile.slice, 'undefined');
});

test('persistência: mudar o título não muda a origem nem o ficheiro', async () => {
  const analise = await analises.guardar(EQUIPA, {
    provider: FONTE.LOCAL,
    localFile: metadadosDoFicheiro(ficheiroFalso()),
    title: 'Antes',
  });
  const depois = await analises.guardar(EQUIPA, {
    id: analise.id,
    title: 'Depois',
    // Tentar trocar a origem numa análise que já existe não tem efeito.
    youtubeId: 'dQw4w9WgXcQ',
    provider: FONTE.YOUTUBE,
    localFile: { name: 'intruso.mp4' },
  });
  assert.equal(depois.title, 'Depois');
  assert.equal(depois.provider, 'local');
  assert.equal(depois.youtubeId, null);
  assert.equal(depois.localFile.name, 'jogo.mp4');

  const yt = await analises.guardar(EQUIPA, { youtubeId: 'dQw4w9WgXcQ', title: 'YouTube' });
  const ytDepois = await analises.guardar(EQUIPA, { id: yt.id, title: 'YouTube 2', provider: FONTE.LOCAL, localFile: { name: 'x.mp4' } });
  assert.equal(ytDepois.provider, 'youtube');
  assert.equal(ytDepois.youtubeId, 'dQw4w9WgXcQ');
  assert.equal(ytDepois.localFile, null);
});

test('religar: outro ficheiro muda os metadados e deixa clipes e sessões como estavam', async () => {
  const analise = await analises.guardar(EQUIPA, {
    provider: FONTE.LOCAL,
    localFile: metadadosDoFicheiro(ficheiroFalso(), { durationMs: 5_400_000 }),
    title: 'Jogo',
  });
  const c1 = await clipes.criar(analise, { startMs: 10_000, endMs: 20_000, category: 'ataque' });
  const c2 = await clipes.criar(analise, { startMs: 60_000, endMs: 70_000, category: 'defesa' });
  const sessao = await sessoes.criar(EQUIPA, { title: 'Reunião', clipIds: [c2.id, c1.id] });
  const antes = JSON.stringify(await clipes.listByAnalysis(analise.id));

  // O mesmo ficheiro: nada muda (nem fica por sincronizar outra vez).
  const igual = await analises.ligarFicheiro(analise.id, ficheiroFalso());
  assert.equal(igual.updatedAt, analise.updatedAt);
  assert.equal(igual.localFile.durationMs, 5_400_000);

  // Outro ficheiro, confirmado pelo treinador.
  const outro = ficheiroFalso({ name: 'jogo-v2.mp4', size: 123, lastModified: 9 });
  const ligada = await analises.ligarFicheiro(analise.id, outro, { durationMs: 1000 });
  assert.deepEqual(ligada.localFile, { name: 'jogo-v2.mp4', size: 123, type: 'video/mp4', lastModified: 9, durationMs: 1000 });
  assert.equal(ligada.provider, 'local');
  assert.equal(ligada.dirty, true);
  assert.equal(outro.lido.bytes, 0);

  assert.equal(JSON.stringify(await clipes.listByAnalysis(analise.id)), antes);
  assert.deepEqual((await sessoes.get(sessao.id)).clipIds, [c2.id, c1.id]);
});

test('religar: não se liga um ficheiro a uma análise do YouTube, apagada ou inexistente', async () => {
  const yt = await analises.guardar(EQUIPA, { youtubeId: 'dQw4w9WgXcQ', title: 'YouTube' });
  assert.equal(await analises.ligarFicheiro(yt.id, ficheiroFalso()), null);
  assert.equal((await analises.get(yt.id)).localFile, null);
  assert.equal(await analises.ligarFicheiro('nao-existe', ficheiroFalso()), null);

  const local = await analises.guardar(EQUIPA, { provider: FONTE.LOCAL, localFile: { name: 'a.mp4' }, title: 'A' });
  assert.equal(await analises.ligarFicheiro(local.id, null), null);
  await analises.apagar(local.id);
  assert.equal(await analises.ligarFicheiro(local.id, ficheiroFalso()), null);
});

/* ================================================= ficheiros em memória */

test('ficheiros ligados: vivem em memória, por análise, e avisam quem mostra', () => {
  desligarTodos();
  let avisos = 0;
  const largar = subscreverFicheiros(() => {
    avisos += 1;
  });
  const v0 = versaoDosFicheiros();
  const f = ficheiroFalso();
  assert.equal(ficheiroLigado('a1'), null);
  ligarFicheiro('a1', f);
  assert.equal(ficheiroLigado('a1'), f);
  assert.equal(ficheiroLigado('a2'), null);
  assert.equal(avisos, 1);
  // Ligar o mesmo outra vez não acorda ninguém.
  ligarFicheiro('a1', f);
  assert.equal(avisos, 1);
  // Trocar por outro avisa.
  const g = ficheiroFalso({ name: 'outro.mp4' });
  ligarFicheiro('a1', g);
  assert.equal(ficheiroLigado('a1'), g);
  assert.equal(avisos, 2);
  // Pedidos sem sentido são ignorados.
  ligarFicheiro(null, f);
  ligarFicheiro('a3', null);
  assert.equal(avisos, 2);
  desligarFicheiro('a1');
  assert.equal(ficheiroLigado('a1'), null);
  assert.equal(avisos, 3);
  desligarFicheiro('a1');
  assert.equal(avisos, 3);
  assert.ok(versaoDosFicheiros() > v0);
  largar();
  ligarFicheiro('a1', f);
  assert.equal(avisos, 3);
  desligarTodos();
  assert.equal(ficheiroLigado('a1'), null);
  // Nada disto leu o ficheiro.
  assert.equal(f.lido.bytes + g.lido.bytes, 0);
});

/* ================================================ endereços temporários */

test('endereços temporários: cada um é libertado uma vez', async () => {
  await comUrlsFalsas((registo) => {
    const antes = urlsTemporariasVivas();
    const f = ficheiroFalso();
    const a = criarUrlTemporaria(f);
    const b = criarUrlTemporaria(f);
    assert.notEqual(a, b);
    assert.equal(urlsTemporariasVivas(), antes + 2);
    assert.equal(registo.criadas[0].ficheiro, f);
    libertarUrlTemporaria(a);
    libertarUrlTemporaria(a);
    libertarUrlTemporaria(null);
    libertarUrlTemporaria('blob:de-outro-sitio');
    assert.deepEqual(registo.revogadas, [a]);
    libertarUrlTemporaria(b);
    assert.deepEqual(registo.revogadas, [a, b]);
    assert.equal(urlsTemporariasVivas(), antes);
    assert.equal(f.lido.bytes, 0);
  });
});

test('erros do vídeo: cada código tem a sua frase', async () => {
  assert.equal(erroDoVideoLocal(4), 'formato');
  assert.equal(erroDoVideoLocal(3), 'formato');
  assert.equal(erroDoVideoLocal(2), 'ficheiro');
  assert.equal(erroDoVideoLocal(undefined), 'outro');
  // "Formato não suportado" num ficheiro que já não se lê é falta do ficheiro.
  assert.equal(await motivoDaFalha(ficheiroFalso(), 4), 'formato');
  assert.equal(await motivoDaFalha(ficheiroFalso({ legivel: false }), 4), 'ficheiro');
  assert.equal(await motivoDaFalha(ficheiroFalso({ legivel: false }), 2), 'ficheiro');
  assert.ok(ACEITA_VIDEO.includes('video/mp4'));
});

test('abrir: um vídeo que o browser toca dá a duração e liberta o endereço', async () => {
  await comUrlsFalsas(async (registo) => {
    const antes = urlsTemporariasVivas();
    const f = ficheiroFalso();
    const video = videoFalso({ largura: 1280, altura: 720, duracao: 5400.25 });
    const info = await sondarVideo(f, { criarVideo: () => video });
    assert.deepEqual(info, { durationMs: 5_400_250, largura: 1280, altura: 720 });
    assert.equal(video.preload, 'metadata');
    assert.equal(video.fontes.length, 1);
    assert.deepEqual(registo.revogadas, [video.fontes[0]]);
    assert.equal(urlsTemporariasVivas(), antes);
    // Um jogo de 5,4 GB: nem um byte lido pela app.
    assert.equal(f.lido.bytes, 0);
  });
});

test('abrir: formato ou codec que o browser não toca', async () => {
  await comUrlsFalsas(async (registo) => {
    const antes = urlsTemporariasVivas();
    // O browser recusa o ficheiro.
    await assert.rejects(
      sondarVideo(ficheiroFalso({ name: 'jogo.avi' }), { criarVideo: () => videoFalso({ erro: 4 }) }),
      (e) => e.codigo === 'formato'
    );
    // Abre o som mas não a imagem (H.265 nalguns browsers).
    await assert.rejects(
      sondarVideo(ficheiroFalso(), { criarVideo: () => videoFalso({ largura: 0, altura: 0 }) }),
      (e) => e.codigo === 'formato'
    );
    // O ficheiro deixou de existir.
    await assert.rejects(
      sondarVideo(ficheiroFalso({ legivel: false }), { criarVideo: () => videoFalso({ erro: 4 }) }),
      (e) => e.codigo === 'ficheiro'
    );
    // Em todos os casos o endereço foi libertado.
    assert.equal(registo.criadas.length, 3);
    assert.equal(registo.revogadas.length, 3);
    assert.equal(urlsTemporariasVivas(), antes);
  });
});

test('abrir: um vídeo sem duração conhecida continua a abrir', async () => {
  await comUrlsFalsas(async () => {
    const info = await sondarVideo(ficheiroFalso(), { criarVideo: () => videoFalso({ duracao: Infinity }) });
    assert.equal(info.durationMs, null);
  });
});

/* ================================================== a área da imagem */

test('camada: a imagem dentro da caixa, com barras pretas', () => {
  // Mesma proporção: a imagem enche a caixa.
  assert.deepEqual(areaDaImagem({ largura: 1600, altura: 900 }, 16 / 9), { x: 0, y: 0, largura: 1600, altura: 900 });
  // Vídeo 4:3 numa caixa 16:9: barras dos lados.
  const lados = areaDaImagem({ largura: 1600, altura: 900 }, 4 / 3);
  assert.deepEqual(lados, { x: 200, y: 0, largura: 1200, altura: 900 });
  // Vídeo 21:9 numa caixa 16:9: barras em cima e em baixo.
  const cima = areaDaImagem({ largura: 1680, altura: 945 }, 21 / 9);
  assert.equal(cima.x, 0);
  assert.equal(cima.largura, 1680);
  assert.equal(cima.altura, 720);
  assert.equal(cima.y, 112.5);
  // Caixa por medir ou proporção inválida não rebentam.
  assert.deepEqual(areaDaImagem({ largura: 0, altura: 0 }), { x: 0, y: 0, largura: 0, altura: 0 });
  assert.deepEqual(areaDaImagem({ largura: 1600, altura: 900 }, NaN), { x: 0, y: 0, largura: 1600, altura: 900 });
});

test('camada: um ponto guardado em fração da imagem serve em qualquer tamanho', () => {
  const pequena = areaDaImagem({ largura: 800, altura: 450 }, 4 / 3);
  const grande = areaDaImagem({ largura: 1920, altura: 1080 }, 4 / 3);
  // Um toque no centro da imagem.
  const centro = pontoNaImagem(pequena, 400, 225);
  assert.deepEqual(centro, { x: 0.5, y: 0.5, dentro: true });
  // Numa barra preta: fora da imagem.
  assert.equal(pontoNaImagem(pequena, 20, 225).dentro, false);
  // O mesmo ponto, noutro ecrã, cai no mesmo sítio do campo.
  const p = pontoNaImagem(pequena, 250, 100);
  const noGrande = pontoNaCaixa(grande, p.x, p.y);
  const deVolta = pontoNaImagem(grande, noGrande.x, noGrande.y);
  assert.ok(Math.abs(deVolta.x - p.x) < 1e-9 && Math.abs(deVolta.y - p.y) < 1e-9);
  assert.equal(deVolta.dentro, true);
  // Sem área não há ponto.
  assert.deepEqual(pontoNaImagem({ largura: 0, altura: 0 }, 5, 5), { x: 0, y: 0, dentro: false });
});
