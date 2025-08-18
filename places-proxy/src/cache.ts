
import { LRUCache } from 'lru-cache';

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

export class TTLCache<T> {
  private cache: LRUCache<string, CacheEntry<T>>;

  constructor(maxItems: number) {
    this.cache = new LRUCache<string, CacheEntry<T>>({
      max: maxItems,
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
import { LRUCache } from 'lru-cache';

export class TTLCache {
  private cache: LRUCache<string, any>;

  constructor(maxItems: number) {
    this.cache = new LRUCache({
      max: maxItems,
      ttl: 1000 * 60 * 5, // 5 minutes default
    });
  }

  get(key: string): any {
    return this.cache.get(key);
  }

  set(key: string, value: any, ttlSeconds?: number): void {
    const options = ttlSeconds ? { ttl: ttlSeconds * 1000 } : {};
    this.cache.set(key, value, options);
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}
