import type { Sources, Decisions } from "./types";
import { buildMatchRows, groupSimilar, similarity } from "./match";
import { fuzzyKey } from "./normalize";
import type { MasterProduct, WcProduct } from "./types";

export interface CategoryGroup {
  /** предлагаемое каноничное имя */
  suggested: string;
  variants: { value: string; sources: string[]; count: number }[];
  decided: boolean;
}

export interface AttributeValueGroup {
  suggested: string;
  variants: string[];
}

export interface AttributeGroup {
  suggested: string;
  nameVariants: { value: string; sources: string[] }[];
  valueGroups: AttributeValueGroup[];
  isFilter: boolean;
  decided: boolean;
}

function pickCanonical(variants: { value: string; count: number }[]): string {
  // самый частый; при равенстве — самый длинный (обычно полное название)
  return [...variants].sort((a, b) => b.count - a.count || b.value.length - a.value.length)[0].value;
}

/**
 * Ключ категории: лист иерархии ("Buckets > Digging Bucket" -> "digging bucket")
 * с приведением множественного числа ("Bucket Pins" ~ "Bucket Pin")
 */
function categoryKey(c: string): string {
  const leaf = c.split(">").pop() ?? c;
  return fuzzyKey(leaf)
    .split(" ")
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t))
    .join(" ");
}

/** Группирует категории: сначала по ключу листа, затем fuzzy-слияние похожих ключей */
function groupCategories(values: string[]): string[][] {
  const byKey = new Map<string, string[]>();
  for (const v of values) {
    const k = categoryKey(v);
    byKey.set(k, [...(byKey.get(k) ?? []), v]);
  }
  const keys = [...byKey.keys()];
  const merged: string[][] = [];
  const used = new Set<string>();
  for (const k of keys) {
    if (used.has(k)) continue;
    used.add(k);
    const group = [...byKey.get(k)!];
    for (const k2 of keys) {
      if (used.has(k2)) continue;
      if (similarity(k, k2) >= 86) {
        group.push(...byKey.get(k2)!);
        used.add(k2);
      }
    }
    merged.push(group);
  }
  return merged;
}

export function buildCategoryQueue(sources: Sources, decisions: Decisions): CategoryGroup[] {
  const counts = new Map<string, { count: number; sources: Set<string> }>();
  const add = (v: string, src: string) => {
    const key = v.trim();
    if (!key) return;
    const e = counts.get(key) ?? { count: 0, sources: new Set<string>() };
    e.count++;
    e.sources.add(src);
    counts.set(key, e);
  };
  for (const p of sources.master?.products ?? []) add(p.category, "master");
  for (const p of sources.wc?.products ?? []) for (const c of p.categories) add(c, "wc");

  const groups = groupCategories([...counts.keys()]);
  return groups
    .filter((g) => g.length > 1)
    .map((g) => {
      const variants = g.map((v) => ({
        value: v,
        sources: [...(counts.get(v)?.sources ?? [])],
        count: counts.get(v)?.count ?? 0,
      }));
      const decided = g.every((v) => decisions.categories[v]);
      // предпочитаем иерархичное имя с сайта ("Parent > Leaf") — оно нужно для импорта
      const hierarchical = variants.filter((v) => v.value.includes(">"));
      const suggested = hierarchical.length > 0 ? pickCanonical(hierarchical) : pickCanonical(variants);
      return { suggested, variants, decided };
    })
    .sort((a, b) => Number(a.decided) - Number(b.decided));
}

/**
 * Сливает группы имён "Carrier Weight Class" и "Carrier Weight Class (tn)":
 * базы без скобок совпадают и хотя бы у одного имени скобок нет.
 * "(tn)" и "(lb)" остаются раздельными — это разные единицы.
 */
function mergeUnitVariants(groups: string[][]): string[][] {
  const stripParens = (s: string) => fuzzyKey(s.replace(/\s*\([^)]*\)\s*$/, ""));
  const hasParens = (s: string) => /\([^)]*\)\s*$/.test(s);
  const result: string[][] = [];
  const consumed = new Set<number>();
  for (let i = 0; i < groups.length; i++) {
    if (consumed.has(i)) continue;
    const merged = [...groups[i]];
    for (let j = i + 1; j < groups.length; j++) {
      if (consumed.has(j)) continue;
      const pairable = merged.some((a) =>
        groups[j].some((b) => stripParens(a) === stripParens(b) && (!hasParens(a) || !hasParens(b)))
      );
      if (pairable) {
        merged.push(...groups[j]);
        consumed.add(j);
      }
    }
    result.push(merged);
  }
  return result;
}

