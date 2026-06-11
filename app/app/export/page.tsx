"use client";

import { useAppState } from "@/components/useAppState";

export default function ExportPage() {
  const { state, loading } = useAppState();

  if (loading) return <Empty text="Загрузка…" />;
  if (!state?.sources.master || !state?.sources.wc)
    return <Empty text="Сначала загрузи Master Specs и экспорт WooCommerce." />;

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-semibold mb-1">Экспорт</h1>
        <p style={{ color: "var(--text-dim)" }}>
          Итоговый CSV в формате импорта WooCommerce: товары сайта, обогащённые мастером, плюс новые товары черновиками.
        </p>
      </div>

      <div className="card p-5 flex flex-col gap-3">
        <CheckRow ok={pendingMatches === 0} label="Матчинг товаров" detail={pendingMatches === 0 ? "всё разобрано" : `осталось ${pendingMatches}`} href="/matches" />
        <CheckRow ok={pendingCats === 0} label="Категории" detail={pendingCats === 0 ? "дублей нет" : `осталось ${pendingCats} групп`} href="/categories" />
        <CheckRow ok={pendingAttrs === 0} label="Атрибуты" detail={pendingAttrs === 0 ? "всё чисто" : `осталось ${pendingAttrs} групп`} href="/attributes" />
      </div>

      <div className="card p-5">
        <div className="text-[13px] mb-4" style={{ color: "var(--text-dim)" }}>
          В файл войдёт: <b style={{ color: "var(--text)" }}>{state.sources.wc.count}</b> товаров сайта (из них{" "}
          <b style={{ color: "var(--green)" }}>{enriched}</b> обогащены данными мастера) +{" "}
          <b style={{ color: "var(--accent)" }}>{newProducts}</b> новых товаров (черновики, Published=0).
        </div>
        <div className="flex items-center gap-3">
          <a className="btn btn-primary" href="/api/export" download>
            Скачать WooCommerce CSV
          </a>
          {!ready && (
            <span className="text-[12.5px]" style={{ color: "var(--amber)" }}>
              Можно скачать и сейчас — нерешённые позиции просто останутся как на сайте.
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
