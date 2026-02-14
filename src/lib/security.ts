/**
 * Security utilities for input validation and rate limiting.
 */

/** Trim and truncate a string. Returns null if empty after trim. */
export function sanitizeString(val: unknown, maxLen: number): string | null {
  if (val == null || typeof val !== "string") return null;
  const trimmed = val.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLen);
}

/** Validate an email address (loose but reasonable). */
export function isValidEmail(val: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) && val.length <= 254;
}

/** Validate a phone number (digits, spaces, dashes, parens, +). */
export function isValidPhone(val: string): boolean {
  return /^[0-9\s\-().+]{7,20}$/.test(val);
}

/** Parse a value as a positive integer, or return null. */
export function safePositiveInt(val: unknown): number | null {
  if (val == null) return null;
  const n = typeof val === "number" ? val : parseInt(String(val), 10);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

/** Pick only allowed keys from an object. */
export function pickFields<T extends Record<string, unknown>>(
  obj: T,
  allowed: string[]
): Partial<T> {
  const result: Partial<T> = {};
  for (const key of allowed) {
    if (key in obj) {
      (result as Record<string, unknown>)[key] = obj[key];
    }
  }
  return result;
}

/**
 * Simple in-memory rate limiter.
 * Tracks submissions per IP with a sliding window.
 */
class RateLimiter {
  private requests = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /** Returns true if the request should be allowed. */
  check(key: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    const valid = timestamps.filter((t) => now - t < this.windowMs);

    if (valid.length >= this.maxRequests) {
      this.requests.set(key, valid);
      return false;
    }

    valid.push(now);
    this.requests.set(key, valid);

    // Periodic cleanup (every 100 keys)
    if (this.requests.size > 500) {
      for (const [k, v] of this.requests) {
        const filtered = v.filter((t) => now - t < this.windowMs);
        if (filtered.length === 0) this.requests.delete(k);
        else this.requests.set(k, filtered);
      }
    }

    return true;
  }
}

/** Rate limiter for public inquiry submissions: 5 per 15 minutes per IP */
export const inquiryRateLimiter = new RateLimiter(15 * 60 * 1000, 5);

/** Rate limiter for import: 10 per minute per IP */
export const importRateLimiter = new RateLimiter(60 * 1000, 10);

/** Extract client IP from request headers. */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
