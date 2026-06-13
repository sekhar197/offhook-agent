/**
 * Knowledge folder loader.
 *
 * Drop files in `knowledge/` and the agent can answer from them:
 *
 * - `.md` files: each `## Heading` becomes an entry (name = heading,
 *   description = body until the next heading). The file's `# Title`
 *   (or the filename) becomes the category.
 * - `.yaml`/`.yml`/`.json` files: an array of entries
 *   `{ id?, name, category?, description?, pronunciationHint?, metadata? }`.
 *   Missing ids are derived from the name; missing categories fall back
 *   to the filename.
 *
 * The loader is pure on file content — no network, no database.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, extname } from 'path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { KnowledgeEntry } from '../types.js';

const FileEntrySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  pronunciationHint: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export class KnowledgeError extends Error {}

function slugify(text: string): string {
  // Unicode-aware: keep letters/numbers from ANY script (Devanagari, Telugu,
  // CJK, \u2026) so non-Latin entry names produce stable, unique ids instead of
  // collapsing to empty. Latin diacritics are stripped (caf\u00e9 \u2192 cafe); other
  // scripts are preserved as-is.
  const s = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip Latin combining diacritics
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-') // \p{M} keeps Indic matras attached
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return s;
}

function titleFromFilename(file: string): string {
  const base = basename(file, extname(file));
  return base.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Parse one markdown file into entries: `## Heading` = entry. */
export function parseMarkdownKnowledge(content: string, filename: string): KnowledgeEntry[] {
  const lines = content.split(/\r?\n/);
  let category = titleFromFilename(filename);
  const entries: KnowledgeEntry[] = [];

  let currentName: string | null = null;
  let currentBody: string[] = [];

  const flush = () => {
    if (currentName) {
      const description = currentBody.join('\n').trim();
      entries.push({
        id: `${slugify(category)}--${slugify(currentName)}`,
        name: currentName,
        category,
        ...(description ? { description } : {}),
      });
    }
    currentName = null;
    currentBody = [];
  };

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      category = h1[1].trim();
      continue;
    }
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      flush();
      currentName = h2[1].trim();
      continue;
    }
    if (currentName) currentBody.push(line);
  }
  flush();

  return entries;
}

/** Parse one YAML/JSON catalog file into entries. */
export function parseCatalogKnowledge(content: string, filename: string): KnowledgeEntry[] {
  let raw: unknown;
  try {
    raw = parseYaml(content); // YAML parser handles JSON too
  } catch (e) {
    throw new KnowledgeError(`${filename}: invalid YAML/JSON — ${e instanceof Error ? e.message : String(e)}`);
  }
  const parsed = z.array(FileEntrySchema).safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5)
      .map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new KnowledgeError(`${filename}: entries failed validation:\n${issues}`);
  }
  const fallbackCategory = titleFromFilename(filename);
  return parsed.data.map((e) => ({
    id: e.id ?? `${slugify(e.category ?? fallbackCategory)}--${slugify(e.name)}`,
    name: e.name,
    category: e.category ?? fallbackCategory,
    ...(e.description ? { description: e.description } : {}),
    ...(e.pronunciationHint ? { pronunciationHint: e.pronunciationHint } : {}),
    ...(e.metadata ? { metadata: e.metadata } : {}),
  }));
}

/**
 * Load every knowledge file in a folder (non-recursive by design — keep
 * knowledge bases flat and reviewable). Duplicate ids: last file wins,
 * with a console warning.
 */
export function loadKnowledgeFolder(folder: string): KnowledgeEntry[] {
  let files: string[];
  try {
    files = readdirSync(folder).filter(f => !f.startsWith('.')).sort();
  } catch {
    throw new KnowledgeError(`Cannot read knowledge folder at ${folder}`);
  }

  const byId = new Map<string, KnowledgeEntry>();
  for (const file of files) {
    const path = join(folder, file);
    if (!statSync(path).isFile()) continue;
    const ext = extname(file).toLowerCase();
    let entries: KnowledgeEntry[] = [];
    if (ext === '.md') {
      entries = parseMarkdownKnowledge(readFileSync(path, 'utf-8'), file);
    } else if (ext === '.yaml' || ext === '.yml' || ext === '.json') {
      entries = parseCatalogKnowledge(readFileSync(path, 'utf-8'), file);
    } else {
      continue; // ignore other file types
    }
    for (const entry of entries) {
      if (byId.has(entry.id)) {
        console.warn(`[Knowledge] Duplicate entry id "${entry.id}" — ${file} overrides an earlier file`);
      }
      byId.set(entry.id, entry);
    }
  }

  return [...byId.values()];
}
