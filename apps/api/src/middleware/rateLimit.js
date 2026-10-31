// Limitation des tentatives, en mémoire.
import { config } from '../config.js';
import { tooMany } from '../lib/errors.js';

let enabled = config.rateLimits;

export function setRateLimiting(value) {
  enabled = value;
}

export class RateLimiter {
  constructor({ max, windowMs }) {
    this.max = max;
    this.windowMs = windowMs;
    this.hits = new Map();
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
    }, windowMs).unref();
  }

  #entry(key) {
    const now = Date.now();
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, entry);
    }
    return entry;
  }

  check(key) {
    if (!enabled) return;
    const entry = this.#entry(key);
    if (entry.count >= this.max) throw tooMany((entry.resetAt - Date.now()) / 1000);
  }

  hit(key) {
    if (!enabled) return;
    this.#entry(key).count += 1;
  }

  reset(key) {
    this.hits.delete(key);
  }
}

const MINUTE = 60_000;
export const limiters = {
  loginByIp: new RateLimiter({ max: 30, windowMs: 15 * MINUTE }),
  loginByUser: new RateLimiter({ max: 10, windowMs: 15 * MINUTE }),
  registerByIp: new RateLimiter({ max: 10, windowMs: 60 * MINUTE }),
  recoverByIp: new RateLimiter({ max: 10, windowMs: 15 * MINUTE }),
  recoverByUser: new RateLimiter({ max: 5, windowMs: 15 * MINUTE }),
  passwordByUser: new RateLimiter({ max: 10, windowMs: 15 * MINUTE }),
};
