import { NextResponse } from "next/server";
import { gzipSync } from "zlib";
import Papa from "papaparse";
import { getSources, getDecisions } from "@/lib/store";
import { SPECS_META, parseSpecsJson } from "@/lib/parsers";
import type { MasterProduct } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const sources = await getSources();
  const decisions = await getDecisions();
  if (!sources.wc || !sources.master) {
    return NextResponse.json({ error: "Upload both files first" }, { status: 400 });
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

  // выгружаем только колонки, для которых у нас есть значения: пустые Description/Images
  // и тысяча пустых Meta-колонок при импорте с "update existing" затёрли бы данные сайта.
  // ID не выгружаем: Zoho-синк пересоздаёт товары и ID протухают за сутки,
  // импортёр матчит по SKU — он стабилен
  const droppedCols = new Set(["ID", "Description", "Short description", "Images", "Tags"]);
  const headers = sources.wc.headers.filter(
    (h) => !droppedCols.has(h) && (!h.startsWith("Meta:") || h === SPECS_META)
  );
  if (!headers.includes(SPECS_META)) headers.push(SPECS_META);
  const outRows: Record<string, string>[] = [];

  // сколько слотов Attribute N есть в экспорте сайта
  let baseSlots = 0;
  for (const h of headers) {
    const m = h.match(/^Attribute (\d+) name$/);
    if (m) baseSlots = Math.max(baseSlots, Number(m[1]));
  }

  // импортёр WC режет value(s) по запятым; запятая в числе ("3,200 kg") экранируется как "\,"
  const escapeCommas = (v: string) => v.replace(/(\d),(?=\d{3})/g, "$1\\,");

  // Таблица спеков на странице товара рендерится темой из _custom_product_specs_data.
  // Существующий JSON сайта канонизируем и накрываем мастер-спеками.
  // Прямые кавычки (1/2") заменяем на ″: импортёр WC съедает бэкслэш-экранирование
  // и ломает JSON (в старых данных уже лежит "ydu00b3" вместо "yd³" по той же причине).
  const sanitizeSpec = (s: string) => s.replace(/"/g, "″");
  const buildSpecs = (existingRaw: string, mp: MasterProduct | null): string => {
    const out: Record<string, string> = {};
    const put = (n: string, v: string) => {
      const c = canonAttr(n, v);
      out[sanitizeSpec(c.name)] = sanitizeSpec(c.value);
    };
    for (const [n, v] of Object.entries(parseSpecsJson(existingRaw) ?? {})) put(n, v);
    for (const [n, v] of Object.entries(mp?.attrs ?? {})) {
      if (n === "Fits To") continue; // там SKU-ссылки, не спека для покупателя
      put(n, v);
    }
    return Object.keys(out).length > 0 ? JSON.stringify(out) : "";
  };

  interface AttrSlot {
    name: string;
    value: string;
    visible: string;
    global: string;
  }

  // флаги global/visible с сайта по каноничному имени атрибута — их нельзя терять,
  // иначе импорт превратит глобальные атрибуты (фильтры) в кастомные
  const siteFlags = (raw: Record<string, string>): Map<string, { global: string; visible: string }> => {
    const m = new Map<string, { global: string; visible: string }>();
    for (let i = 1; i <= baseSlots; i++) {
      const n = raw[`Attribute ${i} name`];
      if (!n) continue;
      m.set(attrNameMap.get(n) ?? n, {
        global: raw[`Attribute ${i} global`] || "0",
        visible: raw[`Attribute ${i} visible`] || "1",
      });
    }
    return m;
  };

  // слияние по каноничному имени: мастер поверх сайта, флаги сайта сохраняются
  // approvedGaps — каноничные имена атрибутов из decisions.gaps; если передан,
  // добавляются только approved недостающие атрибуты (для существующих товаров).
  const mergeAttrs = (
    wcAttrs: Record<string, string>,
    wcRaw: Record<string, string> | null,
    mp: MasterProduct | null,
    approvedGaps?: Set<string>
  ): AttrSlot[] => {
    const flags = wcRaw ? siteFlags(wcRaw) : new Map<string, { global: string; visible: string }>();
    const out = new Map<string, AttrSlot>();
    for (const [n, v] of Object.entries(wcAttrs)) {
      const c = canonAttr(n, v);
      const f = flags.get(c.name);
      out.set(c.name, { name: c.name, value: c.value, visible: f?.visible ?? "1", global: f?.global ?? "0" });
    }
    for (const [n, v] of Object.entries(mp?.attrs ?? {})) {
      const c = canonAttr(n, v);
      if (approvedGaps && !flags.has(c.name) && !approvedGaps.has(c.name)) continue;
      const f = flags.get(c.name);
      out.set(c.name, {
        name: c.name,
        value: c.value,
        visible: f?.visible ?? "1",
        global: f?.global ?? (mp!.filterAttrs.includes(n) ? "1" : "0"),
      });
    }
    return [...out.values()];
  };

  const writeAttrs = (row: Record<string, string>, slots: AttrSlot[], totalSlots: number) => {
    for (let i = 1; i <= totalSlots; i++) {
      const s = slots[i - 1];
      row[`Attribute ${i} name`] = s?.name ?? "";
      row[`Attribute ${i} value(s)`] = s ? escapeCommas(s.value) : "";
      row[`Attribute ${i} visible`] = s?.visible ?? "";
      row[`Attribute ${i} global`] = s?.global ?? "";
    }
  };

  // 1) существующие товары сайта, обогащённые мастером
  const attrSlots: (AttrSlot[] | null)[] = [];
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
      const approvedGaps = new Set(decisions.gaps[mp.sku]?.approved ?? []);
      attrSlots.push(mergeAttrs(wcP.attrs, wcP.raw, mp, approvedGaps));
      const cats = new Set<string>();
      for (const c of wcP.categories) cats.add(canonCategory(c));
      // категорию мастера добавляем только после апрува на /categories —
      // иначе импорт насоздаёт плоских дублей иерархических категорий сайта
      if (decisions.categories[mp.category]) cats.add(canonCategory(mp.category));
      row["Categories"] = [...cats].join(", ");
    } else {
      attrSlots.push(null); // строка сайта без пары — атрибуты не трогаем
      row["Categories"] = wcP.categories.map(canonCategory).join(", ");
    }
    row[SPECS_META] = buildSpecs(wcP.raw[SPECS_META] ?? "", mp ?? null);
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
    row[SPECS_META] = buildSpecs("", mp);
    attrSlots.push(mergeAttrs({}, null, mp));
    outRows.push(row);
  }

  // атрибутов может быть больше, чем слотов в экспорте сайта — расширяем заголовки,
  // импортёр WC маппит колонки Attribute N по имени
  const maxSlots = Math.max(baseSlots, ...attrSlots.map((s) => s?.length ?? 0));
  if (maxSlots > baseSlots) {
    const lastIdx = headers.indexOf(`Attribute ${baseSlots} global`);
    const extra: string[] = [];
    for (let i = baseSlots + 1; i <= maxSlots; i++) {
      extra.push(`Attribute ${i} name`, `Attribute ${i} value(s)`, `Attribute ${i} visible`, `Attribute ${i} global`);
    }
    headers.splice(lastIdx + 1, 0, ...extra);
  }
  for (let i = 0; i < outRows.length; i++) {
    const slots = attrSlots[i];
    if (slots) writeAttrs(outRows[i], slots, maxSlots);
  }

  const csv = Papa.unparse({ fields: headers, data: outRows.map((r) => headers.map((h) => r[h] ?? "")) });
  const stamp = new Date().toISOString().slice(0, 10);
  // gzip: CSV ~8 МБ не влезает в лимит ответа Vercel (4.5 МБ), браузер распакует сам
  const body = gzipSync(Buffer.from("﻿" + csv, "utf-8"));
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Encoding": "gzip",
      "Content-Disposition": `attachment; filename="woocommerce-import-${stamp}.csv"`,
    },
  });
}
