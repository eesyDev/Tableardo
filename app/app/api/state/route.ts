import { NextResponse } from "next/server";
import { getSources, getDecisions } from "@/lib/store";
import { buildAll } from "@/lib/queues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sources = await getSources();
  const decisions = await getDecisions();
  const queues = buildAll(sources, decisions);

  return NextResponse.json({
    sources: {
      master: sources.master
        ? { fileName: sources.master.fileName, uploadedAt: sources.master.uploadedAt, count: sources.master.products.length }
        : null,
      wc: sources.wc
        ? { fileName: sources.wc.fileName, uploadedAt: sources.wc.uploadedAt, count: sources.wc.products.length }
        : null,
      zoho: sources.zoho
        ? { fileName: sources.zoho.fileName, uploadedAt: sources.zoho.uploadedAt, count: sources.zoho.products.length }
        : null,
    },
    queues,
    decisions,
  });
}
