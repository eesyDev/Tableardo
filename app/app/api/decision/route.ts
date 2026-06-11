import { NextRequest, NextResponse } from "next/server";
import { getDecisions, saveDecisions } from "@/lib/store";

export const runtime = "nodejs";

/**
 * POST /api/decision
 * { queue: "products", masterSku, wcSku|null, status, via } — матч товара
 * { queue: "products-bulk", items: [{masterSku, wcSku, via}] } — массовый approve
 * { queue: "categories", variants: string[], canonical, status } — категория
 * { queue: "attributes", key, canonicalName, values, status } — атрибут
 * { queue: "...-undo", ... } — отмена решения
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const decisions = getDecisions();
  const at = new Date().toISOString();

  switch (body.queue) {
    case "products":
      decisions.products[body.masterSku] = {
        wcSku: body.wcSku ?? null,
        status: body.status,
        via: body.via ?? "manual",
        at,
      };
      break;

    case "products-bulk":
      for (const it of body.items ?? []) {
        decisions.products[it.masterSku] = { wcSku: it.wcSku, status: "approved", via: it.via ?? "auto-sku", at };
      }
      break;

    case "products-undo":
      delete decisions.products[body.masterSku];
      break;

    case "categories":
      for (const v of body.variants ?? []) {
        decisions.categories[v] = { canonical: body.canonical, status: body.status ?? "approved", at };
      }
      break;

    case "categories-separate":
      // "это разные категории" — каждая остаётся сама собой
      for (const v of body.variants ?? []) {
        decisions.categories[v] = { canonical: v, status: "approved", at };
      }
      break;

    case "categories-undo":
      for (const v of body.variants ?? []) delete decisions.categories[v];
      break;

    case "attributes":
      decisions.attributes[body.key] = {
        canonicalName: body.canonicalName,
        status: body.status ?? "approved",
        at,
        values: body.values ?? {},
      };
      break;

    case "attributes-undo":
      delete decisions.attributes[body.key];
      break;

    default:
      return NextResponse.json({ error: "Unknown queue" }, { status: 400 });
  }

  saveDecisions(decisions);
  return NextResponse.json({ ok: true });
}
