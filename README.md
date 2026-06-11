# Catalog Sync

Internal tool that reconciles the **Master Specs** spreadsheet (source of truth) with the **WooCommerce** catalog of the JMA attachments store, and produces a clean, import-ready CSV.

## What it does

1. **Upload** the Master Specs XLSX (one sheet = one category) and the WooCommerce product export CSV. A Zoho Inventory CSV is optional — Zoho metadata already lives in the WC export.
2. **Products** — every master SKU is matched against the site: exact SKU matches are automatic, the rest get fuzzy name suggestions to review. Each decision is manual, saved, and undoable.
3. **Categories / Attributes** — near-duplicate names and values ("Bucket Pin" vs "Bucket Pins", "Cat 307" vs "CAT 307") are grouped; you pick the canonical form once and it is applied everywhere on export.
4. **Missing attrs** — a per-product table of master attributes that are absent on the site today.
5. **Export** — a WooCommerce-import CSV: existing site products enriched with master data, new products as drafts (`Published=0`).

The export is safe to re-import: it preserves the `global`/`visible` flags of existing site attributes (so layered-nav filters keep working), merges attribute names canonically, extends attribute column slots as needed, and escapes commas inside numeric values (`3,200 kg` → `3\,200 kg`) the way the WooCommerce importer expects.

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Uploaded data and review decisions are stored in `data/*.json`.

## Deploying to Vercel

The filesystem on Vercel is ephemeral, so the app stores its data in **Vercel Blob** when a token is present:

1. Create the project on Vercel (root directory: this folder).
2. Storage → Create **Blob** store and connect it to the project — this sets `BLOB_READ_WRITE_TOKEN` automatically.
3. Recommended: Settings → Deployment Protection → **Vercel Authentication**, so the tool isn't public.
4. Deploy, then upload the two files through the UI.

Large transfers fit Vercel's 4.5 MB body limits because uploads are gzip-compressed by the browser and the export CSV is served gzip-encoded.

## Importing the result into WooCommerce

WooCommerce admin → Products → **Import** → upload the CSV → tick **“Update existing products”** (matching is by ID/SKU). New products arrive as drafts. Back up the site before the first real import.

## Code map

| Path | Purpose |
|---|---|
| `lib/parsers.ts` | XLSX/CSV parsing, SKU dedup, name cleanup |
| `lib/match.ts` | SKU + fuzzy matching (Jaccard × Levenshtein), master-name markers |
| `lib/queues.ts` | review queues: matches, categories, attributes, missing-attribute table |
| `lib/store.ts` | persistence: local JSON files or Vercel Blob (with in-memory cache) |
| `app/api/export/route.ts` | WooCommerce import CSV builder |
| `data/decisions.json` | accumulated manual decisions (approve once — never asked again) |
