"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppState } from "./useAppState";

export function Sidebar() {
  const pathname = usePathname();
  const { state } = useAppState();

  const q = state?.queues;
  const pendingMatches = q
    ? q.matches.filter((m) => !m.decision && m.candidates[0]?.score !== 100).length
    : 0;
  const pendingCats = q ? q.categories.filter((c) => !c.decided).length : 0;
  const pendingAttrs = q ? q.attributes.filter((a) => !a.decided).length : 0;
  const gaps = q ? q.gaps.filter((g) => g.missing.some((a) => !g.approved.includes(a))).length : 0;
  const zohoMismatch = q ? q.zohoCheck?.filter((r) => r.mismatch).length ?? 0 : 0;

  // queue: счётчик — это нерешённые задачи (акцентный бейдж, ✓ когда ноль);
  // report: счётчик — справка, не требующая действий (серый бейдж)
  const items = [
    { href: "/", label: "Data", count: null as number | null, kind: "queue" },
    { href: "/matches", label: "Products", count: pendingMatches, kind: "queue" },
    { href: "/categories", label: "Categories", count: pendingCats, kind: "queue" },
    { href: "/attributes", label: "Attributes", count: pendingAttrs, kind: "queue" },
    { href: "/gaps", label: "Missing attrs", count: gaps, kind: "report" },
    { href: "/zoho", label: "Zoho CW", count: zohoMismatch, kind: "report" },
    { href: "/export", label: "Export", count: null, kind: "queue" },
  ];

  return (
    <aside
      className="w-[230px] shrink-0 px-4 py-6 flex flex-col gap-1 sticky top-0 h-screen"
      style={{ borderRight: "1px solid var(--border)" }}
    >
      <div className="px-3 mb-6 flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm"
          style={{ background: "var(--accent)" }}
        >
          C
        </div>
        <div>
          <div className="font-semibold text-[14px] leading-tight">Catalog Sync</div>
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
            Master ↔ WooCommerce
          </div>
        </div>
      </div>

      {items.map((it) => (
        <Link key={it.href} href={it.href} className={`nav-link ${pathname === it.href ? "active" : ""}`}>
          <span>{it.label}</span>
          {it.count !== null && it.count > 0 && (
            <span className={`badge ${it.kind === "report" ? "badge-dim" : "badge-accent"}`}>{it.count}</span>
          )}
          {it.count === 0 && state?.sources.master && <span className="badge badge-green">✓</span>}
        </Link>
      ))}

      <div className="mt-auto px-3 text-[11px]" style={{ color: "var(--text-dim)" }}>
        {state?.sources.master && <div>Master: {state.sources.master.count} SKU</div>}
        {state?.sources.wc && <div>Site: {state.sources.wc.count} products</div>}
      </div>
    </aside>
  );
}
