"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/components/useAppState";

export default function GapsPage() {
  const { state, loading } = useAppState();
  const [search, setSearch] = useState("");

  const rows = useMemo(() => state?.queues.gaps ?? [], [state]);

  // сколько товаров не хватает каждого атрибута — для сводки сверху
  const topMissing = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) for (const a of r.missing) counts.set(a, (counts.get(a) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  if (loading) return <Empty text="Loading…" />;
  if (!state?.sources.master || !state?.sources.wc)
    return <Empty text="Upload Master Specs and the WooCommerce export on the Data page first." />;

  const list = rows.filter(
    (r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.wcSku.includes(search) ||
      r.missing.some((a) => a.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-semibold mb-1">Missing attributes</h1>
          <p style={{ color: "var(--text-dim)" }}>
            Linked products whose master attributes are absent on the site. The export will add them on import.
          </p>
        </div>
        <input
          className="input w-[260px]"
          placeholder="Search by name, SKU or attribute"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {topMissing.length > 0 && (
        <div className="card p-4">
          <div className="text-[12px] font-medium mb-2" style={{ color: "var(--text-dim)" }}>
            MOST OFTEN MISSING
          </div>
          <div className="flex flex-wrap gap-1.5">
            {topMissing.slice(0, 12).map(([name, count]) => (
              <button key={name} className="btn btn-sm" onClick={() => setSearch(name)}>
                {name} <span className="mono" style={{ color: "var(--text-dim)" }}>×{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {list.length === 0 && <Empty text={rows.length === 0 ? "No gaps — site attributes fully cover the master." : "Nothing matches the search."} />}

      {list.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-dim)" }}>
                <th className="text-left font-medium px-4 py-2.5 w-[110px]">SKU</th>
                <th className="text-left font-medium px-4 py-2.5">Product</th>
                <th className="text-left font-medium px-4 py-2.5">Missing on the site</th>
                <th className="text-right font-medium px-4 py-2.5 w-[60px]">#</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 200).map((r) => (
                <tr key={r.masterSku} style={{ borderBottom: "1px solid var(--border)" }} className="align-top">
                  <td className="px-4 py-2.5 mono" style={{ color: "var(--text-dim)" }}>{r.wcSku}</td>
                  <td className="px-4 py-2.5">{r.name}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {r.missing.map((a) => (
                        <span key={a} className="badge badge-amber">{a}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right mono" style={{ color: "var(--text-dim)" }}>{r.missing.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length > 200 && (
            <div className="text-center py-2 text-[12.5px]" style={{ color: "var(--text-dim)" }}>
              Showing the first 200 of {list.length} — narrow it down with search
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="card p-10 text-center" style={{ color: "var(--text-dim)" }}>
      {text}
    </div>
  );
}
