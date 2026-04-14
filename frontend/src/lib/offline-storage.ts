/**
 * Offline Storage Service
 * Stores chapters in IndexedDB for offline reading.
 * Uses idb-keyval-like API but implemented without external dependencies.
 */

const DB_NAME = 'BookReadingOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'chapters';

interface OfflineChapter {
  novelId: string;
  chapterNumber: number;
  title: string;
  originalTitle: string;
  content: string;
  translatedContent: string;
  downloadedAt: number;
  size: number;
}

interface OfflineNovel {
  novelId: string;
  title: string;
  author: string;
  coverUrl: string;
  chapters: OfflineChapter[];
  downloadedAt: number;
  totalSize: number;
}

class OfflineStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: ['novelId', 'chapterNumber'],
          });
          store.createIndex('novelId', 'novelId', { unique: false });
          store.createIndex('downloadedAt', 'downloadedAt', { unique: false });
        }
      };
    });
  }

  async saveChapter(chapter: OfflineChapter): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(chapter);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getChapter(novelId: string, chapterNumber: number): Promise<OfflineChapter | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get([novelId, chapterNumber]);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getNovelChapters(novelId: string): Promise<OfflineChapter[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('novelId');
      const request = index.getAll(novelId);
      request.onsuccess = () => {
        const results = request.result || [];
        resolve(results.sort((a, b) => a.chapterNumber - b.chapterNumber));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getAllNovels(): Promise<OfflineNovel[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const chapters: OfflineChapter[] = request.result || [];
        const novelMap = new Map<string, OfflineNovel>();

        chapters.forEach(ch => {
          if (!novelMap.has(ch.novelId)) {
            novelMap.set(ch.novelId, {
              novelId: ch.novelId,
              title: ch.title,
              author: '',
              coverUrl: '',
              chapters: [],
              downloadedAt: ch.downloadedAt,
              totalSize: 0,
            });
          }
          const novel = novelMap.get(ch.novelId)!;
          novel.chapters.push(ch);
          novel.totalSize += ch.size;
        });

        resolve(Array.from(novelMap.values()));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteChapter(novelId: string, chapterNumber: number): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete([novelId, chapterNumber]);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteNovel(novelId: string): Promise<void> {
    await this.init();
    const chapters = await this.getNovelChapters(novelId);
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      chapters.forEach(ch => store.delete([ch.novelId, ch.chapterNumber]));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearAll(): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getStorageUsage(): Promise<{ used: number; total: number }> {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        total: estimate.quota || 0,
      };
    }
    return { used: 0, total: 0 };
  }
}

export const offlineStorage = new OfflineStorage();
export type { OfflineChapter, OfflineNovel };
