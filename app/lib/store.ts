import fs from "fs";
import path from "path";
import type { Sources, Decisions } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  ensureDir();
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  ensureDir();
  const p = path.join(DATA_DIR, file);
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, p);
}

export function getSources(): Sources {
  return readJson<Sources>("sources.json", { master: null, wc: null, zoho: null });
}

export function saveSources(s: Sources) {
  writeJson("sources.json", s);
}

export function getDecisions(): Decisions {
  return readJson<Decisions>("decisions.json", { products: {}, categories: {}, attributes: {} });
}

export function saveDecisions(d: Decisions) {
  writeJson("decisions.json", d);
}
