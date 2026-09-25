import type { Analysis, Answer, Resolution } from './contracts';

export const demoSource = {
  spec: "Un'app per prenotare sale riunioni. Gli utenti vedono la disponibilità, prenotano e possono cancellare.",
  plan: "T1. Implementare login obbligatorio per prenotare.\nT2. Implementare prenotazioni di durata fissa pari a 30 minuti. Dipende da T1.\nT3. Consentire la cancellazione fino a 24 ore prima dell'inizio. Dipende da T2.\nT4. Inviare un'email con le condizioni di cancellazione. Dipende da T3.",
};
const lines = demoSource.plan.split('\n');
export const demoAnalysis: Analysis = {
  id: 'demo-rooms-v1', mode: 'mock', source: demoSource,
  tasks: [
    { id: 't1', title: 'Accesso utenti', planExcerpt: lines[0], dependsOnTaskIds: [] },
    { id: 't2', title: 'Prenotazioni', planExcerpt: lines[1], dependsOnTaskIds: ['t1'] },
    { id: 't3', title: 'Cancellazioni', planExcerpt: lines[2], dependsOnTaskIds: ['t2'] },
    { id: 't4', title: 'Email di conferma', planExcerpt: lines[3], dependsOnTaskIds: ['t3'] },
  ],
  assumptions: [
    { id: 'a1', title: 'Accesso alla missione', statement: 'Per prenotare una sala serve un account.', whyItMatters: 'La spec parla di utenti, ma non richiede la registrazione. Questa scelta influenza tutto il percorso di prenotazione.', kind: 'unspecified', planExcerpt: lines[0], question: 'Chi può prenotare?', affectedTaskIds: ['t1'], choices: [
      { id: 'account', label: 'Solo utenti registrati', instruction: 'Richiedere un account per prenotare una sala.', effect: 'confirm' },
      { id: 'guests', label: 'Anche chi non ha un account', instruction: 'Consentire la prenotazione anche agli ospiti senza account.', effect: 'revise' },
    ] },
    { id: 'a2', title: 'Questione di tempo', statement: 'Ogni prenotazione dura esattamente 30 minuti.', whyItMatters: 'La spec non definisce una durata. Una riunione breve e un workshop potrebbero avere esigenze diverse.', kind: 'unspecified', planExcerpt: lines[1], question: 'Quanto dura una prenotazione?', affectedTaskIds: ['t2'], choices: [
      { id: 'fixed', label: 'Sempre 30 minuti', instruction: 'Mantenere prenotazioni di durata fissa pari a 30 minuti.', effect: 'confirm' },
      { id: 'flexible', label: "Lo decide l'utente", instruction: "Consentire all'utente di scegliere la durata della prenotazione.", effect: 'revise' },
    ] },
    { id: 'a3', title: 'Cambio di programma', statement: 'Si può cancellare solo fino a 24 ore prima.', whyItMatters: 'La spec permette di cancellare senza indicare limiti. La regola deve comparire anche nelle email inviate agli utenti.', kind: 'unspecified', planExcerpt: lines[2], question: 'Fino a quando si può cancellare?', affectedTaskIds: ['t3'], choices: [
      { id: 'day_before', label: 'Fino a 24 ore prima', instruction: "Consentire la cancellazione fino a 24 ore prima dell'inizio.", effect: 'confirm' },
      { id: 'until_start', label: "Fino all'inizio della riunione", instruction: "Consentire la cancellazione fino all'inizio della prenotazione.", effect: 'revise' },
    ] },
  ],
};

// Offline demo and immediate impact preview only. Live commits use POST /api/resolve.
export function resolvePreview(analysis: Analysis, answers: Answer[]): Resolution {
  const selected = analysis.assumptions.map(a => ({ a, choice: a.choices.find(c => c.id === answers.find(r => r.assumptionId === a.id)?.choiceId) }));
  const direct = new Map(analysis.tasks.map(t => [t.id, new Set<string>()]));
  const upstream = new Map(analysis.tasks.map(t => [t.id, new Set<string>()]));
  for (const { a, choice } of selected) {
    if (choice?.effect !== 'revise') continue;
    a.affectedTaskIds.forEach(id => direct.get(id)?.add(a.id));
    const visited = new Set(a.affectedTaskIds);
    const queue = [...a.affectedTaskIds];
    for (let i = 0; i < queue.length; i++) {
      for (const task of analysis.tasks) {
        if (!task.dependsOnTaskIds.includes(queue[i]) || visited.has(task.id)) continue;
        visited.add(task.id); queue.push(task.id); upstream.get(task.id)?.add(a.id);
      }
    }
  }
  const taskStates = analysis.tasks.map(task => {
    const d = [...direct.get(task.id)!];
    const u = [...upstream.get(task.id)!].filter(id => !d.includes(id));
    return { taskId: task.id, status: (d.length || u.length ? 'needs_review' : 'proposed') as 'needs_review' | 'proposed', directCauseIds: d, upstreamCauseIds: u };
  });
  const confirmed = selected.filter(s => s.choice?.effect === 'confirm');
  const revised = selected.filter(s => s.choice?.effect === 'revise');
  const pending = selected.filter(s => !s.choice);
  const section = (title: string, items: string[]) => `## ${title}\n${items.length ? items.map(t => `- ${t}`).join('\n') : 'Nessuna'}`;
  return {
    analysisId: analysis.id,
    progress: { total: selected.length, answered: confirmed.length + revised.length, confirmed: confirmed.length, revised: revised.length, pending: pending.length },
    taskStates,
    briefMarkdown: [
      '# SpecOps · Brief per l’agente',
      section('Regole confermate', confirmed.map(s => s.choice!.instruction)),
      section('Regole da cambiare', revised.map(s => s.choice!.instruction)),
      section('Decisioni aperte', pending.map(s => s.a.question)),
      section('Task da rivalutare', taskStates.filter(s => s.status === 'needs_review').map(s => {
        const task = analysis.tasks.find(t => t.id === s.taskId)!;
        const describe = (ids: string[]) => ids.map(id => analysis.assumptions.find(a => a.id === id)?.title).join(', ');
        return `${task.title} (${s.taskId}): ${[s.directCauseIds.length ? `impatto diretto: ${describe(s.directCauseIds)}` : '', s.upstreamCauseIds.length ? `dipendenza: ${describe(s.upstreamCauseIds)}` : ''].filter(Boolean).join('; ')}`;
      })),
    ].join('\n\n'),
  };
}

export function updateAnswer(answers: Answer[], answer: Answer): Answer[] {
  return [...answers.filter(a => a.assumptionId !== answer.assumptionId), answer];
}

export function readSavedAnswers(): Answer[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('specops-demo-v1') ?? '[]');
    if (!Array.isArray(value)) return [];
    const valid: Answer[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const a = demoAnalysis.assumptions.find(a => a.id === item.assumptionId);
      if (a?.choices.some(c => c.id === item.choiceId) && !valid.some(v => v.assumptionId === a.id)) valid.push({ assumptionId: a.id, choiceId: item.choiceId });
    }
    return valid;
  } catch { return []; }
}
