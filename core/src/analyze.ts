import type { Analysis, AnalyzeRequest } from "./contracts.js";
import { SpecOpsError } from "./errors.js";
import { DEMO_ANALYSIS, DEMO_PLAN, DEMO_SPEC } from "./fixture.js";
import { normalizeWhitespace } from "./normalize.js";
import { validateAnalyzeInput } from "./validate.js";

export function isLiveConfigured(): boolean {
  // Live adapter is not implemented in this delivery.
  return false;
}

export function analyze(request: AnalyzeRequest): Analysis {
  if (request.mode !== "mock" && request.mode !== "live") {
    throw new SpecOpsError(
      "INVALID_INPUT",
      'mode deve essere "mock" oppure "live".',
      400,
    );
  }

  const { spec, plan } = validateAnalyzeInput(request.spec, request.plan);

  if (request.mode === "live") {
    throw new SpecOpsError(
      "LIVE_NOT_CONFIGURED",
      "La modalità live non è configurata in questo servizio.",
      503,
    );
  }

  const normSpec = normalizeWhitespace(spec);
  const normPlan = normalizeWhitespace(plan);
  if (
    normSpec !== normalizeWhitespace(DEMO_SPEC) ||
    normPlan !== normalizeWhitespace(DEMO_PLAN)
  ) {
    throw new SpecOpsError(
      "MOCK_INPUT_MISMATCH",
      "Il mock accetta solo lo scenario demo. Carica la missione demo da GET /api/demo.",
      400,
    );
  }

  return structuredClone({
    ...DEMO_ANALYSIS,
    source: { spec: DEMO_SPEC, plan: DEMO_PLAN },
  });
}
