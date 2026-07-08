import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { AppBindings } from '../types';

export const metaRoutes = new Hono<AppBindings>();

// Cidade (pela geolocalização de IP do Cloudflare) + temperatura atual
// (Open-Meteo, gratuita e sem chave). Usado pelo widget discreto do topo.
metaRoutes.get('/context', requireAuth, async (c) => {
  const cf = ((c.req.raw as unknown as { cf?: Record<string, unknown> }).cf ?? {}) as Record<string, unknown>;
  const city = (cf.city as string) || c.req.header('cf-ipcity') || null;
  const region = (cf.region as string) || null;
  const country = (cf.country as string) || c.req.header('cf-ipcountry') || null;
  const lat = cf.latitude != null ? Number(cf.latitude) : null;
  const lon = cf.longitude != null ? Number(cf.longitude) : null;

  let temperature: number | null = null;
  if (lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
    try {
      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m`,
        { cf: { cacheTtl: 900, cacheEverything: true } } as RequestInit
      );
      if (r.ok) {
        const d = (await r.json()) as { current?: { temperature_2m?: number } };
        if (typeof d?.current?.temperature_2m === 'number') temperature = Math.round(d.current.temperature_2m);
      }
    } catch {
      /* silencioso: o widget mostra sem a temperatura */
    }
  }

  return c.json({ city, region, country, temperature });
});
