import { describe, expect, it } from "vitest";
import { hybridSearchWithDiagnostics, bm25Search } from "./hybrid-search.js";
import type { KnowledgeEntry, SearchVocabulary } from "../types.js";

// Domain vocabulary is config-injected — this fixture plays the role of one
// deployment's agent.yaml vocabulary (a wellness studio). The core has no
// domain terms of its own.
const TEST_VOCABULARY: SearchVocabulary = {
  categorySynonyms: {
    massage: ['massage', 'massages', 'rubdown', 'bodywork'],
    skincare: ['skincare', 'facial', 'facials', 'peel', 'peels'],
    classes: ['class', 'classes', 'lesson', 'lessons'],
    therapy: ['therapy', 'therapies', 'treatment', 'treatments'],
  },
  aliases: { fysio: 'physio' },
  attributeSignals: [],
};

const ENTRIES: KnowledgeEntry[] = [
  { id: "1", name: "Swedish Massage", category: "Massage", description: "Relaxing full-body massage", available: true },
  { id: "2", name: "Deep Tissue Massage", category: "Massage", description: "Targets deep muscle layers", available: true },
  { id: "3", name: "Hot Stone Therapy", category: "Therapy", description: "Heated stone treatment", available: true },
  { id: "4", name: "Physiotherapy Session", category: "Therapy", description: "Injury recovery session", available: true },
  { id: "5", name: "Hydrating Facial", category: "Skincare", description: "Moisture-restoring facial", available: true },
  { id: "6", name: "Sea Salt Scrub", category: "Skincare", description: "Exfoliating body scrub", available: true },
  { id: "7", name: "Morning Yoga", category: "Classes", description: "Group yoga session", available: true },
  { id: "8", name: "Pilates Class", category: "Classes", description: "Core strength class", available: true },
];

const OPTS = { vocabulary: TEST_VOCABULARY };

describe("hybrid search category fallback", () => {
  it("returns massage entries for plural query 'massages' via BM25 singular normalization", async () => {
    const { results } = await hybridSearchWithDiagnostics("massages", ENTRIES, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
    const names = results.map(r => r.item.name);
    expect(names).toContain("Swedish Massage");
    expect(names).toContain("Deep Tissue Massage");
  });

  it("returns class entries for synonym query 'lessons'", async () => {
    const { results } = await hybridSearchWithDiagnostics("lessons", ENTRIES, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns skincare entries for plural query 'facials'", async () => {
    const { results } = await hybridSearchWithDiagnostics("facials", ENTRIES, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.item.name === "Hydrating Facial")).toBe(true);
  });

  it("returns massage entries for pure synonym query 'bodywork' via category fallback", async () => {
    const { results, diagnostics } = await hybridSearchWithDiagnostics("bodywork", ENTRIES, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
    expect(diagnostics.categoryFallbackUsed).toBe(true);
    expect(results.some(r => r.item.name === "Swedish Massage")).toBe(true);
  });

  it("returns yoga entries for 'yoga' query", async () => {
    const { results } = await hybridSearchWithDiagnostics("yoga", ENTRIES, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.item.name === "Morning Yoga")).toBe(true);
  });

  it("does not use category fallback when BM25 has direct hits", async () => {
    const { results, diagnostics } = await hybridSearchWithDiagnostics("deep tissue massage", ENTRIES, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
    expect(diagnostics.categoryFallbackUsed).toBe(false);
    expect(results[0].item.name).toBe("Deep Tissue Massage");
  });

  it("uses category fallback for pure synonyms that BM25 cannot match", async () => {
    const { results, diagnostics } = await hybridSearchWithDiagnostics("bodywork", ENTRIES, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
    expect(diagnostics.categoryFallbackUsed).toBe(true);
    expect(diagnostics.embeddingMode).toBe("skipped");
  });

  it("returns empty diagnostics for empty query", async () => {
    const { results, diagnostics } = await hybridSearchWithDiagnostics("", ENTRIES, [], OPTS);
    expect(results.length).toBe(0);
    expect(diagnostics.categoryFallbackUsed).toBe(false);
  });

  it("returns empty diagnostics for empty knowledge base", async () => {
    const { results, diagnostics } = await hybridSearchWithDiagnostics("massages", [], [], OPTS);
    expect(results.length).toBe(0);
    expect(diagnostics.categoryFallbackUsed).toBe(false);
  });

  it("handles singular category query 'facial'", async () => {
    const { results } = await hybridSearchWithDiagnostics("facial", ENTRIES, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.item.name === "Hydrating Facial")).toBe(true);
  });

  it("BM25 resolves curated alias variants via the injected alias map", () => {
    // 'fysio' isn't a plural — only the vocabulary alias maps it to 'physio'
    const results = bm25Search("fysio", ENTRIES, TEST_VOCABULARY);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].item.name).toBe("Physiotherapy Session");
  });

  it("finds entries via description match even when category name differs", async () => {
    const entriesWithGear: KnowledgeEntry[] = [
      { id: "x1", name: "Heat Pack", category: "Gear", description: "Warm compress for sore muscles", available: true },
    ];
    const { results } = await hybridSearchWithDiagnostics("compresses", entriesWithGear, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].item.name).toBe("Heat Pack");
  });

  it("works with an EMPTY vocabulary — categories still match via the knowledge base's own category names", async () => {
    const { results } = await hybridSearchWithDiagnostics("massages", ENTRIES, []);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.item.name === "Swedish Massage")).toBe(true);
  });
});
