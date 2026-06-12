/**
 * offhook benchmark harness — latency, accuracy, and stress numbers for the
 * deterministic core. Run: `npm run bench` (writes docs/benchmarks.md).
 *
 * Scope: BM25 + category fallback + rerank + resolver + prompt build. The
 * embedding path and full pipeline TTFT (STT→LLM→TTS) are measured by the
 * Milestone B harness on a live deployment — see docs/evals.md.
 *
 * Everything here is synthetic and deterministic (seeded PRNG): no network,
 * no API keys, reproducible on any machine.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { hybridSearchWithDiagnostics } from '../src/search/hybrid-search.js';
import { buildEntityIndex, resolveEntityCandidates } from '../src/resolver/entity-index.js';
import { correctAsrTranscript } from '../src/asr/asr-correction.js';
import { buildMicroPrompt } from '../src/prompts/micro-prompts.js';
import type { AgentIdentity } from '../src/config/agent-config.js';
import type { KnowledgeEntry, SearchVocabulary } from '../src/types.js';
import { EMPTY_VOCABULARY } from '../src/types.js';

// =============================================================================
// SYNTHETIC KNOWLEDGE BASE (seeded — identical across runs)
// =============================================================================

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const ADJECTIVES = ['premium', 'standard', 'express', 'extended', 'guided', 'private', 'group', 'advanced', 'intro', 'seasonal', 'weekend', 'evening', 'morning', 'signature', 'classic'];
const NOUNS = ['consultation', 'assessment', 'session', 'workshop', 'membership', 'package', 'review', 'checkup', 'renewal', 'installation', 'inspection', 'tuning', 'training', 'briefing', 'orientation'];
const CATEGORIES = ['Services', 'Plans', 'Classes', 'Support', 'Facilities', 'Programs'];

function syntheticKb(size: number): KnowledgeEntry[] {
  const rng = makeRng(42);
  const entries: KnowledgeEntry[] = [];
  for (let i = 0; i < size; i++) {
    const adj = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(rng() * NOUNS.length)];
    const name = `${adj[0].toUpperCase()}${adj.slice(1)} ${noun[0].toUpperCase()}${noun.slice(1)} ${i}`;
    entries.push({
      id: `e${i}`,
      name,
      category: CATEGORIES[i % CATEGORIES.length],
      description: `A ${adj} ${noun} offered by the business`,
    });
  }
  return entries;
}

/** Mangle a name the way phone STT does: drop a char, swap two, etc. */
function asrMangle(text: string, rng: () => number): string {
  const words = text.toLowerCase().split(' ').filter(w => !/^\d+$/.test(w));
  return words.map(w => {
    if (w.length < 5) return w;
    const op = Math.floor(rng() * 3);
    const i = 1 + Math.floor(rng() * (w.length - 3));
    if (op === 0) return w.slice(0, i) + w.slice(i + 1);            // deletion
    if (op === 1) return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2); // transposition
    return w.slice(0, i) + 'x' + w.slice(i + 1);                     // substitution
  }).join(' ');
}

