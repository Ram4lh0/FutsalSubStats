// lib/data/local.js
// Camada fina sobre IndexedDB — a cópia que vive no dispositivo.
//
// Os nomes das object stores são iguais aos das tabelas PostgreSQL, e os campos
// são os mesmos em camelCase. É isso que torna a sincronização com o Supabase
// uma tradução de nomes (ver mappers.js) e não uma conversão de modelo.
//
// Esta é a fonte de verdade enquanto o jogo decorre: escreve-se aqui primeiro,
// sempre, e só depois se tenta enviar. Um pavilhão sem rede não muda nada.

const DB_NAME = 'futsal-live';
const DB_VERSION = 6;

export const STORES = {
  profile: 'profile',
  clubs: 'clubs',
  // Escalões: a unidade de trabalho real. Um clube é só o guarda-chuva.
  teams: 'teams',
  competitions: 'competitions',
  players: 'players',
  matches: 'matches',
  matchSquad: 'match_squad',
  matchEvents: 'match_events',
  // A aba Treino (versão 4): rotina semanal, treinos, presenças e jogadas.
  trainingRoutines: 'training_routines',
  trainingSessions: 'training_sessions',
  trainingAttendance: 'training_attendance',
  plays: 'plays',
  // Registos extra ligados por escalão (versão 5). Só de leitura: vem do
  // servidor e nunca sobe. Uma linha por escalão, chave `teamId`.
  teamStatConfig: 'team_stat_config',
  // Fotos dos atletas (versão 6): uma linha por jogador, chave = id do jogador.
  // À parte dos jogadores para o plantel não arrastar as imagens a cada envio.
  playerPhotos: 'player_photos',
};

/* Linhas por enviar: quem tem `dirty` ainda não chegou ao servidor. */
export const DIRTY = 'dirty';

let dbPromise = null;
let memoryMode = false;
const memory = {};

function initMemory() {
  memoryMode = true;
  for (const s of Object.values(STORES)) memory[s] = new Map();
  try {
    const raw = localStorage.getItem('futsal-live-memory');
    if (raw) {
      const data = JSON.parse(raw);
      for (const [s, rows] of Object.entries(data)) {
        memory[s] = new Map(rows.map((r) => [r.id, r]));
      }
    }
  } catch {
    /* ignora */
  }
}

function persistMemory() {
  try {
    const data = {};
    for (const [s, map] of Object.entries(memory)) data[s] = [...map.values()];
    localStorage.setItem('futsal-live-memory', JSON.stringify(data));
  } catch {
    /* quota — ignora */
  }
}

export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      initMemory();
      return resolve(null);
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      initMemory();
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.profile))
        db.createObjectStore(STORES.profile, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.clubs))
        db.createObjectStore(STORES.clubs, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.teams)) {
        const s = db.createObjectStore(STORES.teams, { keyPath: 'id' });
        s.createIndex('by_club', 'clubId');
      }
      if (!db.objectStoreNames.contains(STORES.competitions)) {
        const s = db.createObjectStore(STORES.competitions, { keyPath: 'id' });
        s.createIndex('by_team', 'teamId');
      }
      if (!db.objectStoreNames.contains(STORES.players)) {
        const s = db.createObjectStore(STORES.players, { keyPath: 'id' });
        s.createIndex('by_club', 'clubId');
      }
      if (!db.objectStoreNames.contains(STORES.matches)) {
        const s = db.createObjectStore(STORES.matches, { keyPath: 'id' });
        s.createIndex('by_club', 'clubId');
      }
      // Índices por escalão: acrescentados na versão 3, tanto em bases novas
      // como nas que já existiam.
      for (const nome of [STORES.players, STORES.matches]) {
        const os = req.transaction.objectStore(nome);
        if (!os.indexNames.contains('by_team')) os.createIndex('by_team', 'teamId');
      }
      if (!db.objectStoreNames.contains(STORES.matchSquad)) {
        const s = db.createObjectStore(STORES.matchSquad, { keyPath: 'id' });
        s.createIndex('by_match', 'matchId');
      }
      if (!db.objectStoreNames.contains(STORES.matchEvents)) {
        const s = db.createObjectStore(STORES.matchEvents, { keyPath: 'id' });
        s.createIndex('by_match', 'matchId');
        s.createIndex('by_client_event', 'clientEventId', { unique: true });
        s.createIndex('by_sync', 'syncedAtIndex');
      }
      for (const nome of [STORES.trainingRoutines, STORES.trainingSessions, STORES.plays]) {
        if (!db.objectStoreNames.contains(nome)) {
          const s = db.createObjectStore(nome, { keyPath: 'id' });
          s.createIndex('by_team', 'teamId');
        }
      }
      if (!db.objectStoreNames.contains(STORES.trainingAttendance)) {
        const s = db.createObjectStore(STORES.trainingAttendance, { keyPath: 'id' });
        s.createIndex('by_session', 'sessionId');
      }
      if (!db.objectStoreNames.contains(STORES.playerPhotos)) {
        const s = db.createObjectStore(STORES.playerPhotos, { keyPath: 'id' });
        s.createIndex('by_team', 'teamId');
      }
      if (!db.objectStoreNames.contains(STORES.teamStatConfig)) {
        db.createObjectStore(STORES.teamStatConfig, { keyPath: 'teamId' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Outro separador precisa de subir a versão da base (uma versão nova da
      // app): este fecha a ligação e recarrega, já com o código novo. Sem isto,
      // o outro separador ficava parado em "A carregar" à espera deste.
      db.onversionchange = () => {
        db.close();
        if (typeof window !== 'undefined') window.location.reload();
      };
      esconderAvisoBloqueio();
      resolve(db);
    };
    // Um separador antigo (ainda sem o `onversionchange` acima) não larga a
    // base. O pedido fica à espera até ele fechar; avisa-se quem está a olhar.
    req.onblocked = () => mostrarAvisoBloqueio();
    req.onerror = () => {
      initMemory();
      resolve(null);
    };
  });
  return dbPromise;
}

