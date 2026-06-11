import { NextRequest, NextResponse } from "next/server";
import { gunzipSync } from "zlib";
import { getSources, saveSources } from "@/lib/store";
import { parseMasterXlsx, parseWcCsv, parseGenericCsv } from "@/lib/parsers";

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
  const uploadedAt = new Date().toISOString();

  try {
    if (source === "master") {
      const products = parseMasterXlsx(buf);
      if (products.length === 0) {
        return NextResponse.json({ error: "No rows with SKU found — is this really the master file?" }, { status: 422 });
      }
      sources.master = { fileName: file.name, uploadedAt, products };
    } else if (source === "wc") {
      const { products, headers } = parseWcCsv(buf.toString("utf-8"));
      if (!headers.includes("SKU") || !headers.includes("Name")) {
        return NextResponse.json({ error: "Doesn't look like a WooCommerce export: no SKU/Name columns" }, { status: 422 });
      }
      sources.wc = { fileName: file.name, uploadedAt, products, headers };
    } else {
      const { rows, headers } = parseGenericCsv(buf.toString("utf-8"));
      sources.zoho = { fileName: file.name, uploadedAt, products: rows, headers };
    }
  } catch (e) {
    return NextResponse.json({ error: `Parsing error: ${e instanceof Error ? e.message : e}` }, { status: 422 });
  }

  await saveSources(sources);
  return NextResponse.json({ ok: true });
}
