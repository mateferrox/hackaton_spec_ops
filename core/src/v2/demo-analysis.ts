import type {
  MissionChoice,
  MissionQuestion,
  MissionTask,
  Rule,
} from "./contracts.js";
import { assessAgainstRules, buildChoice, classifyPrepared } from "./assessment.js";
import { validateTaskDag } from "./dag.js";
import { ROOMS_RULES, roomsRuleExcerpts } from "./specs-library.js";
import { findExactExcerpt, newId, nowIso } from "./util.js";

export interface AnalysisResult {
  title: string;
  rules: Rule[];
  proposedTasks: Omit<MissionTask, "missionId">[];
  preflightQuestions: Omit<MissionQuestion, "missionId">[];
}

function ruleFromExcerpt(
  text: string,
  statement: string,
  origin: Rule["origin"] = "explicit",
): Rule {
  const loc = findExactExcerpt(text, statement);
  return {
    id: newId("rule"),
    statement,
    origin,
    sourceExcerpt: statement,
    sourceStart: loc?.start ?? 0,
    sourceEnd: loc?.end ?? statement.length,
  };
}

/** Heuristic: numbered or bulleted lines under "Regole". */
export function extractExplicitRules(text: string): Rule[] {
  const lines = text.split(/\r?\n/);
  const rules: Rule[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:\d+[\.)]\s+|[-*•]\s+)(.+)$/);
    if (!m) continue;
    const statement = m[1]!.trim();
    if (statement.length < 8 || statement.length > 240) continue;
    rules.push(ruleFromExcerpt(text, statement));
  }
  return rules;
}

function roomsDemoAnalysis(text: string, missionIdHint: string): AnalysisResult {
  const excerpts = roomsRuleExcerpts(text.includes(ROOMS_RULES[0]!) ? text : undefined);
  const rules: Rule[] = excerpts.map((e) => ({
    id: newId("rule"),
    statement: e.statement,
    origin: "explicit" as const,
    sourceExcerpt: e.sourceExcerpt,
    sourceStart: e.sourceStart,
    sourceEnd: e.sourceEnd,
  }));

  const tasks: Omit<MissionTask, "missionId">[] = [
    {
      id: "t1",
      title: "Accesso alle sale",
      description: "Login obbligatorio per prenotare.",
      dependsOnTaskIds: [],
      relevantRuleIds: [rules[0]!.id],
      status: "pending",
      evidenceRefs: [],
      needsReview: false,
      reviewCauseIds: [],
    },
    {
      id: "t2",
      title: "Prenotazioni",
      description: "Slot di 30 minuti.",
      dependsOnTaskIds: ["t1"],
      relevantRuleIds: [rules[1]!.id],
      status: "pending",
      evidenceRefs: [],
      needsReview: false,
      reviewCauseIds: [],
    },
    {
      id: "t3",
      title: "Cancellazioni",
      description: "Policy di cancellazione.",
      dependsOnTaskIds: ["t2"],
      relevantRuleIds: [rules[2]!.id],
      status: "pending",
      evidenceRefs: [],
      needsReview: false,
      reviewCauseIds: [],
    },
    {
      id: "t4",
      title: "Comunicazioni",
      description: "Email con condizioni di cancellazione.",
      dependsOnTaskIds: ["t3"],
      relevantRuleIds: [rules[2]!.id],
      status: "pending",
      evidenceRefs: [],
      needsReview: false,
      reviewCauseIds: [],
    },
  ];

  validateTaskDag(tasks);

  const q = (
    id: string,
    situation: string,
    prompt: string,
    taskIds: string[],
    rule: Rule,
    choices: MissionChoice[],
    key: string,
  ): Omit<MissionQuestion, "missionId"> => ({
    id,
    specVersion: 1,
    taskIds,
    ruleIds: [rule.id],
    situation,
    prompt,
    choices,
    state: "queued",
    deduplicationKey: key,
  });

  const preflightQuestions: Omit<MissionQuestion, "missionId">[] = [
    q(
      "q_access",
      "Giulia è arrivata.\nMa non ha un account.",
      "La lasci prenotare lo stesso?",
      ["t1"],
      rules[0]!,
      [
        buildChoice(
          "guests",
          "Sì, falla entrare",
          "Consentire la prenotazione anche agli ospiti senza account.",
          classifyPrepared(
            "conflict",
            "Questa scelta contraddice la regola di accesso riservato.",
            { ruleId: rules[0]!.id, excerpt: rules[0]!.sourceExcerpt },
            ["t1"],
          ),
        ),
        buildChoice(
          "account",
          "Prima deve accedere",
          "Consentire la prenotazione solo agli utenti registrati con account.",
          classifyPrepared(
            "aligned",
            "La scelta conferma la regola esplicita della spec.",
            { ruleId: rules[0]!.id, excerpt: rules[0]!.sourceExcerpt },
            [],
          ),
        ),
      ],
      "rooms-access",
    ),
    q(
      "q_duration",
      "Marco ha bisogno\ndi un’ora, tutta sua.",
      "Come gli prenoti la sala?",
      ["t2"],
      rules[1]!,
      [
        buildChoice(
          "hour",
          "Crea uno slot da un’ora",
          "Consentire slot di durata arbitraria, incluso un’ora intera.",
          classifyPrepared(
            "conflict",
            "Uno slot di un’ora cambia la regola degli slot da 30 minuti.",
            { ruleId: rules[1]!.id, excerpt: rules[1]!.sourceExcerpt },
            ["t2"],
          ),
        ),
        buildChoice(
          "slots",
          "Due slot da 30 minuti",
          "Le prenotazioni avvengono in slot di 30 minuti, anche consecutivi.",
          classifyPrepared(
            "aligned",
            "La scelta rispetta gli slot da 30 minuti.",
            { ruleId: rules[1]!.id, excerpt: rules[1]!.sourceExcerpt },
            [],
          ),
        ),
      ],
      "rooms-duration",
    ),
    q(
      "q_cancel",
      "Sara ha un imprevisto.\nLa riunione è tra 10 minuti.",
      "Può ancora cancellare?",
      ["t3"],
      rules[2]!,
      [
        buildChoice(
          "until_start",
          "Sì, annulla la prenotazione",
          "Consentire la cancellazione fino all'inizio della prenotazione.",
          classifyPrepared(
            "conflict",
            "La risposta cambia la policy di cancellazione entro 24 ore.",
            { ruleId: rules[2]!.id, excerpt: rules[2]!.sourceExcerpt },
            ["t3"],
          ),
        ),
        buildChoice(
          "day_before",
          "Mantieni il limite di 24 ore",
          "Consentire la cancellazione solo fino a 24 ore prima dell'inizio.",
          classifyPrepared(
            "aligned",
            "La scelta conferma il limite di 24 ore.",
            { ruleId: rules[2]!.id, excerpt: rules[2]!.sourceExcerpt },
            [],
          ),
        ),
      ],
      "rooms-cancel",
    ),
  ];

  void missionIdHint;
  void nowIso;
  return {
    title: "Sale riunioni",
    rules,
    proposedTasks: tasks,
    preflightQuestions,
  };
}

