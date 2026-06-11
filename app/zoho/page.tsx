"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/components/useAppState";

type Filter = "mismatch" | "all";

export default function ZohoPage() {
  const { state, loading } = useAppState();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("mismatch");

  const rows = useMemo(() => state?.queues.zohoCheck ?? [], [state]);

  if (loading) return <Empty text="Loading…" />;
  if (!state?.sources.zoho)
    return <Empty text="Upload the Zoho export on the Data page first." />;
  if (!state?.sources.master && !state?.sources.wc)
    return <Empty text="Upload Master Specs or WooCommerce export to compare." />;

  const filtered = rows.filter((r) => {
    const matchSearch =
      !search ||
      r.sku.includes(search) ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.zohoValue ?? "").toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === "mismatch") return r.mismatch;
    return true;
  });

  const mismatchCount = rows.filter((r) => r.mismatch).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-semibold mb-1">Zoho — Carrier Weight</h1>
          <p style={{ color: "var(--text-dim)" }}>
            Comparing Carrier Weight Class across Zoho, Master Specs, and the site.
          </p>
        </div>
        <input
          className="input w-[260px]"
          placeholder="Search by SKU or name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <FilterBtn active={filter === "mismatch"} onClick={() => setFilter("mismatch")} label={`Mismatch · ${mismatchCount}`} />
        <FilterBtn active={filter === "all"} onClick={() => setFilter("all")} label={`All · ${rows.length}`} />
      </div>

      {filtered.length === 0 && (
        <Empty text={rows.length === 0 ? "No overlapping SKU found between Zoho and your data." : "Nothing matches the filter."} />
      )}

      {filtered.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-dim)" }}>
                <th className="text-left font-medium px-4 py-2.5 w-[110px]">SKU</th>
                <th className="text-left font-medium px-4 py-2.5">Product</th>
                <th className="text-left font-medium px-4 py-2.5 w-[140px]">Master</th>
                <th className="text-left font-medium px-4 py-2.5 w-[140px]">WooCommerce</th>
                <th className="text-left font-medium px-4 py-2.5 w-[140px]">Zoho</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 300).map((r) => (
                <tr key={r.sku} style={{ borderBottom: "1px solid var(--border)" }} className="align-top">
                  <td className="px-4 py-2.5 mono" style={{ color: "var(--text-dim)" }}>{r.sku}</td>
                  <td className="px-4 py-2.5">{r.name}</td>
                  <td className="px-4 py-2.5">
                    <ValueCell value={r.masterValue} zoho={r.zohoValue} />
                  </td>
                  <td className="px-4 py-2.5">
                    <ValueCell value={r.wcValue} zoho={r.zohoValue} />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="mono" style={{ color: "var(--accent)" }}>{r.zohoValue}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 300 && (
            <div className="text-center py-2 text-[12.5px]" style={{ color: "var(--text-dim)" }}>
              Showing the first 300 of {filtered.length} — narrow it down with search
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ValueCell({ value, zoho }: { value: string | null; zoho: string | null }) {
  if (value === null) return <span style={{ color: "var(--text-dim)" }}>—</span>;
  const ok = value === zoho;
  return (
    <span className="mono" style={{ color: ok ? "var(--green)" : "var(--red)" }}>
      {value}
    </span>
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
