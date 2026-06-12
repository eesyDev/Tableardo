import { NextRequest, NextResponse } from "next/server";
import { getSources, saveSources } from "@/lib/store";

import * as XLSX from "xlsx";
import { parseMasterXlsx, parseWcCsv, parseZohoCsv } from "@/lib/parsers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const source = req.nextUrl.searchParams.get("source") ?? "";
  const fileName = req.nextUrl.searchParams.get("name") ?? "upload";
  console.log(`[upload] start source=${source} name=${fileName}`);

  if (!["master", "wc", "zoho"].includes(source)) {
    return NextResponse.json({ error: "source (master|wc|zoho) is required" }, { status: 400 });
  }

  try {
    console.log(`[upload] reading body...`);
    const buf = Buffer.from(await req.arrayBuffer());
    console.log(`[upload] body read ${buf.length} bytes`);

    const sources = await getSources();
    const uploadedAt = new Date().toISOString();
    console.log(`[upload] loaded current state`);

    if (source === "master") {
      console.log(`[upload] parsing master xlsx...`);
      const products = parseMasterXlsx(buf);
      console.log(`[upload] parsed ${products.length} products`);
      if (products.length === 0) {
        return NextResponse.json({ error: "No rows with SKU found — is this really the master file?" }, { status: 422 });
      }
      sources.master = { fileName, uploadedAt, products };
    } else if (source === "wc") {
      console.log(`[upload] converting to string...`);
      const text = buf.toString("utf-8");
      console.log(`[upload] string length ${text.length}, parsing csv...`);
      const { products, headers } = parseWcCsv(text);
      console.log(`[upload] parsed ${products.length} products, headers: ${headers.slice(0, 5).join(",")}...`);
      if (!headers.includes("SKU") || !headers.includes("Name")) {
        return NextResponse.json({ error: "Doesn't look like a WooCommerce export: no SKU/Name columns" }, { status: 422 });
      }
      sources.wc = { fileName, uploadedAt, products, headers };
    } else {
      let text: string;
      if (fileName.toLowerCase().endsWith(".xlsx")) {
        console.log(`[upload] reading zoho xlsx...`);
        const wb = XLSX.read(buf, { type: "buffer" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        text = XLSX.utils.sheet_to_csv(ws);
        console.log(`[upload] converted xlsx to csv ${text.length} chars`);
      } else {
        text = buf.toString("utf-8");
      }
      console.log(`[upload] parsing zoho csv...`);
      const { carrierWeight, headers } = parseZohoCsv(text);
      console.log(`[upload] parsed zoho ${Object.keys(carrierWeight).length} rows`);
      if (Object.keys(carrierWeight).length === 0) {
        return NextResponse.json({ error: "Zoho export doesn't have a Carrier Weight Class column or it couldn't be extracted from text fields" }, { status: 422 });
      }
      sources.zoho = { fileName, uploadedAt, carrierWeight };
    }

    console.log(`[upload] saving sources...`);
    await saveSources(sources);
    console.log(`[upload] done`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[upload] error`, e);
    return NextResponse.json({ error: `Upload error: ${e instanceof Error ? e.message : e}` }, { status: 422 });
  }
}
