import fs from "fs";
import path from "path";
import type { Sources, Decisions } from "./types";

// Два бэкенда: локально — файлы в data/, на Vercel (эфемерная ФС) — Vercel Blob.
// Тёплый инстанс держит данные в памяти и не перечитывает блоб на каждый запрос.

const BLOB_PREFIX = "catalog-sync/";
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

// На Vercel без Blob токена пишем в /tmp (единственное доступное место)
const DATA_DIR = useBlob
  ? path.join(process.cwd(), "data")
  : process.env.VERCEL
  ? path.join("/tmp", "catalog-sync-data")
  : path.join(process.cwd(), "data");

const cache = new Map<string, unknown>();

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function fsRead<T>(file: string, fallback: T): T {
  ensureDir();
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function fsWrite(file: string, data: unknown) {
  ensureDir();
  const p = path.join(DATA_DIR, file);
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, p);
}

async function blobRead<T>(file: string, fallback: T): Promise<T> {
  const { list } = await import("@vercel/blob");
  try {
    const { blobs } = await list({ prefix: BLOB_PREFIX + file });
    const b = blobs.find((x) => x.pathname === BLOB_PREFIX + file);
    if (!b) return fallback;
    const res = await fetch(b.url, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

async function blobWrite(file: string, data: unknown) {
  const { put } = await import("@vercel/blob");
  await put(BLOB_PREFIX + file, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function read<T>(file: string, fallback: T): Promise<T> {
  if (cache.has(file)) return cache.get(file) as T;
  const data = useBlob ? await blobRead(file, fallback) : fsRead(file, fallback);
  cache.set(file, data);
  return data;
}

async function write(file: string, data: unknown) {
  cache.set(file, data);
  if (useBlob) await blobWrite(file, data);
  else fsWrite(file, data);
}

export async function getSources(): Promise<Sources> {
  return read<Sources>("sources.json", { master: null, wc: null, zoho: null });
}

export async function saveSources(s: Sources) {
  await write("sources.json", s);
}

export async function getDecisions(): Promise<Decisions> {
  const data = await read<Decisions>("decisions.json", { products: {}, categories: {}, attributes: {}, gaps: {} });
  // fallback для обратной совместимости: старые decisions.json без gaps / attributes и т.д.
  return {
    products: data.products ?? {},
    categories: data.categories ?? {},
    attributes: data.attributes ?? {},
    gaps: data.gaps ?? {},
  };
}

export async function saveDecisions(d: Decisions) {
  await write("decisions.json", d);
}
