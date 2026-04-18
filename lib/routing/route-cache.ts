import { openDB, type IDBPDatabase } from 'idb';
import type { Route } from '@/lib/types';

interface RoutesSchema {
  routes: {
    key: string;
    value: Route;
  };
}

const DB_NAME = 'rettungsleitstelle';
const STORE = 'routes';
const VERSION = 1;

let dbPromise: Promise<IDBPDatabase<RoutesSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<RoutesSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<RoutesSchema>(DB_NAME, VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function getCachedRoute(id: string): Promise<Route | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  const db = await getDb();
  return db.get(STORE, id);
}

export async function putCachedRoute(route: Route): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await getDb();
  await db.put(STORE, route, route.id);
}

export async function clearRouteCache(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await getDb();
  await db.clear(STORE);
}

// In-Memory-Cache als zusaetzliche Schicht (und als Fallback fuer SSR/Node).
// Fuellt sich aus IndexedDB auf Abruf.
const memory = new Map<string, Route>();

export function getMemRoute(id: string): Route | undefined {
  return memory.get(id);
}

export function putMemRoute(route: Route): void {
  memory.set(route.id, route);
}

export function clearMemCache(): void {
  memory.clear();
}

export function memCacheSize(): number {
  return memory.size;
}
