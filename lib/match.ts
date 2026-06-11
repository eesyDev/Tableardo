import { distance } from "fastest-levenshtein";
import type { MasterProduct, WcProduct, MatchRow, MatchCandidate, Decisions } from "./types";
import { fuzzyKey, tokenSet } from "./normalize";

/** Гибридный score 0..100: токены + левенштейн по нормализованным строкам */
export function similarity(a: string, b: string): number {
  const ka = fuzzyKey(a);
  const kb = fuzzyKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 100;

  const ta = tokenSet(a);
  const tb = tokenSet(b);
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jaccard = inter / (ta.size + tb.size - inter);

  const maxLen = Math.max(ka.length, kb.length);
  const lev = 1 - distance(ka, kb) / maxLen;

  return Math.round((jaccard * 0.6 + lev * 0.4) * 100);
}

/** Текстовая пометка в названии мастера, на которую стоит обратить внимание при разборе */
export function nameMarker(name: string): string | null {
  if (/discontinued/i.test(name)) return "Discontinued";
  if (/duplicate/i.test(name)) return "Duplicate";
  if (/old model/i.test(name)) return "Old Model";
  return null;
}

/**
 * Строит очередь матчинга:
 * - SKU совпал — кандидат со score 100 (auto)
 * - иначе fuzzy-кандидаты по названию среди WC-товаров без SKU-пары
 */
export function buildMatchRows(
  master: MasterProduct[],
  wc: WcProduct[],
  decisions: Decisions
): { rows: MatchRow[]; wcOnly: WcProduct[] } {
  const wcBySku = new Map<string, WcProduct>();
  for (const p of wc) if (p.sku) wcBySku.set(p.sku, p);

  const masterSkus = new Set(master.map((p) => p.sku));
  const unmatchedWc = wc.filter((p) => !p.sku || !masterSkus.has(p.sku));

  const rows: MatchRow[] = [];
  for (const mp of master) {
    const decision = decisions.products[mp.sku] ?? null;
    const marker = nameMarker(mp.name);
    const exact = wcBySku.get(mp.sku);
    let candidates: MatchCandidate[];

    if (exact) {
      candidates = [{ wcSku: exact.sku, wcName: exact.name, score: 100 }];
    } else {
      candidates = unmatchedWc
        .map((p) => ({ wcSku: p.sku, wcName: p.name, score: similarity(mp.name, p.name) }))
        .filter((c) => c.score >= 40)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    }
    rows.push({ masterSku: mp.sku, masterName: mp.name, sheet: mp.sheet, marker, candidates, decision });
  }

  // WC-товары, на которые не претендует ни один мастер-товар (ни по SKU, ни решением)
  const claimed = new Set<string>();
  for (const r of rows) {
    if (r.decision?.status === "approved" && r.decision.wcSku) claimed.add(r.decision.wcSku);
    else if (!r.decision && r.candidates[0]?.score === 100) claimed.add(r.candidates[0].wcSku);
  }
  const wcOnly = wc.filter((p) => !claimed.has(p.sku));

  return { rows, wcOnly };
}

/** Группирует похожие строки (категории, значения атрибутов) для дедупликации */
export function groupSimilar(values: string[], threshold = 82): string[][] {
  const uniq = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  const groups: string[][] = [];
  const used = new Set<string>();

  for (const v of uniq) {
    if (used.has(v)) continue;
    const group = [v];
    used.add(v);
    for (const w of uniq) {
      if (used.has(w)) continue;
      const exactCi = fuzzyKey(v) === fuzzyKey(w);
      if (exactCi || similarity(v, w) >= threshold) {
        group.push(w);
        used.add(w);
      }
    }
    groups.push(group);
  }
  return groups;
}