function genericAnalysis(title: string, text: string): AnalysisResult {
  let rules = extractExplicitRules(text);
  if (rules.length === 0) {
    // Treat first non-empty sentence-like lines as soft hypotheses (not explicit).
    const sentences = text
      .split(/[.!?\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 20 && s.length <= 200)
      .slice(0, 3);
    rules = sentences.map((s) => ({
      ...ruleFromExcerpt(text, s, "developer_confirmed"),
      origin: "developer_confirmed" as const,
    }));
  }

  const proposedTasks: Omit<MissionTask, "missionId">[] = rules
    .slice(0, 6)
    .map((rule, index) => ({
      id: `t${index + 1}`,
      title: rule.statement.slice(0, 80),
      description: `Implementare rispetto della regola: ${rule.statement}`,
      dependsOnTaskIds: index === 0 ? [] : [`t${index}`],
      relevantRuleIds: [rule.id],
      status: "pending" as const,
      evidenceRefs: [],
      needsReview: false,
      reviewCauseIds: [],
    }));

  if (proposedTasks.length === 0) {
    proposedTasks.push({
      id: "t1",
      title: "Lettura della spec",
      description: "Analizzare i requisiti e proporre i primi task.",
      dependsOnTaskIds: [],
      relevantRuleIds: [],
      status: "pending",
      evidenceRefs: [],
      needsReview: false,
      reviewCauseIds: [],
    });
  }

  validateTaskDag(proposedTasks);

  const preflightQuestions: Omit<MissionQuestion, "missionId">[] = rules
    .slice(0, 3)
    .map((rule, index) => {
      const taskId = proposedTasks[Math.min(index, proposedTasks.length - 1)]!.id;
      const conflict = buildChoice(
        "override",
        "Consenti un’eccezione",
        `Eccezione rispetto a: ${rule.statement}`,
        assessAgainstRules(
          `Eccezione rispetto a: ${rule.statement}`,
          "Consenti un’eccezione",
          [rule],
          [rule.id],
          [taskId],
        ),
      );
      // Force conflict evidence when rule is exclusive-looking
      if (/solo|obblig|non |fino a|richiede/i.test(rule.statement)) {
        conflict.assessment = classifyPrepared(
          "conflict",
          "Questa scelta contraddice una regola esplicita della spec.",
          { ruleId: rule.id, excerpt: rule.sourceExcerpt },
          [taskId],
        );
      }
      const aligned = buildChoice(
        "keep",
        "Resta nella regola",
        rule.statement,
        classifyPrepared(
          "aligned",
          "La scelta conferma la regola esplicita della spec.",
          { ruleId: rule.id, excerpt: rule.sourceExcerpt },
          [],
        ),
      );
      return {
        id: newId("q"),
        specVersion: 1,
        taskIds: [taskId],
        ruleIds: [rule.id],
        situation: `Caso di prova\nper la regola ${index + 1}.`,
        prompt: `Come applichi: «${rule.statement.slice(0, 80)}»?`,
        choices: [conflict, aligned],
        state: "queued" as const,
        deduplicationKey: `generic-${rule.id}`,
      };
    });

  return { title, rules, proposedTasks, preflightQuestions };
}

export function analyzeSpecDemo(input: {
  title: string;
  text: string;
  specId: string;
}): AnalysisResult {
  const isRooms =
    input.specId === "rooms-v1" ||
    ROOMS_RULES.every((r) => input.text.includes(r));
  if (isRooms) {
    return roomsDemoAnalysis(input.text, input.specId);
  }
  return genericAnalysis(input.title, input.text);
}