/* Aviso de base bloqueada. Em DOM simples, e não em React: aparece antes de a
   app ter dados para desenhar o que quer que seja. O texto vive aqui (e não nos
   dicionários) porque este ficheiro corre antes de tudo o resto. */
const AVISO_BLOQUEIO = {
  pt: 'A app está aberta noutro separador com uma versão antiga. Fecha ou recarrega os outros separadores da Futsal SubStats para continuar.',
  en: 'The app is open in another tab with an older version. Close or reload the other Futsal SubStats tabs to continue.',
  es: 'La app está abierta en otra pestaña con una versión antigua. Cierra o recarga las otras pestañas de Futsal SubStats para continuar.',
};

function mostrarAvisoBloqueio() {
  if (typeof document === 'undefined' || document.getElementById('aviso-base-bloqueada')) return;
  const lingua = String(document.documentElement.lang || 'pt').slice(0, 2);
  const aviso = document.createElement('div');
  aviso.id = 'aviso-base-bloqueada';
  aviso.setAttribute('role', 'alert');
  aviso.textContent = AVISO_BLOQUEIO[lingua] || AVISO_BLOQUEIO.pt;
  Object.assign(aviso.style, {
    position: 'fixed', left: '16px', right: '16px', top: '16px', zIndex: '9999',
    padding: '14px 16px', borderRadius: '14px', font: '600 15px/1.4 system-ui, sans-serif',
    background: '#f59e0b', color: '#1f1300', boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
  });
  document.body.appendChild(aviso);
}

function esconderAvisoBloqueio() {
  if (typeof document === 'undefined') return;
  document.getElementById('aviso-base-bloqueada')?.remove();
}

export function isMemoryMode() {
  return memoryMode;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function put(store, value) {
  const db = await open();
  if (!db) {
    memory[store].set(value.id, value);
    persistMemory();
    return value;
  }
  await wrap(tx(db, store, 'readwrite').put(value));
  return value;
}

export async function putMany(store, values) {
  const db = await open();
  if (!db) {
    for (const v of values) memory[store].set(v.id, v);
    persistMemory();
    return values;
  }
  const t = db.transaction(store, 'readwrite');
  const os = t.objectStore(store);
  for (const v of values) os.put(v);
  await new Promise((res, rej) => {
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
  return values;
}

export async function get(store, id) {
  const db = await open();
  if (!db) return memory[store].get(id) || null;
  return (await wrap(tx(db, store, 'readonly').get(id))) || null;
}

export async function all(store) {
  const db = await open();
  if (!db) return [...memory[store].values()];
  return await wrap(tx(db, store, 'readonly').getAll());
}

export async function byIndex(store, index, value) {
  const db = await open();
  if (!db) {
    const field = {
      by_club: 'clubId',
      by_match: 'matchId',
      by_team: 'teamId',
      by_session: 'sessionId',
    }[index];
    return [...memory[store].values()].filter((r) => r[field] === value);
  }
  return await wrap(tx(db, store, 'readonly').index(index).getAll(value));
}

export async function del(store, id) {
  const db = await open();
  if (!db) {
    memory[store].delete(id);
    persistMemory();
    return;
  }
  await wrap(tx(db, store, 'readwrite').delete(id));
}

export async function clearAll() {
  const db = await open();
  if (!db) {
    for (const s of Object.values(STORES)) memory[s].clear();
    persistMemory();
    return;
  }
  const names = Object.values(STORES);
  const t = db.transaction(names, 'readwrite');
  for (const n of names) t.objectStore(n).clear();
  await new Promise((res, rej) => {
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}
