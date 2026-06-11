// Общие типы данных приложения

export interface MasterProduct {
  sku: string;
  name: string;
  category: string;
  sheet: string;
  // имя атрибута (без суффикса) -> значение
  attrs: Record<string, string>;
  // имена атрибутов, помеченных /Filter в исходнике
  filterAttrs: string[];
  // строка содержала *** или другие маркеры
  flagged: boolean;
  rowIndex: number;
}

export interface WcProduct {
  id: string;
  sku: string;
  name: string;
  categories: string[];
  attrs: Record<string, string>;
  published: string;
  regularPrice: string;
  salePrice: string;
  stock: string;
  images: string;
  // полная исходная строка для экспорта
  raw: Record<string, string>;
}

export interface Sources {
  master: { fileName: string; uploadedAt: string; products: MasterProduct[] } | null;
  wc: { fileName: string; uploadedAt: string; products: WcProduct[]; headers: string[] } | null;
  zoho: { fileName: string; uploadedAt: string; products: Record<string, string>[]; headers: string[] } | null;
}

export type DecisionStatus = "approved" | "rejected";

export interface ProductDecision {
  wcSku: string | null; // null = "нет пары, это новый товар"
  status: DecisionStatus;
  via: "auto-sku" | "fuzzy" | "manual";
  at: string;
}

export interface CategoryDecision {
  canonical: string;
  status: DecisionStatus;
  at: string;
}

export interface AttributeDecision {
  canonicalName: string;
  status: DecisionStatus;
  at: string;
  // вариант значения -> каноничное значение
  values: Record<string, string>;
}

export interface Decisions {
  // ключ — SKU из мастера
  products: Record<string, ProductDecision>;
  // ключ — вариант названия категории
  categories: Record<string, CategoryDecision>;
  // ключ — нормализованное имя атрибута-группы
  attributes: Record<string, AttributeDecision>;
}

export interface MatchCandidate {
  wcSku: string;
  wcName: string;
  score: number;
}

export interface MatchRow {
  masterSku: string;
  masterName: string;
  sheet: string;
  // пометка из мастера: Duplicate / Discontinued / Old Model / ✱
  marker: string | null;
  candidates: MatchCandidate[];
  decision: ProductDecision | null;
}
