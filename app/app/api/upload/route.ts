import { NextRequest, NextResponse } from "next/server";
import { getSources, saveSources } from "@/lib/store";
import { parseMasterXlsx, parseWcCsv, parseGenericCsv } from "@/lib/parsers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const source = String(form.get("source") ?? "");

  if (!(file instanceof File) || !["master", "wc", "zoho"].includes(source)) {
    return NextResponse.json({ error: "Нужны file и source (master|wc|zoho)" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const sources = getSources();
  const uploadedAt = new Date().toISOString();

  try {
    if (source === "master") {
      const products = parseMasterXlsx(buf);
      if (products.length === 0) {
        return NextResponse.json({ error: "Не нашёл ни одной строки с SKU — это точно мастер-файл?" }, { status: 422 });
      }
      sources.master = { fileName: file.name, uploadedAt, products };
    } else if (source === "wc") {
      const { products, headers } = parseWcCsv(buf.toString("utf-8"));
      if (!headers.includes("SKU") || !headers.includes("Name")) {
        return NextResponse.json({ error: "Не похоже на экспорт WooCommerce: нет колонок SKU/Name" }, { status: 422 });
      }
      sources.wc = { fileName: file.name, uploadedAt, products, headers };
    } else {
      const { rows, headers } = parseGenericCsv(buf.toString("utf-8"));
      sources.zoho = { fileName: file.name, uploadedAt, products: rows, headers };
    }
  } catch (e) {
    return NextResponse.json({ error: `Ошибка парсинга: ${e instanceof Error ? e.message : e}` }, { status: 422 });
  }

  saveSources(sources);
  return NextResponse.json({ ok: true });
}
