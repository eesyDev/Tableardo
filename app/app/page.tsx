"use client";

import { useRef, useState } from "react";
import { useAppState, notifyStateChanged } from "@/components/useAppState";

const SOURCES = [
  {
    key: "master",
    title: "Master Specs",
    hint: "Google Sheets → XLSX, лист = категория",
    accept: ".xlsx,.xls",
    badge: "Source of Truth",
  },
  {
    key: "wc",
    title: "WooCommerce",
    hint: "Экспорт товаров с сайта, CSV",
    accept: ".csv",
    badge: "Сайт",
  },
  {
    key: "zoho",
    title: "Zoho Inventory",
    hint: "CSV (опционально — метаданные Zoho уже есть в WC)",
    accept: ".csv",
    badge: "Опционально",
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
    const fd = new FormData();
    fd.append("file", file);
    fd.append("source", source);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Ошибка загрузки" }));
      setError(j.error);
    } else {
      notifyStateChanged();
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
        <span className={`badge ${loaded ? "badge-green" : "badge-dim"}`}>{loaded ? "Загружено" : badge}</span>
      </div>
      <div className="text-[12.5px]" style={{ color: "var(--text-dim)" }}>
        {hint}
      </div>
      {busy && (
        <div className="text-[12.5px]" style={{ color: "var(--accent)" }}>
          Парсинг…
        </div>
      )}
      {error && (
        <div className="text-[12.5px]" style={{ color: "var(--red)" }}>
          {error}
        </div>
      )}
      {loaded && !busy && (
        <div className="mono mt-1" style={{ color: "var(--text-dim)" }}>
          {loaded.fileName} · {loaded.count} строк
        </div>
      )}
      {!loaded && !busy && (
        <div className="text-[12.5px] mt-1" style={{ color: "var(--text-dim)" }}>
          Перетащи файл или кликни
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

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-[22px] font-semibold mb-1">Данные</h1>
        <p style={{ color: "var(--text-dim)" }}>
          Загрузи выгрузки — приложение сверит их и подготовит чистый файл для сайта.
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
        <div>
          <h2 className="text-[16px] font-semibold mb-3">Сводка сверки</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Совпали по SKU" value={autoMatched} tone="green" />
            <StatCard label="Нужна проверка" value={needsReview} tone="amber" />
            <StatCard label="Решено вручную" value={decided} tone="dim" />
            <StatCard label="Только на сайте" value={q.wcOnly.length} tone="red" />
          </div>
        </div>
      )}
    </div>
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