export function buildAttributeQueue(sources: Sources, decisions: Decisions): AttributeGroup[] {
  // имя атрибута -> { sources, values: Map<value, count>, isFilter }
  const attrMap = new Map<string, { sources: Set<string>; values: Map<string, number>; isFilter: boolean }>();
  const add = (name: string, value: string, src: string, isFilter: boolean) => {
    const e = attrMap.get(name) ?? { sources: new Set<string>(), values: new Map<string, number>(), isFilter: false };
    e.sources.add(src);
    e.isFilter = e.isFilter || isFilter;
    const v = value.trim();
    if (v) e.values.set(v, (e.values.get(v) ?? 0) + 1);
    attrMap.set(name, e);
  };
  for (const p of sources.master?.products ?? []) {
    for (const [n, v] of Object.entries(p.attrs)) add(n, v, "master", p.filterAttrs.includes(n));
  }
  for (const p of sources.wc?.products ?? []) {
    for (const [n, v] of Object.entries(p.attrs)) {
      // WC хранит мультизначения через "|" или ","
      for (const part of v.split(/[|,]/)) add(n, part, "wc", false);
    }
  }

  const nameGroups = mergeUnitVariants(groupSimilar([...attrMap.keys()], 88));
  const result: AttributeGroup[] = [];

  for (const g of nameGroups) {
    const allValues = new Map<string, number>();
    let isFilter = false;
    for (const n of g) {
      const e = attrMap.get(n)!;
      isFilter = isFilter || e.isFilter;
      for (const [v, c] of e.values) allValues.set(v, (allValues.get(v) ?? 0) + c);
    }
    const valueGroups = groupSimilar([...allValues.keys()], 90)
      .filter((vg) => vg.length > 1)
      .map((vg) => ({
        suggested: pickCanonical(vg.map((v) => ({ value: v, count: allValues.get(v) ?? 0 }))),
        variants: vg,
      }));

    // в очередь попадают группы, где есть что решать: дубли имени или дубли значений
    if (g.length === 1 && valueGroups.length === 0) continue;

    const nameVariants = g.map((n) => ({ value: n, sources: [...(attrMap.get(n)?.sources ?? [])] }));
    // предпочитаем имя с сайта: глобальный атрибут WC должен сохранить свою таксономию,
    // иначе импорт создаст новую и фильтры слетят
    const wcNames = g.filter((n) => attrMap.get(n)?.sources.has("wc"));
    const pool = wcNames.length > 0 ? wcNames : g;
    const suggested = pickCanonical(pool.map((n) => ({ value: n, count: attrMap.get(n)?.values.size ?? 0 })));
    result.push({
      suggested,
      nameVariants,
      valueGroups,
      isFilter,
      decided: Boolean(decisions.attributes[suggested]),
    });
  }
  return result.sort((a, b) => Number(a.decided) - Number(b.decided));
}

export interface GapRow {
  masterSku: string;
  wcSku: string;
  name: string;
  /** атрибуты мастера (каноничные имена), которых нет у товара на сайте */
  missing: string[];
  /** уже заапрувленные атрибуты (из decisions.gaps) */
  approved: string[];
  /** каноничное имя -> значение из мастера */
  values: Record<string, string>;
  /** какие из missing атрибутов станут фильтрами (были /Filter в мастере) */
  filterAttrs: string[];
}

/**
 * Карта "вариант имени атрибута -> каноничное имя".
 * Источники по приоритету:
 * 1. Утверждённые решения по атрибутам (Attributes page)
 * 2. Exact case-insensitive match — если имя в мастере точно совпадает с именем на сайте
 */
function attrNameCanonMap(decisions: Decisions, master: MasterProduct[], wc: WcProduct[]): Map<string, string> {
  const m = new Map<string, string>();
  // 1. Утверждённые решения
  for (const [key, d] of Object.entries(decisions.attributes)) {
    if (d.status !== "approved") continue;
    m.set(key, d.canonicalName);
    m.set(d.canonicalName, d.canonicalName); // canonical name maps to itself
    for (const variant of Object.keys(d.values)) {
      if (variant.startsWith("name:")) m.set(variant.slice(5), d.canonicalName);
    }
  }
  // 2. Exact CI match: если сайт уже имеет атрибут с таким же именем — не считаем его "другим"
  const wcNamesLower = new Set<string>();
  for (const p of wc) for (const n of Object.keys(p.attrs)) wcNamesLower.add(n.toLowerCase());
  for (const mp of master) {
    for (const n of Object.keys(mp.attrs)) {
      if (m.has(n)) continue;
      if (wcNamesLower.has(n.toLowerCase())) m.set(n, n);
    }
  }
  return m;
}

