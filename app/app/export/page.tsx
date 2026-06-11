"use client";

import { useAppState } from "@/components/useAppState";

export default function ExportPage() {
  const { state, loading } = useAppState();

  if (loading) return <Empty text="Loading…" />;
  if (!state?.sources.master || !state?.sources.wc)
    return <Empty text="Upload Master Specs and the WooCommerce export first." />;

  const q = state.queues;
  const d = state.decisions;

  const pendingMatches = q.matches.filter((m) => !m.decision && m.candidates[0]?.score !== 100).length;
  const pendingCats = q.categories.filter((c) => !c.decided).length;
  const pendingAttrs = q.attributes.filter((a) => !a.decided).length;
  const newProducts = Object.values(d.products).filter((p) => p.status === "approved" && p.wcSku === null).length;
  const enriched = q.matches.filter(
    (m) => m.candidates[0]?.score === 100 || (m.decision?.status === "approved" && m.decision.wcSku)
  ).length;

  const ready = pendingMatches === 0 && pendingCats === 0 && pendingAttrs === 0;
  const gapValues = q.gaps.reduce((n, g) => n + g.missing.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold mb-1">Export</h1>
        <p style={{ color: "var(--text-dim)" }}>
          Final CSV in WooCommerce import format: site products enriched from the master, plus new products as drafts.
        </p>
      </div>

      <div className="card p-5 flex flex-col gap-3">
        <CheckRow ok={pendingMatches === 0} label="Product matching" detail={pendingMatches === 0 ? "all sorted" : `${pendingMatches} left`} href="/matches" />
        <CheckRow ok={pendingCats === 0} label="Categories" detail={pendingCats === 0 ? "no duplicates" : `${pendingCats} groups left`} href="/categories" />
        <CheckRow ok={pendingAttrs === 0} label="Attributes" detail={pendingAttrs === 0 ? "all clean" : `${pendingAttrs} groups left`} href="/attributes" />
      </div>

      <div className="card p-5">
        <div className="text-[13px] mb-4" style={{ color: "var(--text-dim)" }}>
          The file will contain <b style={{ color: "var(--text)" }}>{state.sources.wc.count}</b> site products (
          <b style={{ color: "var(--green)" }}>{enriched}</b> of them enriched from the master) +{" "}
          <b style={{ color: "var(--accent)" }}>{newProducts}</b> new products (drafts, Published=0). Importing it adds{" "}
          <b style={{ color: "var(--green)" }}>{gapValues.toLocaleString("en-US")}</b> attribute values that are missing
          on the site today.
        </div>
        <div className="flex items-center gap-3">
          <a className="btn btn-primary" href="/api/export" download>
            Download WooCommerce CSV
          </a>
          {!ready && (
            <span className="text-[12.5px]" style={{ color: "var(--amber)" }}>
              You can download now — undecided items will simply stay as they are on the site.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckRow({ ok, label, detail, href }: { ok: boolean; label: string; detail: string; href: string }) {
  return (
    <a href={href} className="flex items-center gap-3 group">
      <span className={`badge ${ok ? "badge-green" : "badge-amber"}`}>{ok ? "✓" : "!"}</span>
      <span className="font-medium group-hover:underline">{label}</span>
      <span className="text-[12.5px]" style={{ color: "var(--text-dim)" }}>
        {detail}
      </span>
    </a>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="card p-10 text-center" style={{ color: "var(--text-dim)" }}>
      {text}
    </div>
  );
}
