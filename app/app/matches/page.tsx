"use client";

import { useMemo, useState } from "react";
import { useAppState, postDecision } from "@/components/useAppState";
import type { MatchRow } from "@/lib/types";

type Filter = "review" | "auto" | "decided" | "wc-only" | "all";

export default function MatchesPage() {
  const { state, loading } = useAppState();
  const [filter, setFilter] = useState<Filter>("review");
  const [search, setSearch] = useState("");

  const q = state?.queues;
  const rows = useMemo(() => q?.matches ?? [], [q]);

  const groups = useMemo(() => {
    return {
      review: rows.filter((m) => !m.decision && m.candidates[0]?.score !== 100),
      auto: rows.filter((m) => m.candidates[0]?.score === 100),
      decided: rows.filter((m) => m.decision),
      all: rows,
    };
  }, [rows]);

  if (loading) return <Empty text="Loading…" />;
  if (!state?.sources.master || !state?.sources.wc)
    return <Empty text="Upload Master Specs and the WooCommerce export on the Data page first." />;

  const list = (filter === "wc-only" ? [] : groups[filter]).filter(
    (m) =>
      !search ||
      m.masterName.toLowerCase().includes(search.toLowerCase()) ||
      m.masterSku.includes(search)
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-semibold mb-1">Product matching</h1>
          <p style={{ color: "var(--text-dim)" }}>
            Master Specs (source of truth) against the site catalog.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <FilterBtn active={filter === "review"} onClick={() => setFilter("review")} label={`Needs review · ${groups.review.length}`} />
        <FilterBtn active={filter === "auto"} onClick={() => setFilter("auto")} label={`SKU matched · ${groups.auto.length}`} />
        <FilterBtn active={filter === "decided"} onClick={() => setFilter("decided")} label={`Decided · ${groups.decided.length}`} />
        <FilterBtn active={filter === "wc-only"} onClick={() => setFilter("wc-only")} label={`Site only · ${q!.wcOnly.length}`} />
        <input
          className="input ml-auto w-[220px]"
          placeholder="Search by name or SKU"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filter === "wc-only" ? (
        <WcOnlyList items={q!.wcOnly} search={search} />
      ) : (
        <div className="flex flex-col gap-3">
          {list.length === 0 && <Empty text="Nothing here — all sorted." />}
          {list.slice(0, 100).map((m) => (
            <MatchCard key={m.masterSku} row={m} />
          ))}
          {list.length > 100 && (
            <div className="text-center py-2 text-[12.5px]" style={{ color: "var(--text-dim)" }}>
              Showing the first 100 of {list.length} — narrow it down with search
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

function MatchCard({ row }: { row: MatchRow }) {
  const [manualSku, setManualSku] = useState("");
  const d = row.decision;
  const top = row.candidates[0];
  const isAuto = top?.score === 100;

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="mono" style={{ color: "var(--text-dim)" }}>{row.masterSku}</span>
            <span className="badge badge-dim">{row.sheet}</span>
            {row.marker && <span className="badge badge-amber">{row.marker}</span>}
            {d && (
              <span className={`badge ${d.status === "approved" ? "badge-green" : "badge-red"}`}>
                {d.status === "approved" ? (d.wcSku ? "linked" : "new product") : "rejected"}
              </span>
            )}
            {!d && isAuto && <span className="badge badge-green">SKU matched</span>}
          </div>
          <div className="font-medium mt-1">{row.masterName || <i style={{ color: "var(--text-dim)" }}>unnamed</i>}</div>
        </div>
        {d && (
          <button className="btn btn-sm" onClick={() => postDecision({ queue: "products-undo", masterSku: row.masterSku })}>
            Undo
          </button>
        )}
      </div>

      {!d && !isAuto && (
        <div className="flex flex-col gap-2">
          {row.candidates.length === 0 && (
            <div className="text-[12.5px]" style={{ color: "var(--text-dim)" }}>
              No similar products found on the site.
            </div>
          )}
          {row.candidates.map((c) => (
            <div
              key={c.wcSku}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
              style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}
            >
              <div className="min-w-0 flex items-center gap-2">
                <ScoreBadge score={c.score} />
                <span className="mono" style={{ color: "var(--text-dim)" }}>{c.wcSku}</span>
                <span className="truncate text-[13px]">{c.wcName}</span>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  className="btn btn-sm btn-green"
                  onClick={() =>
                    postDecision({ queue: "products", masterSku: row.masterSku, wcSku: c.wcSku, status: "approved", via: "fuzzy" })
                  }
                >
                  Link
                </button>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-1">
            <button
              className="btn btn-sm"
              onClick={() => postDecision({ queue: "products", masterSku: row.masterSku, wcSku: null, status: "approved", via: "manual" })}
            >
              Not on the site — new product
            </button>
            <button
              className="btn btn-sm btn-red"
              onClick={() => postDecision({ queue: "products", masterSku: row.masterSku, wcSku: null, status: "rejected", via: "manual" })}
            >
              Skip
            </button>
            <input
              className="input ml-auto w-[140px]"
              placeholder="WC SKU manually"
              value={manualSku}
              onChange={(e) => setManualSku(e.target.value)}
            />
            <button
              className="btn btn-sm"
              disabled={!manualSku.trim()}
              onClick={() =>
                postDecision({ queue: "products", masterSku: row.masterSku, wcSku: manualSku.trim(), status: "approved", via: "manual" })
              }
            >
              Link SKU
            </button>
          </div>
        </div>
      )}

      {!d && isAuto && top && (
        <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-dim)" }}>
          <span className="mono">{top.wcSku}</span>
          <span className="truncate">{top.wcName}</span>
          <button
            className="btn btn-sm btn-red ml-auto shrink-0"
            onClick={() => postDecision({ queue: "products", masterSku: row.masterSku, wcSku: null, status: "rejected", via: "manual" })}
          >
            Not a match
          </button>
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 95 ? "badge-green" : score >= 70 ? "badge-amber" : "badge-red";
  return <span className={`badge ${cls} mono shrink-0`}>{score}%</span>;
}

function WcOnlyList({ items, search }: { items: { sku: string; name: string }[]; search: string }) {
  const filtered = items.filter(
    (p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search)
  );
  return (
    <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
      <div className="px-4 py-3 text-[12.5px]" style={{ color: "var(--text-dim)" }}>
        Site products missing from Master Specs — consider adding them to the master sheet.
      </div>
      {filtered.map((p) => (
        <div key={p.sku || p.name} className="px-4 py-2.5 flex items-center gap-3" style={{ borderTop: "1px solid var(--border)" }}>
          <span className="mono" style={{ color: "var(--text-dim)" }}>{p.sku || "—"}</span>
          <span className="text-[13px] truncate">{p.name}</span>
        </div>
      ))}
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
