// Нормализация SKU, названий и заголовков из грязных исходников

export function cleanSku(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\D/g, "");
}

// Убирает маркеры типа '*** и лишние пробелы из названий
export function cleanName(v: unknown): { name: string; flagged: boolean } {
  if (v === null || v === undefined) return { name: "", flagged: false };
  let s = String(v).trim();
  const flagged = /^['*]+/.test(s);
  s = s.replace(/^['*\s]+/, "").replace(/\s+/g, " ").trim();
  return { name: s, flagged };
}

export interface ParsedHeader {
  /** имя без суффикса, обрезанное */
  name: string;
  /** оригинал */
  raw: string;
  /** помечен как фильтр на сайте */
  isFilter: boolean;
  /** служебное поле, не атрибут */
  isNA: boolean;
}

export function parseHeader(raw: string): ParsedHeader {
  const trimmed = String(raw).trim();
  const m = trimmed.match(/^(.*?)\s*\/\s*(filter|na)\s*$/i);
  if (m) {
    const suffix = m[2].toLowerCase();
    return {
      name: m[1].trim(),
      raw: trimmed,
      isFilter: suffix === "filter",
      isNA: suffix === "na",
    };
  }
  return { name: trimmed, raw: trimmed, isFilter: false, isNA: false };
}

/** Нормализация строки для fuzzy-сравнения */
export function fuzzyKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/['"’”]/g, "")
    .replace(/[^a-z0-9а-яё]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenSet(s: string): Set<string> {
  return new Set(fuzzyKey(s).split(" ").filter(Boolean));
}
