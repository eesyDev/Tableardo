import * as XLSX from "xlsx";
import Papa from "papaparse";
import type { MasterProduct, WcProduct } from "./types";
import { cleanSku, cleanName, parseHeader } from "./normalize";

function findColumn(headers: string[], patterns: string[]): string | undefined {
  for (const h of headers) {
    const lower = h.toLowerCase();
    for (const p of patterns) {
      if (lower.includes(p.toLowerCase())) return h;
    }
  }
  return undefined;
}

/** Парсит мастер-XLSX: каждый лист = категория, свой набор колонок */
export function parseMasterXlsx(buf: Buffer): MasterProduct[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const products: MasterProduct[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (rows.length < 2) continue;

    const headers = rows[0].map((h) => parseHeader(h === null ? "" : String(h)));
    const skuIdx = headers.findIndex((h) => h.name.toLowerCase() === "sku");
    if (skuIdx === -1) continue;
    const nameIdx = headers.findIndex((h) => h.name.toLowerCase() === "variation name");
    const catIdx = headers.findIndex((h) => h.name.toLowerCase() === "category");

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      const sku = cleanSku(row[skuIdx]);
      if (!sku) continue;

      const { name, flagged } = cleanName(nameIdx >= 0 ? row[nameIdx] : "");
      const catClean = cleanName(catIdx >= 0 ? row[catIdx] : "");
      const attrs: Record<string, string> = {};
      const filterAttrs: string[] = [];

      headers.forEach((h, i) => {
        if (i === skuIdx || i === nameIdx || i === catIdx || !h.name || h.isNA) return;
        const v = row[i];
        if (v === null || v === undefined || String(v).trim() === "") return;
        // обрезка хвостовых бэкслешей — артефакт ручного ввода в таблице
        const cleanV = String(v).trim().replace(/\\+$/, "").trim();
        if (!cleanV) return;
        attrs[h.name] = cleanV;
        if (h.isFilter && !filterAttrs.includes(h.name)) filterAttrs.push(h.name);
      });

      products.push({
        sku,
        name,
        category: catClean.name || sheetName.trim(),
        sheet: sheetName.trim(),
        attrs,
        filterAttrs,
        flagged: flagged || catClean.flagged,
        rowIndex: r,
      });
    }
  }
  return dedupeBySku(products);
}

/** Повторные строки с тем же SKU сливаются: значения атрибутов объединяются через ", " */
function dedupeBySku(products: MasterProduct[]): MasterProduct[] {
  const bySku = new Map<string, MasterProduct>();
  for (const p of products) {
    const existing = bySku.get(p.sku);
    if (!existing) {
      bySku.set(p.sku, p);
      continue;
    }
    for (const [n, v] of Object.entries(p.attrs)) {
      const cur = existing.attrs[n];
      if (!cur) existing.attrs[n] = v;
      else if (cur !== v && !cur.split(", ").includes(v)) existing.attrs[n] = `${cur}, ${v}`;
    }
    for (const f of p.filterAttrs) if (!existing.filterAttrs.includes(f)) existing.filterAttrs.push(f);
    existing.flagged = existing.flagged || p.flagged;
  }
  return [...bySku.values()];
}

/** Парсит экспорт WooCommerce */
export function parseWcCsv(text: string): { products: WcProduct[]; headers: string[] } {
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const headers = res.meta.fields ?? [];
  const products: WcProduct[] = [];

  for (const row of res.data) {
    if ((row["Type"] ?? "").trim().toLowerCase() !== "simple") continue;
    const sku = (row["SKU"] ?? "").trim();
    const attrs: Record<string, string> = {};
    for (let i = 1; i <= 14; i++) {
      const an = (row[`Attribute ${i} name`] ?? "").trim();
      const av = (row[`Attribute ${i} value(s)`] ?? "").trim();
      if (an && av) attrs[an] = av;
    }
    products.push({
      id: row["ID"] ?? "",
      sku,
      name: (row["Name"] ?? "").trim(),
      categories: (row["Categories"] ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      attrs,
      published: row["Published"] ?? "",
      regularPrice: row["Regular price"] ?? "",
      salePrice: row["Sale price"] ?? "",
      stock: row["Stock"] ?? "",
      images: row["Images"] ?? "",
      raw: row,
    });
  }
  return { products, headers };
}

/** Парсит Zoho CSV — извлекает только SKU и Carrier Weight Class */
export function parseZohoCsv(text: string): { carrierWeight: Record<string, string>; headers: string[] } {
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const headers = res.meta.fields ?? [];

  const skuCol = findColumn(headers, ["sku", "item sku", "product sku", "item #", "item#"]);
  const cwCol = findColumn(headers, ["carrier weight", "carrier weight class", "weight class"]);

  const carrierWeight: Record<string, string> = {};
  if (skuCol && cwCol) {
    for (const row of res.data) {
      const sku = cleanSku(row[skuCol]);
      const cw = (row[cwCol] ?? "").trim();
      if (sku && cw) carrierWeight[sku] = cw;
    }
  }

  return { carrierWeight, headers };
}

/** Универсальный CSV-парсер */
export function parseGenericCsv(text: string): { rows: Record<string, string>[]; headers: string[] } {
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return { rows: res.data, headers: res.meta.fields ?? [] };
}
