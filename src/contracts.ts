// Mirror of the agreed core contract. Kept local so the UI runs before core/ exists.
export type Mode = 'mock' | 'live';
export interface AnalyzeRequest { spec: string; plan: string; mode: Mode }
export interface Task { id: string; title: string; planExcerpt: string; dependsOnTaskIds: string[] }
export interface Choice { id: string; label: string; instruction: string; effect: 'confirm' | 'revise' }
export interface Assumption {
  id: string; title: string; statement: string; whyItMatters: string;
  kind: 'unspecified' | 'ambiguous'; planExcerpt: string; question: string;
  choices: Choice[]; affectedTaskIds: string[];
}
export interface Analysis { id: string; mode: Mode; source: { spec: string; plan: string }; tasks: Task[]; assumptions: Assumption[] }
export interface Answer { assumptionId: string; choiceId: string }
export interface ResolveRequest { analysis: Analysis; answers: Answer[] }
export interface TaskResolution { taskId: string; status: 'proposed' | 'needs_review'; directCauseIds: string[]; upstreamCauseIds: string[] }
export interface Resolution {
  analysisId: string;
  progress: { total: number; answered: number; confirmed: number; revised: number; pending: number };
  taskStates: TaskResolution[];
  briefMarkdown: string;
}
