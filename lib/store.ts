import type { Sources, Decisions } from "./types";

// In-memory storage — никаких файлов, никаких токенов.
// Данные живут в RAM тёплого инстанса. Для 800 товаров — более чем достаточно.

const sourcesCache: Sources = { master: null, wc: null, zoho: null };

const decisionsCache: Decisions = {
  products: {},
  categories: {},
  attributes: {},
  gaps: {},
};

export async function getSources(): Promise<Sources> {
  return {
    master: sourcesCache.master,
    wc: sourcesCache.wc,
    zoho: sourcesCache.zoho,
  };
}

export async function saveSources(s: Sources) {
  sourcesCache.master = s.master ? { ...s.master } : null;
  sourcesCache.wc = s.wc ? { ...s.wc } : null;
  sourcesCache.zoho = s.zoho ? { ...s.zoho } : null;
}

export async function getDecisions(): Promise<Decisions> {
  return {
    products: { ...decisionsCache.products },
    categories: { ...decisionsCache.categories },
    attributes: { ...decisionsCache.attributes },
    gaps: { ...decisionsCache.gaps },
  };
}

export async function saveDecisions(d: Decisions) {
  decisionsCache.products = { ...d.products };
  decisionsCache.categories = { ...d.categories };
  decisionsCache.attributes = { ...d.attributes };
  decisionsCache.gaps = { ...d.gaps };
}
