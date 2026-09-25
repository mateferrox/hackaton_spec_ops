import type { Analysis, AnalyzeRequest, Assumption, Task } from "./contracts.js";

export const DEMO_SPEC =
  "Un'app per prenotare sale riunioni. Gli utenti vedono la disponibilità, prenotano e possono cancellare.";

export const DEMO_PLAN = [
  "T1. Implementare login obbligatorio per prenotare.",
  "T2. Implementare prenotazioni di durata fissa pari a 30 minuti. Dipende da T1.",
  "T3. Consentire la cancellazione fino a 24 ore prima dell'inizio. Dipende da T2.",
  "T4. Inviare un'email con le condizioni di cancellazione. Dipende da T3.",
].join("\n");

export const DEMO_ANALYZE_REQUEST: AnalyzeRequest = {
  spec: DEMO_SPEC,
  plan: DEMO_PLAN,
  mode: "mock",
};

const DEMO_TASKS: Task[] = [
  {
    id: "t1",
    title: "Login obbligatorio per prenotare",
    planExcerpt: "T1. Implementare login obbligatorio per prenotare.",
    dependsOnTaskIds: [],
  },
  {
    id: "t2",
    title: "Prenotazioni di durata fissa 30 minuti",
    planExcerpt:
      "T2. Implementare prenotazioni di durata fissa pari a 30 minuti. Dipende da T1.",
    dependsOnTaskIds: ["t1"],
  },
  {
    id: "t3",
    title: "Cancellazione fino a 24 ore prima",
    planExcerpt:
      "T3. Consentire la cancellazione fino a 24 ore prima dell'inizio. Dipende da T2.",
    dependsOnTaskIds: ["t2"],
  },
  {
    id: "t4",
    title: "Email condizioni di cancellazione",
    planExcerpt:
      "T4. Inviare un'email con le condizioni di cancellazione. Dipende da T3.",
    dependsOnTaskIds: ["t3"],
  },
];

const DEMO_ASSUMPTIONS: Assumption[] = [
  {
    id: "a1",
    title: "Login obbligatorio",
    statement:
      "Il piano richiede login obbligatorio per prenotare, senza dire se gli ospiti sono ammessi.",
    whyItMatters:
      "Decide chi può accedere alla prenotazione e cambia l'ambito del task di autenticazione.",
    kind: "unspecified",
    planExcerpt: "T1. Implementare login obbligatorio per prenotare.",
    question: "Chi può prenotare?",
    choices: [
      {
        id: "account",
        label: "Solo utenti registrati",
        instruction: "Consentire la prenotazione solo agli utenti registrati con account.",
        effect: "confirm",
      },
      {
        id: "guests",
        label: "Anche ospiti senza account",
        instruction: "Consentire la prenotazione anche agli ospiti senza account.",
        effect: "revise",
      },
    ],
    affectedTaskIds: ["t1"],
  },
  {
    id: "a2",
    title: "Durata fissa di 30 minuti",
    statement:
      "Il piano fissa le prenotazioni a 30 minuti senza alternative di durata flessibile.",
    whyItMatters:
      "Impatta come si modellano slot, disponibilità e interfaccia di prenotazione.",
    kind: "unspecified",
    planExcerpt:
      "T2. Implementare prenotazioni di durata fissa pari a 30 minuti. Dipende da T1.",
    question: "Quanto dura una prenotazione?",
    choices: [
      {
        id: "fixed",
        label: "Sempre 30 minuti",
        instruction: "Le prenotazioni durano sempre esattamente 30 minuti.",
        effect: "confirm",
      },
      {
        id: "flexible",
        label: "Durata scelta dall'utente",
        instruction: "Consentire all'utente di scegliere la durata della prenotazione.",
        effect: "revise",
      },
    ],
    affectedTaskIds: ["t2"],
  },
  {
    id: "a3",
    title: "Cancellazione fino a 24 ore prima",
    statement:
      "Il piano limita la cancellazione a 24 ore prima dell'inizio, senza altre finestre.",
    whyItMatters:
      "Determina la policy di cancellazione e il contenuto delle comunicazioni.",
    kind: "unspecified",
    planExcerpt:
      "T3. Consentire la cancellazione fino a 24 ore prima dell'inizio. Dipende da T2.",
    question: "Fino a quando si può cancellare?",
    choices: [
      {
        id: "day_before",
        label: "Fino a 24 ore prima",
        instruction: "Consentire la cancellazione solo fino a 24 ore prima dell'inizio.",
        effect: "confirm",
      },
      {
        id: "until_start",
        label: "Fino all'inizio della prenotazione",
        instruction:
          "Consentire la cancellazione fino all'inizio della prenotazione.",
        effect: "revise",
      },
    ],
    affectedTaskIds: ["t3"],
  },
];

export const DEMO_ANALYSIS: Analysis = {
  id: "demo-rooms-v1",
  mode: "mock",
  source: { spec: DEMO_SPEC, plan: DEMO_PLAN },
  tasks: DEMO_TASKS,
  assumptions: DEMO_ASSUMPTIONS,
};