// =============================================================================
// MEASUREMENT
// =============================================================================

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function stats(samplesMs: number[]) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function fmt(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`;
}

async function timeAsync(fn: () => Promise<unknown>): Promise<number> {
  const t0 = performance.now();
  await fn();
  return performance.now() - t0;
}

// =============================================================================
// BENCHMARKS
// =============================================================================

const VOCAB: SearchVocabulary = {
  categorySynonyms: {
    services: ['services', 'service', 'offerings'],
    plans: ['plans', 'plan', 'memberships', 'subscriptions'],
    classes: ['classes', 'class', 'lessons'],
  },
  aliases: {},
  attributeSignals: [],
};

interface Row { label: string; p50: string; p95: string; p99: string; max: string }

async function benchSearchLatency(): Promise<Row[]> {
  const rows: Row[] = [];
  for (const size of [100, 1_000, 10_000]) {
    const kb = syntheticKb(size);
    const rng = makeRng(7);
    const queries: string[] = [];
    for (let i = 0; i < 50; i++) {
      const entry = kb[Math.floor(rng() * kb.length)];
      queries.push(
        entry.name.toLowerCase(),                       // exact
        entry.name.toLowerCase().split(' ').slice(0, 2).join(' '), // partial
        asrMangle(entry.name, rng),                     // ASR-mangled
        'memberships',                                  // category synonym
        'zzz unknown thing',                            // miss
      );
    }
    const samples: number[] = [];
    for (const q of queries) {
      samples.push(await timeAsync(() => hybridSearchWithDiagnostics(q, kb, [], { vocabulary: VOCAB })));
    }
    const s = stats(samples);
    rows.push({ label: `search (${size.toLocaleString()} entries, ${queries.length} queries)`, p50: fmt(s.p50), p95: fmt(s.p95), p99: fmt(s.p99), max: fmt(s.max) });
  }
  return rows;
}

async function benchResolver(): Promise<{ rows: Row[]; buildMs: Record<number, number> }> {
  const rows: Row[] = [];
  const buildMs: Record<number, number> = {};
  for (const size of [100, 1_000, 10_000]) {
    const kb = syntheticKb(size);
    const t0 = performance.now();
    const index = buildEntityIndex(kb);
    buildMs[size] = performance.now() - t0;

    const rng = makeRng(9);
    const samples: number[] = [];
    for (let i = 0; i < 300; i++) {
      const entry = kb[Math.floor(rng() * kb.length)];
      const q = i % 3 === 0 ? entry.name.toLowerCase() : asrMangle(entry.name, rng);
      const t = performance.now();
      resolveEntityCandidates(index, q, 3);
      samples.push(performance.now() - t);
    }
    const s = stats(samples);
    rows.push({ label: `resolver (${size.toLocaleString()} entries, 300 lookups)`, p50: fmt(s.p50), p95: fmt(s.p95), p99: fmt(s.p99), max: fmt(s.max) });
  }
  return { rows, buildMs };
}

function benchPromptBuild(): Row {
  const identity: AgentIdentity = {
    id: 'bench', businessName: 'Bench Co', agentName: 'Sam', tone: 'warm',
    primaryLanguage: 'en', aiDisclosure: true,
    hours: { monday: 'from 9 AM to 5 PM', friday: 'from 9 AM to 3 PM' },
    policies: { parking: 'Lot behind the building' },
  };
  const kb = syntheticKb(80);
  const samples: number[] = [];
  for (let i = 0; i < 2_000; i++) {
    const t = performance.now();
    buildMicroPrompt('discovery', {
      identity, entries: kb, callerName: i % 2 ? 'Alex' : undefined,
      workingSet: i % 3 ? [{ name: 'callback', detail: 'invoice question' }] : undefined,
    });
    samples.push(performance.now() - t);
  }
  const s = stats(samples);
  return { label: 'prompt build (80-entry KB, 2,000 builds)', p50: fmt(s.p50), p95: fmt(s.p95), p99: fmt(s.p99), max: fmt(s.max) };
}

async function benchAccuracy(): Promise<{ rows: string[]; summary: string }> {
  const kb = syntheticKb(500);
  const rng = makeRng(123);
  const cases: Array<{ q: string; expected: string; kind: string }> = [];
  for (let i = 0; i < 40; i++) {
    const entry = kb[Math.floor(rng() * kb.length)];
    cases.push({ q: entry.name.toLowerCase(), expected: entry.id, kind: 'exact' });
  }
  for (let i = 0; i < 40; i++) {
    const entry = kb[Math.floor(rng() * kb.length)];
    cases.push({ q: asrMangle(entry.name, rng), expected: entry.id, kind: 'asr-mangled' });
  }

  const byKind = new Map<string, { hit1: number; hit3: number; total: number }>();
  for (const c of cases) {
    const { results } = await hybridSearchWithDiagnostics(c.q, kb, [], { vocabulary: VOCAB });
    const ids = results.map(r => r.item.id);
    const agg = byKind.get(c.kind) ?? { hit1: 0, hit3: 0, total: 0 };
    agg.total += 1;
    if (ids[0] === c.expected) agg.hit1 += 1;
    if (ids.slice(0, 3).includes(c.expected)) agg.hit3 += 1;
    byKind.set(c.kind, agg);
  }

  const rows: string[] = [];
  let overallHit3 = 0, overallTotal = 0;
  for (const [kind, agg] of byKind) {
    rows.push(`| retrieval ${kind} (n=${agg.total}) | ${(agg.hit1 / agg.total * 100).toFixed(1)}% | ${(agg.hit3 / agg.total * 100).toFixed(1)}% |`);
    overallHit3 += agg.hit3; overallTotal += agg.total;
  }
  return { rows, summary: `${(overallHit3 / overallTotal * 100).toFixed(1)}% hit@3 overall (BM25+rerank only — embeddings add semantic rescue on top)` };
}

async function benchStress(): Promise<string[]> {
  const kb = syntheticKb(10_000);
  const index = buildEntityIndex(kb);
  const rng = makeRng(77);
  const queries = Array.from({ length: 2_000 }, () => {
    const entry = kb[Math.floor(rng() * kb.length)];
    return rng() > 0.5 ? entry.name.toLowerCase() : asrMangle(entry.name, rng);
  });

  // Sequential sustained load
  const t0 = performance.now();
  for (const q of queries) {
    await hybridSearchWithDiagnostics(q, kb, [], { vocabulary: VOCAB });
  }
  const seqMs = performance.now() - t0;

  // Concurrent burst (100 in flight) — simulates many simultaneous calls
  const t1 = performance.now();
  for (let i = 0; i < queries.length; i += 100) {
    await Promise.all(queries.slice(i, i + 100).map(q =>
      hybridSearchWithDiagnostics(q, kb, [], { vocabulary: VOCAB })));
  }
  const concMs = performance.now() - t1;

  // Resolver burst
  const t2 = performance.now();
  for (const q of queries) resolveEntityCandidates(index, q, 3);
  const resMs = performance.now() - t2;

  const memMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);
  return [
    `- 2,000 searches over a 10,000-entry KB, sequential: **${(seqMs / 1000).toFixed(2)}s** total (${(seqMs / queries.length).toFixed(2)}ms/query, ${(queries.length / (seqMs / 1000)).toFixed(0)} qps)`,
    `- Same load in concurrent bursts of 100: **${(concMs / 1000).toFixed(2)}s** total (${(queries.length / (concMs / 1000)).toFixed(0)} qps)`,
    `- 2,000 resolver lookups on the same KB: **${resMs.toFixed(0)}ms** total (${(resMs / queries.length * 1000).toFixed(0)}µs/lookup)`,
    `- Heap after stress run: **${memMb} MB**`,
  ];
}

// ASR-correction guard micro-bench: corrections must be effectively free.
function benchAsrCorrection(): Row {
  const kb = syntheticKb(1_000);
  const index = buildEntityIndex(kb, { asrVariants: { 'expres consultation': kb[0].name } });
  const rng = makeRng(5);
  const samples: number[] = [];
  for (let i = 0; i < 1_000; i++) {
    const entry = kb[Math.floor(rng() * kb.length)];
    const t = performance.now();
    correctAsrTranscript(index, asrMangle(entry.name, rng));
    samples.push(performance.now() - t);
  }
  const s = stats(samples);
  return { label: 'ASR correction (1,000-entry KB, 1,000 transcripts)', p50: fmt(s.p50), p95: fmt(s.p95), p99: fmt(s.p99), max: fmt(s.max) };
}

// =============================================================================
// MAIN
// =============================================================================

function rowTable(rows: Row[]): string {
  return [
    '| Operation | p50 | p95 | p99 | max |',
    '|---|---|---|---|---|',
    ...rows.map(r => `| ${r.label} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} |`),
  ].join('\n');
}

async function main() {
  console.log('Running offhook core benchmarks (deterministic, no network)...\n');

  const search = await benchSearchLatency();
  const resolver = await benchResolver();
  const prompt = benchPromptBuild();
  const asr = benchAsrCorrection();
  const accuracy = await benchAccuracy();
  const stress = await benchStress();

  const md = `# Core benchmarks

