import type { Analysis, AnalyzeRequest, Answer, Resolution } from './contracts';

const base = (import.meta.env.VITE_CORE_URL || 'http://localhost:3001').replace(/\/$/, '');
async function request<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new Error('Il core non ha risposto in tempo. Riprova tra poco.');
    throw new Error('Core non raggiungibile. Avvia il servizio sulla porta 3001 oppure carica la missione demo.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `Il core ha restituito un errore (${response.status}). Riprova.`);
  if (!data) throw new Error('Risposta del core non valida. Controlla che il servizio rispetti il contratto API.');
  return data as T;
}
export async function analyze(input: AnalyzeRequest): Promise<Analysis> {
  const data = await request<Analysis>('/api/analyze', input);
  if (!data.id || !Array.isArray(data.assumptions) || !Array.isArray(data.tasks) || !data.source || data.mode !== input.mode) throw new Error('Il core ha restituito un’analisi incompleta. Nessuna missione è stata sostituita.');
  return data;
}
export async function resolve(analysis: Analysis, answers: Answer[]): Promise<Resolution> {
  const data = await request<Resolution>('/api/resolve', { analysis, answers });
  if (data.analysisId !== analysis.id || !data.progress || !Array.isArray(data.taskStates) || typeof data.briefMarkdown !== 'string') throw new Error('Il core ha restituito una risoluzione incompleta. Riprova.');
  return data;
}
