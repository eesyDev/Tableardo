"use client";

import { useState } from "react";
import { useAppState, postDecision } from "@/components/useAppState";
import type { CategoryGroup } from "@/lib/queues";

export default function CategoriesPage() {
  const { state, loading } = useAppState();

  if (loading) return <Empty text="Loading…" />;
  if (!state?.sources.master) return <Empty text="Upload your data on the Data page first." />;

  const groups = state.queues.categories;
  const pending = groups.filter((g) => !g.decided);
  const done = groups.filter((g) => g.decided);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold mb-1">Categories</h1>
        <p style={{ color: "var(--text-dim)" }}>
          Similar category names from the master and the site. Pick the canonical one — the export will have no duplicates.
        </p>
      </div>

      {groups.length === 0 && <Empty text="No duplicate categories found." />}

      {pending.map((g) => (
        <CategoryCard key={g.variants.map((v) => v.value).join("|")} group={g} />
      ))}

      {done.length > 0 && (
        <>
          <h2 className="text-[15px] font-semibold mt-2" style={{ color: "var(--text-dim)" }}>
            Decided · {done.length}
          </h2>
          {done.map((g) => (
            <CategoryCard key={g.variants.map((v) => v.value).join("|")} group={g} />
          ))}
        </>
      )}
    </div>
  );
}

function CategoryCard({ group }: { group: CategoryGroup }) {
  const [canonical, setCanonical] = useState(group.suggested);
  const variants = group.variants;

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="badge badge-dim">{variants.length} variants</span>
        {group.decided ? (
          <div className="flex items-center gap-2">
            <span className="badge badge-green">decided</span>
            <button
              className="btn btn-sm"
              onClick={() => postDecision({ queue: "categories-undo", variants: variants.map((v) => v.value) })}
            >
              Undo
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              className="btn btn-sm"
              onClick={() => postDecision({ queue: "categories-separate", variants: variants.map((v) => v.value) })}
            >
              These are different categories
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() =>
                postDecision({ queue: "categories", variants: variants.map((v) => v.value), canonical, status: "approved" })
              }
            >
              Merge into “{canonical.length > 40 ? canonical.slice(0, 40) + "…" : canonical}”
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {variants.map((v) => (
          <label
            key={v.value}
            className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer"
            style={{
              background: canonical === v.value ? "var(--accent-dim)" : "var(--bg-hover)",
              border: `1px solid ${canonical === v.value ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            <input
              type="radio"
              checked={canonical === v.value}
              onChange={() => setCanonical(v.value)}
              disabled={group.decided}
              className="accent-[#fd366e]"
            />
            <span className="text-[13px] flex-1">{v.value}</span>
            <span className="mono" style={{ color: "var(--text-dim)" }}>
              ×{v.count}
            </span>
            {v.sources.map((s) => (
              <span key={s} className={`badge ${s === "master" ? "badge-accent" : "badge-dim"}`}>
                {s === "master" ? "master" : "site"}
              </span>
            ))}
          </label>
        ))}
      </div>
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
