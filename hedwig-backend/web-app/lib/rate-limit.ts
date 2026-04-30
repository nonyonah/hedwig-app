/**
 * Lightweight in-memory rate limiter for Next.js route handlers.
 *
 * - Keys per-user (access-token cookie) when present, otherwise per-IP.
 * - Uses a fixed-window counter — simple, fast, no external deps.
 * - Per-instance only: on Cloud Run with multiple containers, abusers can
 *   amplify limits by N (one bucket per container). For a higher-stakes
 *   limit, swap this out for a Redis-backed implementation.
 *
 * Usage in a route handler:
 *
 *   const limit = checkRateLimit(req, { name: 'assistant_chat', limit: 30, windowMs: 60_000 });
 *   if (!limit.ok) return rateLimitResponse(limit.retryAfter);
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface Bucket {
  tokens: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;

export interface RateLimitOptions {
  /** Namespaces buckets so different routes don't share counters. */
  name: string;
  /** Maximum requests allowed in `windowMs`. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; retryAfter: number; resetAt: number };

function maybeSweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function getClientKey(req: NextRequest): string {
  const token = req.cookies.get('hedwig_access_token')?.value;
  if (token) return `token:${token.slice(0, 32)}`;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return `ip:${xff.split(',')[0].trim()}`;
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return `ip:${realIp}`;
  return 'anon';
}

export function checkRateLimit(req: NextRequest, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  maybeSweep(now);
  const key = `${options.name}:${getClientKey(req)}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + options.windowMs;
    buckets.set(key, { tokens: options.limit - 1, resetAt });
    return { ok: true, remaining: options.limit - 1, resetAt };
  }

  if (bucket.tokens <= 0) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      resetAt: bucket.resetAt,
    };
  }

  bucket.tokens -= 1;
  return { ok: true, remaining: bucket.tokens, resetAt: bucket.resetAt };
}

export function rateLimitResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { success: false, error: `Too many requests. Try again in ${retryAfter}s.` },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'Cache-Control': 'no-store',
      },
    },
  );
}
