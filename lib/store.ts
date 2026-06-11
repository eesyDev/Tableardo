import { Redis } from "@upstash/redis";
import type { Sources, Decisions } from "./types";

// In-memory fallback (если Redis не настроен)
const sourcesCache: Sources = { master: null, wc: null, zoho: null };
const decisionsCache: Decisions = {
  products: {},
  categories: {},
  attributes: {},
  gaps: {},
};

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = Boolean(redisUrl && redisToken);

const redis = useRedis
  ? new Redis({
      url: redisUrl,
      token: redisToken,
    })
  : null;

export async function getSources(): Promise<Sources> {
  if (redis) {
    const data = await redis.get<Sources>("sources");
    return data ?? { master: null, wc: null, zoho: null };
  }
  return {
    master: sourcesCache.master,
    wc: sourcesCache.wc,
    zoho: sourcesCache.zoho,
  };
}

export async function saveSources(s: Sources) {
  if (redis) {
    await redis.set("sources", s);
    return;
  }
  sourcesCache.master = s.master ? { ...s.master } : null;
  sourcesCache.wc = s.wc ? { ...s.wc } : null;
  sourcesCache.zoho = s.zoho ? { ...s.zoho } : null;
}

export async function getDecisions(): Promise<Decisions> {
  if (redis) {
    const data = await redis.get<Decisions>("decisions");
    return data ?? { products: {}, categories: {}, attributes: {}, gaps: {} };
  }
  return {
    products: { ...decisionsCache.products },
    categories: { ...decisionsCache.categories },
    attributes: { ...decisionsCache.attributes },
    gaps: { ...decisionsCache.gaps },
  };
}

export async function saveDecisions(d: Decisions) {
  if (redis) {
    await redis.set("decisions", d);
    return;
  }
  decisionsCache.products = { ...d.products };
  decisionsCache.categories = { ...d.categories };
  decisionsCache.attributes = { ...d.attributes };
  decisionsCache.gaps = { ...d.gaps };
}