/** Для каждого связанного товара: какие атрибуты мастера отсутствуют на сайте */
export function buildGapRows(sources: Sources, decisions: Decisions): GapRow[] {
  const master = sources.master?.products ?? [];
  const wc = sources.wc?.products ?? [];
  const nameMap = attrNameCanonMap(decisions, master, wc);
  const canon = (n: string) => nameMap.get(n) ?? n;

  const wcBySku = new Map(wc.filter((p) => p.sku).map((p) => [p.sku, p]));
  const rows: GapRow[] = [];
  for (const mp of master) {
    const d = decisions.products[mp.sku];
    let wcP = null;
    if (d) {
      if (d.status === "approved" && d.wcSku) wcP = wcBySku.get(d.wcSku) ?? null;
    } else {
      wcP = wcBySku.get(mp.sku) ?? null;
    }
    if (!wcP) continue;

    const siteNames = new Set(Object.keys(wcP.attrs).map(canon));
    // в очередь идут только filter-поля мастера: таблица спеков на странице
    // заполняется экспортом автоматически, апрув решает лишь судьбу фильтров
    const missingEntries = Object.entries(mp.attrs).filter(
      ([n, v]) => mp.filterAttrs.includes(n) && v.trim() && !siteNames.has(canon(n))
    );
    const missing = [...new Set(missingEntries.map(([n]) => canon(n)))];
    if (missing.length > 0) {
      const approved = decisions.gaps[mp.sku]?.approved ?? [];
      const values: Record<string, string> = {};
      for (const [n, v] of missingEntries) {
        const cn = canon(n);
        if (!values[cn]) values[cn] = v;
      }
      const filterAttrs = missing.filter((cn) =>
        missingEntries.some(([n]) => canon(n) === cn && mp.filterAttrs.includes(n))
      );
      rows.push({ masterSku: mp.sku, wcSku: wcP.sku, name: wcP.name || mp.name, missing, approved, values, filterAttrs });
    }
  }
  return rows.sort((a, b) => b.missing.length - a.missing.length);
}

export interface ZohoCheckRow {
  sku: string;
  name: string;
  masterValue: string | null;
  wcValue: string | null;
  zohoValue: string | null;
  mismatch: boolean;
}

export function buildZohoCheck(sources: Sources): ZohoCheckRow[] {
  const zoho = sources.zoho?.carrierWeight ?? {};
  if (Object.keys(zoho).length === 0) return [];

  const masterBySku = new Map<string, MasterProduct>();
  for (const p of sources.master?.products ?? []) masterBySku.set(p.sku, p);

  const wcBySku = new Map<string, WcProduct>();
  for (const p of sources.wc?.products ?? []) wcBySku.set(p.sku, p);

  const masterCw = (mp: MasterProduct): string | null => {
    for (const [k, v] of Object.entries(mp.attrs)) {
      if (k.toLowerCase().includes("carrier weight")) return v;
    }
    return null;
  };

  const wcCw = (wp: WcProduct): string | null => {
    for (const [k, v] of Object.entries(wp.attrs)) {
      if (k.toLowerCase().includes("carrier weight")) return v;
    }
    return null;
  };

  const rows: ZohoCheckRow[] = [];
  for (const [sku, zv] of Object.entries(zoho)) {
    const mp = masterBySku.get(sku);
    const wp = wcBySku.get(sku);
    if (!mp && !wp) continue;

    const mv = mp ? masterCw(mp) : null;
    const wv = wp ? wcCw(wp) : null;
    const mismatch = (mv !== null && mv !== zv) || (wv !== null && wv !== zv);

    rows.push({
      sku,
      name: mp?.name || wp?.name || sku,
      masterValue: mv,
      wcValue: wv,
      zohoValue: zv,
      mismatch,
    });
  }

  return rows.sort((a, b) => Number(b.mismatch) - Number(a.mismatch));
}

export function buildAll(sources: Sources, decisions: Decisions) {
  const master = sources.master?.products ?? [];
  const wc = sources.wc?.products ?? [];
  const { rows, wcOnly } = buildMatchRows(master, wc, decisions);
  return {
    matches: rows,
    wcOnly: wcOnly.map((p) => ({ sku: p.sku, name: p.name })),
    categories: buildCategoryQueue(sources, decisions),
    attributes: buildAttributeQueue(sources, decisions),
    gaps: buildGapRows(sources, decisions),
    zohoCheck: buildZohoCheck(sources),
  };
}
