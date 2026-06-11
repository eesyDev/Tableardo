import { NextRequest, NextResponse } from "next/server";
import { getSources, saveSources, getDecisions, saveDecisions } from "@/lib/store";

import { parseMasterXlsx, parseWcCsv, parseZohoCsv } from "@/lib/parsers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const source = String(form.get("source") ?? "");

  if (!(file instanceof File) || !["master", "wc", "zoho"].includes(source)) {
    return NextResponse.json({ error: "file and source (master|wc|zoho) are required" }, { status: 400 });
  }

  const sources = await getSources();
  const decisions = await getDecisions();
  const uploadedAt = new Date().toISOString();

  try {
    if (source === "master") {
      const buf = Buffer.from(await file.arrayBuffer());
      const products = parseMasterXlsx(buf);
      if (products.length === 0) {
        return NextResponse.json({ error: "No rows with SKU found — is this really the master file?" }, { status: 422 });
      }
      sources.master = { fileName: file.name, uploadedAt, products };
      decisions.products = {};
      decisions.gaps = {};
    } else if (source === "wc") {
      const text = await file.text();
      const { products, headers } = parseWcCsv(text);
      if (!headers.includes("SKU") || !headers.includes("Name")) {
        return NextResponse.json({ error: "Doesn't look like a WooCommerce export: no SKU/Name columns" }, { status: 422 });
      }
      sources.wc = { fileName: file.name, uploadedAt, products, headers };
      decisions.products = {};
      decisions.gaps = {};
    } else {
      const text = await file.text();
      const { carrierWeight, headers } = parseZohoCsv(text);
      if (!headers.some((h) => /carrier weight/i.test(h))) {
        return NextResponse.json({ error: "Zoho export doesn't have a Carrier Weight Class column" }, { status: 422 });
      }
      sources.zoho = { fileName: file.name, uploadedAt, carrierWeight };
    }
  } catch (e) {
    return NextResponse.json({ error: `Parsing error: ${e instanceof Error ? e.message : e}` }, { status: 422 });
  }

  await saveSources(sources);
  await saveDecisions(decisions);
  return NextResponse.json({ ok: true });
}
