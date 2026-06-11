"use client";

import { useCallback, useEffect, useState } from "react";
import type { Decisions, MatchRow } from "@/lib/types";
import type { CategoryGroup, AttributeGroup, GapRow } from "@/lib/queues";

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
  await fetch("/api/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  notifyStateChanged();
}
