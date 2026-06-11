"use client";

import { useCallback, useEffect, useState } from "react";
import type { Decisions, MatchRow } from "@/lib/types";
import type { CategoryGroup, AttributeGroup, GapRow, ZohoCheckRow } from "@/lib/queues";

export interface AppState {
  sources: {
    master: { fileName: string; uploadedAt: string; count: number } | null;
    wc: { fileName: string; uploadedAt: string; count: number } | null;
    zoho: { fileName: string; uploadedAt: string; count: number } | null;
  };
  queues: {
    matches: MatchRow[];
    wcOnly: { sku: string; name: string }[];
    categories: CategoryGroup[];
    attributes: AttributeGroup[];
    gaps: GapRow[];
    zohoCheck: ZohoCheckRow[];
  };
  decisions: Decisions;
}

/** Сообщает всем подписчикам (включая сайдбар), что данные изменились */
export function notifyStateChanged() {
  window.dispatchEvent(new Event("app-state-changed"));
}

export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/state");
    setState(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("app-state-changed", refresh);
    return () => window.removeEventListener("app-state-changed", refresh);
  }, [refresh]);

  return { state, loading, refresh };
}

export async function postDecision(body: Record<string, unknown>) {
  try {
    const res = await fetch("/api/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(j.error ?? `HTTP ${res.status}`);
    }
  } catch (e) {
    alert(`Failed to save the decision — please try again.\n${e instanceof Error ? e.message : e}`);
  }
  // обновляем стейт в любом случае: после ошибки UI должен показать реальное состояние
  notifyStateChanged();
}
