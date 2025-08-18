import { RateLimitError } from './errors.js';
import type { RateLimitWindow } from './types.js';

export class RateLimiter {
  private globalWindows: RateLimitWindow[] = [];
  private ipWindows = new Map<string, RateLimitWindow[]>();

  constructor(
    private globalWindowSeconds: number,
    private globalMaxRequests: number,
    private ipWindowSeconds: number,
    private ipMaxRequests: number
  ) {}

  checkLimits(ip: string): void {
    this.checkGlobalLimit();
    this.checkIpLimit(ip);
  }

  private checkGlobalLimit(): void {
    const now = Date.now();
    const windowStart = now - (this.globalWindowSeconds * 1000);

    // Remove expired windows
    this.globalWindows = this.globalWindows.filter(w => w.resetTime > now);

    // Count requests in current window
    const requestsInWindow = this.globalWindows
      .filter(w => w.resetTime > windowStart)
      .reduce((sum, w) => sum + w.count, 0);

    if (requestsInWindow >= this.globalMaxRequests) {
      const retryAfter = Math.ceil(((this.globalWindows[0]?.resetTime || now) - now) / 1000) || this.globalWindowSeconds;
      throw new RateLimitError(retryAfter);
    }

    // Add current request
    this.globalWindows.push({
      count: 1,
      resetTime: now + (this.globalWindowSeconds * 1000)
    });
  }

  private checkIpLimit(ip: string): void {
    const now = Date.now();
    const windowStart = now - (this.ipWindowSeconds * 1000);

    let ipWindows = this.ipWindows.get(ip) || [];

    // Remove expired windows
    ipWindows = ipWindows.filter(w => w.resetTime > now);

    // Count requests in current window
    const requestsInWindow = ipWindows
      .filter(w => w.resetTime > windowStart)
      .reduce((sum, w) => sum + w.count, 0);

    if (requestsInWindow >= this.ipMaxRequests) {
      const retryAfter = Math.ceil(((ipWindows[0]?.resetTime || now) - now) / 1000) || this.ipWindowSeconds;
      throw new RateLimitError(retryAfter);
    }

    // Add current request
    ipWindows.push({
      count: 1,
      resetTime: now + (this.ipWindowSeconds * 1000)
    });

    this.ipWindows.set(ip, ipWindows);
  }

  cleanup(): void {
    const now = Date.now();

    // Clean global windows
    this.globalWindows = this.globalWindows.filter(w => w.resetTime > now);

    // Clean IP windows
    for (const [ip, windows] of this.ipWindows.entries()) {
      const activeWindows = windows.filter(w => w.resetTime > now);
      if (activeWindows.length === 0) {
        this.ipWindows.delete(ip);
      } else {
        this.ipWindows.set(ip, activeWindows);
      }
    }
  }
}