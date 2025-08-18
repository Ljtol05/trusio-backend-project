
import type { RateLimitWindow } from './types.js';
import { RateLimitError } from './errors.js';

export class RateLimiter {
  private globalWindow: RateLimitWindow;
  private ipWindows: Map<string, RateLimitWindow> = new Map();
  
  constructor(
    private globalWindowSeconds: number,
    private globalMax: number,
    private ipWindowSeconds: number,
    private ipMax: number
  ) {
    this.globalWindow = { count: 0, resetTime: Date.now() + globalWindowSeconds * 1000 };
  }

  checkGlobalLimit(): void {
    const now = Date.now();
    
    if (now >= this.globalWindow.resetTime) {
      this.globalWindow = {
        count: 1,
        resetTime: now + this.globalWindowSeconds * 1000,
      };
      return;
    }

    if (this.globalWindow.count >= this.globalMax) {
      const retryAfterSeconds = Math.ceil((this.globalWindow.resetTime - now) / 1000);
      throw new RateLimitError(retryAfterSeconds);
    }

    this.globalWindow.count++;
  }

  checkIpLimit(ip: string): void {
    const now = Date.now();
    let ipWindow = this.ipWindows.get(ip);

    if (!ipWindow || now >= ipWindow.resetTime) {
      ipWindow = {
        count: 1,
        resetTime: now + this.ipWindowSeconds * 1000,
      };
      this.ipWindows.set(ip, ipWindow);
      return;
    }

    if (ipWindow.count >= this.ipMax) {
      const retryAfterSeconds = Math.ceil((ipWindow.resetTime - now) / 1000);
      throw new RateLimitError(retryAfterSeconds);
    }

    ipWindow.count++;
  }

  checkLimits(ip: string): void {
    this.checkGlobalLimit();
    this.checkIpLimit(ip);
  }

  // Cleanup old IP windows periodically
  cleanup(): void {
    const now = Date.now();
    for (const [ip, window] of this.ipWindows.entries()) {
      if (now >= window.resetTime) {
        this.ipWindows.delete(ip);
      }
    }
  }
}
import type { RateLimitWindow } from './types.js';

export class RateLimiter {
  private globalWindow: RateLimitWindow;
  private ipWindows: Map<string, RateLimitWindow> = new Map();

  constructor(
    private globalWindowSeconds: number,
    private globalMax: number,
    private ipWindowSeconds: number,
    private ipMax: number
  ) {
    this.globalWindow = { count: 0, resetTime: Date.now() + globalWindowSeconds * 1000 };
  }

  checkLimits(ip: string): void {
    const now = Date.now();

    // Check global rate limit
    if (now > this.globalWindow.resetTime) {
      this.globalWindow = { count: 0, resetTime: now + this.globalWindowSeconds * 1000 };
    }

    if (this.globalWindow.count >= this.globalMax) {
      throw new Error('Global rate limit exceeded');
    }

    // Check IP rate limit
    let ipWindow = this.ipWindows.get(ip);
    if (!ipWindow || now > ipWindow.resetTime) {
      ipWindow = { count: 0, resetTime: now + this.ipWindowSeconds * 1000 };
      this.ipWindows.set(ip, ipWindow);
    }

    if (ipWindow.count >= this.ipMax) {
      throw new Error('IP rate limit exceeded');
    }

    // Increment counters
    this.globalWindow.count++;
    ipWindow.count++;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [ip, window] of this.ipWindows) {
      if (now > window.resetTime) {
        this.ipWindows.delete(ip);
      }
    }
  }
}
