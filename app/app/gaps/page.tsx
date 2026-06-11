"use client";

import { useMemo, useState } from "react";
import { useAppState, postDecision } from "@/components/useAppState";

type Filter = "pending" | "approved" | "all";

export default function GapsPage() {
  const { state, loading } = useAppState();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");

  const rows = useMemo(() => state?.queues.gaps ?? [], [state]);

  const topMissing = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      for (const a of r.missing) {
        if (!r.approved.includes(a)) counts.set(a, (counts.get(a) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  if (loading) return <Empty text="Loading…" />;
  if (!state?.sources.master || !state?.sources.wc)
    return <Empty text="Upload Master Specs and the WooCommerce export on the Data page first." />;

  const filtered = rows.filter((r) => {
    const matchSearch =
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.wcSku.includes(search) ||
      r.missing.some((a) => a.toLowerCase().includes(search.toLowerCase()));
    if (!matchSearch) return false;

    if (filter === "all") return true;
    const pending = r.missing.filter((a) => !r.approved.includes(a));
    if (filter === "pending") return pending.length > 0;
    if (filter === "approved") return r.approved.length > 0;
    return true;
  });

  const pendingCount = rows.filter((r) => r.missing.some((a) => !r.approved.includes(a))).length;
  const approvedCount = rows.filter((r) => r.approved.length > 0).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-semibold mb-1">Missing attributes</h1>
          <p style={{ color: "var(--text-dim)" }}>
            Approve the attributes you want added to the site on export. Everything else is skipped.
          </p>
        </div>
        <input
          className="input w-[260px]"
          placeholder="Search by name, SKU or attribute"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <FilterBtn active={filter === "pending"} onClick={() => setFilter("pending")} label={`Pending · ${pendingCount}`} />
        <FilterBtn active={filter === "approved"} onClick={() => setFilter("approved")} label={`Approved · ${approvedCount}`} />
        <FilterBtn active={filter === "all"} onClick={() => setFilter("all")} label={`All · ${rows.length}`} />
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

      {filtered.length === 0 && (
        <Empty
          text={
            rows.length === 0
              ? "No gaps — site attributes fully cover the master."
              : "Nothing matches the filter."
          }
        />
      )}

      {filtered.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-dim)" }}>
                <th className="text-left font-medium px-4 py-2.5 w-[110px]">SKU</th>
                <th className="text-left font-medium px-4 py-2.5">Product</th>
                <th className="text-left font-medium px-4 py-2.5">Attribute → Value</th>
                <th className="text-right font-medium px-4 py-2.5 w-[80px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((r) => (
                <tr key={r.masterSku} style={{ borderBottom: "1px solid var(--border)" }} className="align-top">
                  <td className="px-4 py-2.5 mono" style={{ color: "var(--text-dim)" }}>
                    {r.wcSku}
                  </td>
                  <td className="px-4 py-2.5">{r.name}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-2">
                      {r.missing.map((attr) => {
                        const isApproved = r.approved.includes(attr);
                        const value = r.values[attr] ?? "";
                        const isFilter = r.filterAttrs.includes(attr);
                        return (
                          <div
                            key={attr}
                            className="flex items-center gap-2 rounded-lg px-3 py-2"
                            style={{
                              background: isApproved ? "var(--green-dim)" : "var(--bg-hover)",
                              border: `1px solid ${isApproved ? "var(--green)" : "var(--border)"}`,
                            }}
                          >
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className="font-medium text-[13px]"
                                  style={{ color: isApproved ? "var(--green)" : "var(--text)" }}
                                >
                                  {attr}
                                </span>
                                {isFilter && (
                                  <span className="badge badge-accent" title="Will become a site filter (global=1)">
                                    filter
                                  </span>
                                )}
                              </div>
                              <span className="mono text-[12px] truncate" style={{ color: "var(--text-dim)" }}>
                                {value}
                              </span>
                            </div>
                            {isApproved ? (
                              <button
                                className="btn btn-sm"
                                style={{ padding: "2px 10px", fontSize: "11px" }}
                                onClick={() =>
                                  postDecision({ queue: "gaps-undo", masterSku: r.masterSku, attrName: attr })
                                }
                              >
                                Undo
                              </button>
                            ) : (
                              <button
                                className="btn btn-sm btn-green"
                                style={{ padding: "2px 10px", fontSize: "11px" }}
                                onClick={() =>
                                  postDecision({ queue: "gaps", masterSku: r.masterSku, attrName: attr })
                                }
                              >
                                Approve
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.approved.length === r.missing.length ? (
                      <span className="badge badge-green">all</span>
                    ) : r.approved.length > 0 ? (
                      <span className="badge badge-amber">
                        {r.approved.length}/{r.missing.length}
                      </span>
                    ) : (
                      <span className="badge badge-dim">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 200 && (
            <div className="text-center py-2 text-[12.5px]" style={{ color: "var(--text-dim)" }}>
              Showing the first 200 of {filtered.length} — narrow it down with search
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button className={`btn btn-sm ${active ? "btn-primary" : ""}`} onClick={onClick}>
      {label}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="card p-10 text-center" style={{ color: "var(--text-dim)" }}>
      {text}
    </div>
  );
}
