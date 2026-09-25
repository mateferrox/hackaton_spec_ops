import type { SpecLibraryItem } from "./contracts.js";
import { DEMO_SPEC } from "../fixture.js";
import { findExactExcerpt } from "./util.js";

export interface SpecDocument {
  id: string;
  title: string;
  version: number;
  text: string;
}

const ROOMS_RULES = [
  "Solo gli utenti registrati possono prenotare.",
  "Le prenotazioni avvengono in slot di 30 minuti, anche consecutivi.",
  "È possibile cancellare fino a 24 ore prima dell'inizio.",
];

/** Extended demo spec with explicit rules used by the zen product flow. */
export const ROOMS_SPEC_TEXT = [
  "Un'app per prenotare sale riunioni. Gli utenti vedono la disponibilità, prenotano e possono cancellare.",
  "",
  "Regole esplicite:",
  ...ROOMS_RULES.map((r, i) => `${i + 1}. ${r}`),
].join("\n");

export const CHECKOUT_SPEC_TEXT = [
  "Negozio online con checkout in tre passi.",
  "",
  "Regole esplicite:",
  "1. Il pagamento richiede carta salvata o nuova carta verificata.",
  "2. Lo sconto promozionale non si cumula con il codice affiliato.",
  "3. La spedizione gratuita vale solo sopra i 50 euro di carrello.",
].join("\n");

const LIBRARY: SpecDocument[] = [
  {
    id: "rooms-v1",
    title: "Sale riunioni",
    version: 1,
    text: ROOMS_SPEC_TEXT,
  },
  {
    id: "checkout-v1",
    title: "Checkout e-commerce",
    version: 1,
    text: CHECKOUT_SPEC_TEXT,
  },
  {
    id: "legacy-demo",
    title: "Sale riunioni (fixture core)",
    version: 1,
    text: DEMO_SPEC,
  },
];

const imported = new Map<string, SpecDocument>();

export function listSpecs(): SpecLibraryItem[] {
  return [...LIBRARY, ...imported.values()].map((s) => ({
    id: s.id,
    title: s.title,
    version: s.version,
    preview: s.text.slice(0, 180).replace(/\s+/g, " ").trim(),
    characterCount: s.text.length,
  }));
}

export function getSpec(id: string, version?: number): SpecDocument | null {
  const fromLib = LIBRARY.find((s) => s.id === id);
  const doc = fromLib ?? imported.get(id) ?? null;
  if (!doc) return null;
  if (version !== undefined && doc.version !== version) return null;
  return doc;
}

export function importSpecText(title: string, text: string): SpecDocument {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("empty");
  }
  if (trimmed.length > 20_000) {
    throw new Error("too_long");
  }
  const id = `import_${Date.now().toString(36)}`;
  const doc: SpecDocument = {
    id,
    title: title.trim() || "Spec importata",
    version: 1,
    text: trimmed,
  };
  imported.set(id, doc);
  return doc;
}

export function roomsRuleExcerpts(text: string = ROOMS_SPEC_TEXT) {
  return ROOMS_RULES.map((statement) => {
    const loc = findExactExcerpt(text, statement);
    return {
      statement,
      sourceExcerpt: statement,
      sourceStart: loc?.start ?? 0,
      sourceEnd: loc?.end ?? statement.length,
    };
  });
}

export { ROOMS_RULES };
