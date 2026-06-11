"use client";

import { useState } from "react";
import { useAppState, postDecision } from "@/components/useAppState";
import type { AttributeGroup } from "@/lib/queues";

export default function AttributesPage() {
  const { state, loading } = useAppState();

  if (loading) return <Empty text="Loading…" />;
  if (!state?.sources.master) return <Empty text="Upload your data on the Data page first." />;

  const groups = state.queues.attributes;
  const pending = groups.filter((g) => !g.decided);
  const done = groups.filter((g) => g.decided);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold mb-1">Attributes</h1>
        <p style={{ color: "var(--text-dim)" }}>
          Duplicate attribute names and value mismatches. Approved rules are applied on export.
        </p>
      </div>

      {groups.length === 0 && <Empty text="No attribute mismatches found." />}

      {pending.map((g) => (
        <AttributeCard key={g.suggested} group={g} />
      ))}

      {done.length > 0 && (
        <>
          <h2 className="text-[15px] font-semibold mt-2" style={{ color: "var(--text-dim)" }}>
            Decided · {done.length}
          </h2>
          {done.map((g) => (
            <AttributeCard key={g.suggested} group={g} />
          ))}
        </>
      )}
    </div>
  );
}

function AttributeCard({ group }: { group: AttributeGroup }) {
  const [name, setName] = useState(group.suggested);
  // выбор канона для каждой группы значений: index -> canonical
  const [valueChoices, setValueChoices] = useState<Record<number, string>>(
    Object.fromEntries(group.valueGroups.map((vg, i) => [i, vg.suggested]))
  );
  // группы значений, помеченные "не объединять"
  const [separate, setSeparate] = useState<Set<number>>(new Set());

  function approve() {
    // values: вариант -> канон; имена-варианты с префиксом "name:"
    const values: Record<string, string> = {};
    for (const v of group.nameVariants) {
      if (v.value !== name) values[`name:${v.value}`] = name;
    }
    group.valueGroups.forEach((vg, i) => {
      if (separate.has(i)) return; // значения остаются как есть
      const canon = valueChoices[i];
      for (const variant of vg.variants) {
        if (variant !== canon) values[variant] = canon;
      }
    });
    postDecision({ queue: "attributes", key: group.suggested, canonicalName: name, values, status: "approved" });
  }

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">{group.suggested}</span>
          {group.isFilter && <span className="badge badge-accent">site filter</span>}
          {group.nameVariants.length > 1 && <span className="badge badge-amber">{group.nameVariants.length} names</span>}
          {group.valueGroups.length > 0 && <span className="badge badge-dim">{group.valueGroups.length} value groups</span>}
        </div>
        {group.decided ? (
          <div className="flex items-center gap-2">
            <span className="badge badge-green">decided</span>
            <button className="btn btn-sm" onClick={() => postDecision({ queue: "attributes-undo", key: group.suggested })}>
              Undo
            </button>
          </div>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={approve}>
            Approve
          </button>
        )}
      </div>

      {group.nameVariants.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[12px] font-medium" style={{ color: "var(--text-dim)" }}>
            ATTRIBUTE NAME
          </div>
          {group.nameVariants.map((v) => (
            <label
              key={v.value}
              className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer"
              style={{
                background: name === v.value ? "var(--accent-dim)" : "var(--bg-hover)",
                border: `1px solid ${name === v.value ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              <input
                type="radio"
                checked={name === v.value}
                onChange={() => setName(v.value)}
                disabled={group.decided}
                className="accent-[#fd366e]"
              />
              <span className="text-[13px] flex-1">{v.value}</span>
              {v.sources.map((s) => (
                <span key={s} className={`badge ${s === "master" ? "badge-accent" : "badge-dim"}`}>
                  {s === "master" ? "master" : "site"}
                </span>
              ))}
            </label>
          ))}
        </div>
      )}

      {group.valueGroups.map((vg, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="text-[12px] font-medium" style={{ color: "var(--text-dim)" }}>
              VALUES · GROUP {i + 1}
            </div>
            <button
              className="btn btn-sm"
              disabled={group.decided}
              style={
                separate.has(i)
                  ? { background: "var(--amber-dim)", borderColor: "var(--amber)", color: "var(--amber)" }
                  : { padding: "1px 8px", fontSize: "11px" }
              }
              onClick={() =>
                setSeparate((s) => {
                  const n = new Set(s);
                  if (n.has(i)) n.delete(i);
                  else n.add(i);
                  return n;
                })
              }
            >
              {separate.has(i) ? "keeping as is" : "don't merge"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5" style={{ opacity: separate.has(i) ? 0.45 : 1 }}>
            {vg.variants.map((v) => (
              <button
                key={v}
                className="btn btn-sm"
                disabled={group.decided || separate.has(i)}
                style={
                  valueChoices[i] === v && !separate.has(i)
                    ? { background: "var(--accent-dim)", borderColor: "var(--accent)", color: "var(--accent)" }
                    : undefined
                }
                onClick={() => setValueChoices((c) => ({ ...c, [i]: v }))}
              >
                {v}
              </button>
            ))}
          </div>
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