Generated by \`npm run bench\` — deterministic synthetic workload (seeded),
no network, no API keys. Numbers below are from the machine that last ran
the suite; run it yourself to get yours.

- **Machine:** ${os.cpus()[0]?.model ?? 'unknown'} (${os.cpus().length} cores), ${os.platform()} ${os.arch()}, Node ${process.version}
- **Date:** ${new Date().toISOString().slice(0, 10)}

## Hot-path latency

These run on EVERY caller turn, so they are budgeted in microseconds-to-
single-digit-milliseconds. The voice pipeline's perceived latency is
dominated by STT/LLM/TTS — the core must stay invisible next to them.

${rowTable([...search, ...resolver.rows, asr, prompt])}

Resolver index build (startup / knowledge reload, not per-turn):
${[100, 1_000, 10_000].map(s => `- ${s.toLocaleString()} entries: ${resolver.buildMs[s].toFixed(1)}ms`).join('\n')}

## Retrieval accuracy (golden set, keyword path only)

| Case | hit@1 | hit@3 |
|---|---|---|
${accuracy.rows.join('\n')}

${accuracy.summary}.
The tool layer returns max 3 entries to the LLM, so **hit@3 is the number
that decides whether a caller hears the right answer.**

## Stress (10,000-entry knowledge base)

${stress.join('\n')}

## What this does NOT cover

End-to-end voice latency (TTFT: caller stops speaking → first audio back)
and conversation quality are properties of the full pipeline and the
deployment's models. Those are measured by the live harness and the
LLM-judged simulated-call evals — see [evals.md](evals.md).
`;

  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'benchmarks.md'), md);
  console.log(md);
  console.log('\nWritten to docs/benchmarks.md');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
