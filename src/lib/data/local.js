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
const DB_VERSION = 2;

export const STORES = {
  profile: 'profile',
  clubs: 'clubs',
  players: 'players',
  matches: 'matches',
  matchSquad: 'match_squad',
  matchEvents: 'match_events',
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
      if (!db.objectStoreNames.contains(STORES.players)) {
        const s = db.createObjectStore(STORES.players, { keyPath: 'id' });
        s.createIndex('by_club', 'clubId');
      }
      if (!db.objectStoreNames.contains(STORES.matches)) {
        const s = db.createObjectStore(STORES.matches, { keyPath: 'id' });
        s.createIndex('by_club', 'clubId');
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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      initMemory();
      resolve(null);
    };
  });
  return dbPromise;
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
    const field = { by_club: 'clubId', by_match: 'matchId' }[index];
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
