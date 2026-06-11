import { NextRequest, NextResponse } from "next/server";
import { gunzipSync } from "zlib";
import { getSources, saveSources, getDecisions, saveDecisions } from "@/lib/store";

import { parseMasterXlsx, parseWcCsv, parseZohoCsv } from "@/lib/parsers";

export const runtime = "nodejs";
export const maxDuration = 60;

// Тело запроса — файл, сжатый клиентом gzip'ом (лимит Vercel на запрос — 4.5 МБ),
// source и имя файла — в query.
export async function POST(req: NextRequest) {
  const source = req.nextUrl.searchParams.get("source") ?? "";
  const fileName = req.nextUrl.searchParams.get("name") ?? "upload";

  if (!["master", "wc", "zoho"].includes(source)) {
    return NextResponse.json({ error: "source (master|wc|zoho) is required" }, { status: 400 });
  }

  let buf: Buffer;
  try {
    buf = gunzipSync(Buffer.from(await req.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "Corrupted upload — please try again" }, { status: 400 });
  }
  const file = { name: fileName };
  const sources = await getSources();
  const decisions = await getDecisions();
  const uploadedAt = new Date().toISOString();

  try {
    if (source === "master") {
      const products = parseMasterXlsx(buf);
      if (products.length === 0) {
        return NextResponse.json({ error: "No rows with SKU found — is this really the master file?" }, { status: 422 });
      }
      sources.master = { fileName: file.name, uploadedAt, products };
      // мастер изменился — старые матчи и gaps больше не валидны
      decisions.products = {};
      decisions.gaps = {};
    } else if (source === "wc") {
      const { products, headers } = parseWcCsv(buf.toString("utf-8"));
      if (!headers.includes("SKU") || !headers.includes("Name")) {
        return NextResponse.json({ error: "Doesn't look like a WooCommerce export: no SKU/Name columns" }, { status: 422 });
      }
      sources.wc = { fileName: file.name, uploadedAt, products, headers };
      // каталог сайта изменился — старые матчи и gaps больше не валидны
      decisions.products = {};
      decisions.gaps = {};
    } else {
      const { carrierWeight, headers } = parseZohoCsv(buf.toString("utf-8"));
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
