import { LRUCache } from 'lru-cache';

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

export class TTLCache<T = any> {
  private cache: LRUCache<string, CacheEntry<T>>;

  constructor(maxItems: number = 2000) {
    this.cache = new LRUCache<string, CacheEntry<T>>({
      max: maxItems,
      allowStale: false,
      updateAgeOnGet: false,
    });
  }

  set(key: string, value: T, ttlSeconds: number): void {
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: ttlSeconds * 1000,
    };
    this.cache.set(key, entry);
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}