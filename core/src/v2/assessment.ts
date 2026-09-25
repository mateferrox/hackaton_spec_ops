import type {
  AssessmentClassification,
  ChoiceAssessment,
  MissionChoice,
  Rule,
} from "./contracts.js";
import { assertExcerpt } from "./util.js";

export function validateEvidence(
  rules: Rule[],
  evidence: { ruleId: string; excerpt: string } | null,
  specText: string,
): boolean {
  if (!evidence) return true;
  const rule = rules.find((r) => r.id === evidence.ruleId);
  if (!rule) return false;
  if (!assertExcerpt(specText, rule.sourceExcerpt, rule.sourceStart, rule.sourceEnd)) {
    return false;
  }
  if (!specText.includes(evidence.excerpt)) return false;
  if (!rule.sourceExcerpt.includes(evidence.excerpt) && evidence.excerpt !== rule.sourceExcerpt) {
    // Allow exact rule excerpt or substring of it
    if (!rule.statement.includes(evidence.excerpt) && evidence.excerpt !== rule.statement) {
      return false;
    }
  }
  return true;
}

/** Deterministic classifier for prepared demo choices. */
export function classifyPrepared(
  classification: AssessmentClassification,
  explanation: string,
  evidence: ChoiceAssessment["evidence"],
  affectedTaskIds: string[],
): ChoiceAssessment {
  return { classification, explanation, evidence, affectedTaskIds };
}

export function buildChoice(
  id: string,
  label: string,
  proposedRule: string,
  assessment: ChoiceAssessment,
): MissionChoice {
  return { id, label, proposedRule, assessment };
}

/**
 * Rule-aware assessment for free-form choices when no prepared assessment exists.
 * Prefers deterministic keyword signals; falls back to uncertain.
 */
export function assessAgainstRules(
  proposedRule: string,
  label: string,
  rules: Rule[],
  relatedRuleIds: string[],
  taskIds: string[],
): ChoiceAssessment {
  const pool = relatedRuleIds.length
    ? rules.filter((r) => relatedRuleIds.includes(r.id))
    : rules;
  const text = `${label} ${proposedRule}`.toLowerCase();

  const negation =
    /\b(ospit|guest|senza account|anche senza|consent[ie].*senza|ignora|salta)\b/i.test(
      text,
    );
  const affirm =
    /\b(registrat|account|acced|login|richied|mantieni|rispetta|solo utenti)\b/i.test(
      text,
    );

  for (const rule of pool) {
    const ruleLower = rule.statement.toLowerCase();
    const exclusive =
      /solo|obbligat|non\s|fino a|non si cumula|richiede/i.test(rule.statement);

    if (exclusive && negation) {
      return {
        classification: "conflict",
        explanation:
          "La scelta proposta contraddice una regola esplicita della spec.",
        evidence: { ruleId: rule.id, excerpt: rule.sourceExcerpt },
        affectedTaskIds: [...taskIds],
      };
    }

    if (affirm && ruleLower.includes("registrat") && /registrat|account|acced/.test(text)) {
      return {
        classification: "aligned",
        explanation: "La scelta conferma la regola esplicita della spec.",
        evidence: { ruleId: rule.id, excerpt: rule.sourceExcerpt },
        affectedTaskIds: [],
      };
    }
  }

  if (pool.length === 0) {
    return {
      classification: "unspecified",
      explanation:
        "La spec non definisce questo punto: conviene formalizzare la scelta.",
      evidence: null,
      affectedTaskIds: [...taskIds],
    };
  }

  return {
    classification: "uncertain",
    explanation:
      "Non c’è evidenza sufficiente per dichiarare allineamento o conflitto.",
    evidence: null,
    affectedTaskIds: [...taskIds],
  };
}
