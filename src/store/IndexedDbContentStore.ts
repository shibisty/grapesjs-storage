import { MemoryContentStore } from './MemoryContentStore';
import type { Entry, Template } from './types';

const STORE = 'content';
const VERSION = 1;

/**
 * Local backend: everything in one IndexedDB database (object store
 * `content`, records `{ key: 'template:<id>' | 'entry:<id>', value }`).
 * Kept in memory once loaded; every change is written through.
 */
export class IndexedDbContentStore extends MemoryContentStore {
  private dbp: Promise<IDBDatabase> | null = null;
  private loaded: Promise<void> | null = null;

  constructor(
    readonly dbName = 'gjs-storage',
    private readonly factory: IDBFactory | undefined = typeof indexedDB !== 'undefined' ? indexedDB : undefined
  ) {
    super();
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbp) return this.dbp;
    const factory = this.factory;
    if (!factory) return Promise.reject(new Error('IndexedDB is not available'));
    this.dbp = new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(this.dbName, VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          this.dbp = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
    this.dbp.catch(() => (this.dbp = null));
    return this.dbp;
  }

  /** Loads the database into memory once. */
  protected load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = this.open().then(
        (db) =>
          new Promise<void>((resolve, reject) => {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
            req.onsuccess = () => {
              (req.result as Array<{ key: string; value: unknown }>).forEach(({ key, value }) => {
                if (key.startsWith('template:')) this.templates.set(key.slice(9), value as Template);
                else if (key.startsWith('entry:')) this.entries.set(key.slice(6), value as Entry);
              });
              resolve();
            };
            req.onerror = () => reject(req.error);
          })
      );
      this.loaded.catch(() => (this.loaded = null));
    }
    return this.loaded;
  }

  /** Writes the whole state (small: templates and entries of one site). */
  protected async changed(): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const s = tx.objectStore(STORE);
      s.clear();
      this.templates.forEach((value, id) => s.put({ key: `template:${id}`, value }));
      this.entries.forEach((value, id) => s.put({ key: `entry:${id}`, value }));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  close(): void {
    void this.dbp?.then((db) => db.close());
    this.dbp = null;
  }
}

// Every read and write waits for the database to be loaded first.
for (const m of ['listTemplates', 'getTemplate', 'saveTemplate', 'deleteTemplate', 'listEntries', 'getEntry', 'putEntry', 'deleteEntry', 'publishEntry'] as const) {
  const base = MemoryContentStore.prototype[m] as (...a: unknown[]) => Promise<unknown>;
  (IndexedDbContentStore.prototype as any)[m] = async function (this: any, ...args: unknown[]) {
    await this.load();
    return base.apply(this, args);
  };
}
