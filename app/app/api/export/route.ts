import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getSources, getDecisions } from "@/lib/store";
import type { MasterProduct } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTRS = 14;

export async function GET() {
  const sources = getSources();
  const decisions = getDecisions();
  if (!sources.wc || !sources.master) {
    return NextResponse.json({ error: "Сначала загрузите оба файла" }, { status: 400 });
  }

  const canonCategory = (c: string) => decisions.categories[c]?.canonical ?? c;

  // вариант имени атрибута -> каноничное имя; вариант значения -> каноничное значение
  const attrNameMap = new Map<string, string>();
  const attrValueMap = new Map<string, Map<string, string>>();
  for (const [key, d] of Object.entries(decisions.attributes)) {
    if (d.status !== "approved") continue;
    attrNameMap.set(key, d.canonicalName);
    const vm = attrValueMap.get(d.canonicalName) ?? new Map<string, string>();
    for (const [variant, canon] of Object.entries(d.values)) {
      if (variant.startsWith("name:")) attrNameMap.set(variant.slice(5), d.canonicalName);
      else vm.set(variant, canon);
    }
    attrValueMap.set(d.canonicalName, vm);
  }
  const canonAttr = (name: string, value: string): { name: string; value: string } => {
    const newName = attrNameMap.get(name) ?? name;
    const vm = attrValueMap.get(newName);
    return { name: newName, value: vm?.get(value) ?? value };
  };

  const masterBySku = new Map<string, MasterProduct>();
  for (const p of sources.master.products) masterBySku.set(p.sku, p);

  const headers = sources.wc.headers;
  const outRows: Record<string, string>[] = [];

  const writeAttrs = (row: Record<string, string>, attrs: Record<string, string>, filterAttrs: string[]) => {
    // очистить старые слоты
    for (let i = 1; i <= MAX_ATTRS; i++) {
      row[`Attribute ${i} name`] = "";
      row[`Attribute ${i} value(s)`] = "";
      row[`Attribute ${i} visible`] = "";
      row[`Attribute ${i} global`] = "";
    }
    let slot = 1;
    for (const [n, v] of Object.entries(attrs)) {
      if (slot > MAX_ATTRS) break;
      const c = canonAttr(n, v);
      row[`Attribute ${slot} name`] = c.name;
      row[`Attribute ${slot} value(s)`] = c.value;
      row[`Attribute ${slot} visible`] = "1";
      row[`Attribute ${slot} global`] = filterAttrs.includes(n) ? "1" : "0";
      slot++;
    }
  };

  // 1) существующие товары сайта, обогащённые мастером
  for (const wcP of sources.wc.products) {
    const row: Record<string, string> = { ...wcP.raw };

    // найти заапрувленный мастер-товар для этой WC-строки
    let mp: MasterProduct | undefined;
    const direct = masterBySku.get(wcP.sku);
    const directDecision = decisions.products[wcP.sku];
    if (direct && (!directDecision || (directDecision.status === "approved" && directDecision.wcSku === wcP.sku))) {
      mp = direct;
    } else {
      for (const [mSku, d] of Object.entries(decisions.products)) {
        if (d.status === "approved" && d.wcSku === wcP.sku) {
          mp = masterBySku.get(mSku);
          break;
        }
      }
    }

    if (mp) {
      // merge: атрибуты мастера поверх WC, категории канонизируются
      const merged = { ...wcP.attrs, ...mp.attrs };
      writeAttrs(row, merged, mp.filterAttrs);
      const cats = new Set<string>();
      for (const c of wcP.categories) cats.add(canonCategory(c));
      cats.add(canonCategory(mp.category));
      row["Categories"] = [...cats].join(", ");
    } else {
      row["Categories"] = wcP.categories.map(canonCategory).join(", ");
    }
    outRows.push(row);
  }

  // 2) новые товары: есть в мастере, заапрувлены как "нет пары"
  for (const mp of sources.master.products) {
    const d = decisions.products[mp.sku];
    if (!d || d.status !== "approved" || d.wcSku !== null) continue;
    const row: Record<string, string> = Object.fromEntries(headers.map((h) => [h, ""]));
    row["Type"] = "simple";
    row["SKU"] = mp.sku;
    row["Name"] = mp.name;
    row["Published"] = "0"; // черновик — цены и описания заполняются на сайте
    row["Categories"] = canonCategory(mp.category);
    writeAttrs(row, mp.attrs, mp.filterAttrs);
    outRows.push(row);
  }

  const csv = Papa.unparse({ fields: headers, data: outRows.map((r) => headers.map((h) => r[h] ?? "")) });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="woocommerce-import-${stamp}.csv"`,
    },
  });
}
