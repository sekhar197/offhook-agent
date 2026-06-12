import { describe, expect, it } from "vitest";
import { hybridSearchWithDiagnostics, bm25Search } from "./hybrid-search.js";
import type { KnowledgeEntry, SearchVocabulary } from "../types.js";

// Domain vocabulary is config-injected — this fixture plays the role of a
// deployment's agent.yaml vocabulary (here: a restaurant). The core has no
// domain terms of its own.
const TEST_VOCABULARY: SearchVocabulary = {
  categorySynonyms: {
    appetizer: ['appetizer', 'appetizers', 'starter', 'starters', 'snack', 'snacks'],
    dessert: ['dessert', 'desserts', 'sweet', 'sweets'],
    drink: ['drink', 'drinks', 'beverage', 'beverages', 'soda', 'juice', 'smoothie'],
    bread: ['bread', 'breads', 'flatbread', 'roll', 'rolls'],
  },
  aliases: { curries: 'curry' },
  attributeSignals: [],
};

const ENTRIES: KnowledgeEntry[] = [
  { id: "1", name: "Samosa", category: "Appetizer", description: "Crispy pastry", available: true },
  { id: "2", name: "Paneer Tikka", category: "Appetizer", description: "Grilled cottage cheese", available: true },
  { id: "3", name: "Chicken Biryani", category: "Main", description: "Aromatic rice dish", available: true },
  { id: "4", name: "Butter Chicken", category: "Main", description: "Creamy curry", available: true },
  { id: "5", name: "Gulab Jamun", category: "Dessert", description: "Sweet dumpling", available: true },
  { id: "6", name: "Mango Lassi", category: "Drink", description: "Yogurt smoothie", available: true },
  { id: "7", name: "Garlic Naan", category: "Bread", description: "Garlic flatbread", available: true },
  { id: "8", name: "Spring Roll", category: "Starter", description: "Vegetable roll", available: true },
];

const OPTS = { vocabulary: TEST_VOCABULARY };

describe("hybrid search category fallback", () => {
  it("returns appetizer entries for plural query 'appetizers' via BM25 singular normalization", async () => {
    const { results } = await hybridSearchWithDiagnostics("appetizers", ENTRIES, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
    const names = results.map(r => r.item.name);
    expect(names).toContain("Samosa");
    expect(names).toContain("Paneer Tikka");
  });

  it("returns starter entries for synonym query 'starters'", async () => {
    const { results } = await hybridSearchWithDiagnostics("starters", ENTRIES, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns dessert entries for plural query 'desserts'", async () => {
    const { results } = await hybridSearchWithDiagnostics("desserts", ENTRIES, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.item.name === "Gulab Jamun")).toBe(true);
  });

  it("returns drink entries for pure synonym query 'beverages' via category fallback", async () => {
    const { results, diagnostics } = await hybridSearchWithDiagnostics("beverages", ENTRIES, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
    expect(diagnostics.categoryFallbackUsed).toBe(true);
    expect(results.some(r => r.item.name === "Mango Lassi")).toBe(true);
  });

  it("returns bread entries for 'naan' query", async () => {
    const { results } = await hybridSearchWithDiagnostics("naan", ENTRIES, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.item.name === "Garlic Naan")).toBe(true);
  });

  it("does not use category fallback when BM25 has direct hits", async () => {
    const { results, diagnostics } = await hybridSearchWithDiagnostics("chicken biryani", ENTRIES, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
    expect(diagnostics.categoryFallbackUsed).toBe(false);
    expect(results[0].item.name).toBe("Chicken Biryani");
  });

  it("uses category fallback for pure synonyms that BM25 cannot match", async () => {
    const { results, diagnostics } = await hybridSearchWithDiagnostics("beverages", ENTRIES, [], OPTS);
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
    const { results, diagnostics } = await hybridSearchWithDiagnostics("appetizers", [], [], OPTS);
    expect(results.length).toBe(0);
    expect(diagnostics.categoryFallbackUsed).toBe(false);
  });

  it("handles singular category query 'dessert'", async () => {
    const { results } = await hybridSearchWithDiagnostics("dessert", ENTRIES, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.item.name === "Gulab Jamun")).toBe(true);
  });

  it("BM25 handles plural forms via singularize normalization", () => {
    const results = bm25Search("curries", ENTRIES, TEST_VOCABULARY);
    expect(results.length).toBeGreaterThan(0);
  });

  it("finds entries via description match even when category name differs", async () => {
    const entriesWithSnack: KnowledgeEntry[] = [
      { id: "x1", name: "Chips", category: "Sides", description: "Crispy potato snack", available: true },
    ];
    const { results } = await hybridSearchWithDiagnostics("snacks", entriesWithSnack, [], OPTS);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].item.name).toBe("Chips");
  });

  it("works with an EMPTY vocabulary — categories still match via the knowledge base's own category names", async () => {
    const { results } = await hybridSearchWithDiagnostics("appetizers", ENTRIES, []);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.item.name === "Samosa")).toBe(true);
  });
});
