import type { Env } from '../types';

// Limitador de taxa com janela fixa, usando KV.
// Camada básica anti-brute-force; pode evoluir para o Rate Limiting nativo
// da Cloudflare ou Durable Objects em um hardening futuro.
export async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const k = `rl:${key}:${bucket}`;
  const current = Number((await env.CACHE.get(k)) ?? '0');
  if (current >= limit) return false;
  await env.CACHE.put(k, String(current + 1), { expirationTtl: windowSec * 2 });
  return true;
}

export function clientIp(headers: Headers): string {
  return headers.get('CF-Connecting-IP') ?? headers.get('X-Forwarded-For') ?? 'local';
}
