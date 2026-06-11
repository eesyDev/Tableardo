"use client";

import { useRef, useState } from "react";
import { useAppState, notifyStateChanged } from "@/components/useAppState";

const SOURCES = [
  {
    key: "master",
    title: "Master Specs",
    hint: "Google Sheets → XLSX, one sheet = one category",
    accept: ".xlsx,.xls",
    badge: "Source of Truth",
  },
  {
    key: "wc",
    title: "WooCommerce",
    hint: "Product export from the site, CSV",
    accept: ".csv",
    badge: "Site",
  },
  {
    key: "zoho",
    title: "Zoho Inventory",
    hint: "CSV (optional — Zoho metadata is already in the WC export)",
    accept: ".csv",
    badge: "Optional",
  },
] as const;

function Dropzone({
  source,
  title,
  hint,
  accept,
  badge,
  loaded,
}: {
  source: string;
  title: string;
  hint: string;
  accept: string;
  badge: string;
  loaded: { fileName: string; uploadedAt: string; count: number } | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/upload?source=${source}&name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        body: file,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: `Upload failed (HTTP ${res.status})` }));
        setError(j.error);
      } else {
        notifyStateChanged();
      }
    } catch (e) {
      setError(`Upload failed: ${e instanceof Error ? e.message : e}`);
    }
    setBusy(false);
  }

  return (
    <div
      className={`dropzone card p-6 flex flex-col gap-2 ${drag ? "drag" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) upload(f);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[15px]">{title}</span>
        <span className={`badge ${loaded ? "badge-green" : "badge-dim"}`}>{loaded ? "Loaded" : badge}</span>
      </div>
      <div className="text-[12.5px]" style={{ color: "var(--text-dim)" }}>
        {hint}
      </div>
      {busy && (
        <div className="text-[12.5px]" style={{ color: "var(--accent)" }}>
          Parsing…
        </div>
      )}
      {error && (
        <div className="text-[12.5px]" style={{ color: "var(--red)" }}>
          {error}
        </div>
      )}
      {loaded && !busy && (
        <div className="mono mt-1" style={{ color: "var(--text-dim)" }}>
          {loaded.fileName} · {loaded.count} rows
        </div>
      )}
      {!loaded && !busy && (
        <div className="text-[12.5px] mt-1" style={{ color: "var(--text-dim)" }}>
          Drop a file here or click
        </div>
      )}
    </div>
  );
}

export default function UploadPage() {
  const { state } = useAppState();
  const q = state?.queues;

  const autoMatched = q ? q.matches.filter((m) => m.candidates[0]?.score === 100).length : 0;
  const needsReview = q ? q.matches.filter((m) => !m.decision && m.candidates[0]?.score !== 100).length : 0;
  const decided = q ? q.matches.filter((m) => m.decision).length : 0;

  // прогресс по очередям и эффект будущего импорта
  const totalMaster = q?.matches.length ?? 0;
  const productsDone = autoMatched + decided;
  const catsTotal = q?.categories.length ?? 0;
  const catsDone = q ? q.categories.filter((c) => c.decided).length : 0;
  const attrsTotal = q?.attributes.length ?? 0;
  const attrsDone = q ? q.attributes.filter((a) => a.decided).length : 0;
  const doneAll = productsDone + catsDone + attrsDone;
  const totalAll = totalMaster + catsTotal + attrsTotal;
  const readiness = totalAll ? Math.round((doneAll / totalAll) * 100) : 0;
  const gapProducts = q?.gaps.length ?? 0;
  const gapValues = q ? q.gaps.reduce((n, g) => n + g.missing.length, 0) : 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-[22px] font-semibold mb-1">Data</h1>
        <p style={{ color: "var(--text-dim)" }}>
          Upload the exports — the app reconciles them and prepares a clean file for the site.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SOURCES.map((s) => (
          <Dropzone
            key={s.key}
            source={s.key}
            title={s.title}
            hint={s.hint}
            accept={s.accept}
            badge={s.badge}
            loaded={state?.sources[s.key] ?? null}
          />
        ))}
      </div>

      {state?.sources.master && state?.sources.wc && q && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-6 flex flex-col gap-4">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-[15px]">Reconciliation progress</span>
                <span className="text-[26px] font-semibold" style={{ color: "var(--accent)" }}>
                  {readiness}%
                </span>
              </div>
              <ProgressRow label="Products" done={productsDone} total={totalMaster} href="/matches" />
              <ProgressRow label="Categories" done={catsDone} total={catsTotal} href="/categories" />
              <ProgressRow label="Attributes" done={attrsDone} total={attrsTotal} href="/attributes" />
            </div>

            <div className="card p-6 flex flex-col gap-3">
              <span className="font-semibold text-[15px]">Import impact</span>
              <div className="text-[13px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
                Importing the export file will add{" "}
                <b style={{ color: "var(--green)" }}>{gapValues.toLocaleString("en-US")}</b> attribute values across{" "}
                <b style={{ color: "var(--text)" }}>{gapProducts}</b> products that are missing them on the site today.
              </div>
              <a href="/gaps" className="btn btn-sm self-start mt-auto">
                See what each product is missing →
              </a>
            </div>
          </div>

          <div>
            <h2 className="text-[16px] font-semibold mb-3">Reconciliation summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Matched by SKU" value={autoMatched} tone="green" />
              <StatCard label="Needs review" value={needsReview} tone="amber" />
              <StatCard label="Decided manually" value={decided} tone="dim" />
              <StatCard label="Site only" value={q.wcOnly.length} tone="red" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ProgressRow({ label, done, total, href }: { label: string; done: number; total: number; href: string }) {
  const pct = total ? Math.round((done / total) * 100) : 100;
  return (
    <a href={href} className="flex flex-col gap-1.5 group">
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="font-medium group-hover:underline">{label}</span>
        <span className="mono" style={{ color: "var(--text-dim)" }}>
          {done} / {total}
        </span>
      </div>
      <div className="progress">
        <div style={{ width: `${pct}%`, background: pct === 100 ? "var(--green)" : "var(--accent)" }} />
      </div>
    </a>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  const colors: Record<string, string> = {
    green: "var(--green)",
    amber: "var(--amber)",
    red: "var(--red)",
    dim: "var(--text)",
  };
  return (
    <div className="card p-5">
      <div className="text-[28px] font-semibold" style={{ color: colors[tone] }}>
        {value}
      </div>
      <div className="text-[12.5px] mt-1" style={{ color: "var(--text-dim)" }}>
        {label}
      </div>
    </div>
  );
}
