import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight, ArrowUpRight, ArrowCounterClockwise, ArrowsOut, ArrowsIn, Check, CheckCircle,
  Command, Copy, Crosshair, DownloadSimple, FileText, Fingerprint, GitBranch, Hexagon,
  Info, Keyboard, Lightning, Plus, ShieldCheck, SpeakerHigh, SpeakerSlash, Timer,
  WarningCircle, X, ArrowUUpLeft, EnvelopeSimple, FlagCheckered, CircleNotch,
} from '@phosphor-icons/react';
import type { Analysis, Answer, Resolution } from './contracts';
import { demoAnalysis, demoSource, readSavedAnswers, resolvePreview, updateAnswer } from './demo';
import * as api from './api';
import DecisionCard from './DecisionCard';
import Dialog from './Dialog';
import OrbitalScene from './OrbitalScene';

type Panel = 'source' | 'briefing' | 'brief' | 'task' | 'help' | 'reset' | null;
const taskIcons = [Fingerprint, Timer, ArrowUUpLeft, EnvelopeSimple];

export default function App() {
  const [analysis, setAnalysis] = useState<Analysis>(demoAnalysis);
  const [answers, setAnswers] = useState<Answer[]>(readSavedAnswers);
  const [index, setIndex] = useState(() => {
    const saved = readSavedAnswers();
    const next = demoAnalysis.assumptions.findIndex(a => !saved.some(s => s.assumptionId === a.id));
    return next < 0 ? 0 : next;
  });
  const [selectedId, setSelectedId] = useState<string>();
  const [showSummary, setShowSummary] = useState(() => readSavedAnswers().length === demoAnalysis.assumptions.length);
  const [serverResolution, setServerResolution] = useState<Resolution | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [taskId, setTaskId] = useState('t1');
  const [pulse, setPulse] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [draftSpec, setDraftSpec] = useState(demoSource.spec);
  const [draftPlan, setDraftPlan] = useState(demoSource.plan);
  const [toast, setToast] = useState('');
  const [sound, setSound] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const transitionLock = useRef(false);
  const card = analysis.assumptions[index];
  const resolution = useMemo(() => serverResolution ?? resolvePreview(analysis, answers), [analysis, answers, serverResolution]);
  const savedChoiceId = answers.find(a => a.assumptionId === card?.id)?.choiceId;
  const selected = card?.choices.find(c => c.id === selectedId);
  const previewAnswers = selected && card ? updateAnswer(answers, { assumptionId: card.id, choiceId: selected.id }) : answers;
  const preview = resolvePreview(analysis, previewAnswers);
  const isPreview = Boolean(selected && selected.id !== savedChoiceId && !showSummary);
  const displayedStates = isPreview ? preview.taskStates : resolution.taskStates;
  const impactOnly = card ? resolvePreview(analysis, [{ assumptionId: card.id, choiceId: card.choices.find(c => c.effect === 'revise')?.id ?? '' }]) : null;
  const highlightedIds = showSummary ? [] : impactOnly?.taskStates.filter(s => s.status === 'needs_review').map(s => s.taskId) ?? [];
  const reviewCount = resolution.taskStates.filter(t => t.status === 'needs_review').length;
  const complete = resolution.progress.pending === 0 && resolution.progress.total > 0;
  const inspectedTask = analysis.tasks.find(t => t.id === taskId);
  const inspectedState = resolution.taskStates.find(t => t.taskId === taskId);

  useEffect(() => { setSelectedId(answers.find(a => a.assumptionId === analysis.assumptions[index]?.id)?.choiceId); setError(''); }, [index, analysis, answers]);
  useEffect(() => {
    if (analysis.id !== demoAnalysis.id) return;
    try { localStorage.setItem('specops-demo-v1', JSON.stringify(answers)); } catch { /* Storage may be unavailable; the session still works. */ }
  }, [answers, analysis.id]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3300);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  useEffect(() => () => { void audio.current?.close(); }, []);

  const beep = useCallback((kind: 'select' | 'confirm' | 'finish' = 'select') => {
    if (!sound) return;
    try {
      const ctx = audio.current ?? new AudioContext(); audio.current = ctx;
      void ctx.resume();
      const notes = kind === 'finish' ? [330, 440, 660] : kind === 'confirm' ? [330, 520] : [270];
      notes.forEach((frequency, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0, ctx.currentTime + i * .075);
        gain.gain.linearRampToValueAtTime(.035, ctx.currentTime + i * .075 + .01);
        gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + i * .075 + .17);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * .075); osc.stop(ctx.currentTime + i * .075 + .18);
      });
    } catch { setSound(false); }
  }, [sound]);

  const choose = (id: string) => { if (busy) return; setSelectedId(id); beep(); };
  const navigate = (next: number) => { if (busy) return; setIndex(next); setShowSummary(false); setError(''); beep(); };
  const commit = async () => {
    if (!selected || !card || busy || transitionLock.current) return;
    transitionLock.current = true; setBusy(true); setError('');
    const updated = updateAnswer(answers, { assumptionId: card.id, choiceId: selected.id });
    try {
      const result = analysis.mode === 'live' ? await api.resolve(analysis, updated) : resolvePreview(analysis, updated);
      setAnswers(updated); setServerResolution(analysis.mode === 'live' ? result : null); setPulse(p => p + 1);
      const next = analysis.assumptions.findIndex(a => !updated.some(answer => answer.assumptionId === a.id));
      if (next < 0) { setShowSummary(true); beep('finish'); }
      else { setIndex(next); beep('confirm'); }
      setToast(selected.effect === 'revise' ? 'Regola aggiornata. Dipendenze ricalcolate.' : 'Decisione acquisita. Rotta confermata.');
    } catch (e) { setError(e instanceof Error ? e.message : 'La decisione non è stata salvata. Riprova.'); }
    finally { setBusy(false); transitionLock.current = false; }
  };
  const skip = () => {
    if (!analysis.assumptions.length) return;
    navigate((index + 1) % analysis.assumptions.length);
    if (analysis.assumptions.length === 1) setSelectedId(savedChoiceId);
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setToast('Fullscreen non disponibile in questo browser.');
    } catch { setToast('Il browser non permette il fullscreen in questa finestra.'); }
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (panel || busy || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if ((event.target as HTMLElement)?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (!showSummary && card) {
        const digit = Number(event.key) - 1;
        if (digit >= 0 && digit < card.choices.length) { event.preventDefault(); choose(card.choices[digit].id); }
        if (event.key === 'Enter' && !(event.target as HTMLElement)?.closest('button')) { event.preventDefault(); void commit(); }
        if (event.key === 'ArrowRight') { event.preventDefault(); skip(); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); navigate((index - 1 + analysis.assumptions.length) % analysis.assumptions.length); }
      }
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); void toggleFullscreen(); }
      if (event.key === '?') setPanel('help');
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  const loadDemo = () => {
    setAnalysis(demoAnalysis); setAnswers([]); setServerResolution(null); setIndex(0); setSelectedId(undefined);
    setShowSummary(false); setPanel(null); setError(''); setFormError(''); setPulse(p => p + 1);
    setDraftSpec(demoSource.spec); setDraftPlan(demoSource.plan);
    setToast('Missione demo pronta. Il comando è tuo.');
  };
  const reset = () => {
    setAnswers([]); setServerResolution(null); setIndex(0); setSelectedId(undefined); setShowSummary(!analysis.assumptions.length);
    setPanel(null); setError(''); setPulse(p => p + 1); setToast('Decisioni azzerate. Riparti da qui.');
  };
  const startLive = async () => {
    if (busy) return;
    setBusy(true); setFormError('');
    try {
      const result = await api.analyze({ spec: draftSpec.trim(), plan: draftPlan.trim(), mode: 'live' });
      const initial = await api.resolve(result, []);
      setAnalysis(result); setAnswers([]); setServerResolution(initial); setIndex(0); setSelectedId(undefined);
      setShowSummary(result.assumptions.length === 0); setPanel(null); setError(''); setPulse(p => p + 1);
      setToast(`${result.assumptions.length} decisioni individuate dal core.`);
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Analisi non riuscita. Riprova.'); }
    finally { setBusy(false); }
  };
  const copyBrief = async () => {
    try { await navigator.clipboard.writeText(resolution.briefMarkdown); setToast('Brief copiato. Pronto per il tuo agente.'); }
    catch { setPanel('brief'); setToast('Copia non disponibile. Seleziona il testo o scarica il brief.'); }
  };
  const downloadBrief = () => {
    const url = URL.createObjectURL(new Blob([resolution.briefMarkdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'specops-brief.md'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('Brief esportato. Le decisioni restano tue.');
  };
  const openTask = (id: string) => { setTaskId(id); setPanel('task'); };
  const closePanel = () => { if (!busy) setPanel(null); };

  return <div className={`app-shell ${isPreview && selected?.effect === 'revise' ? 'app-preview-revise' : ''}`}>
    <a className="skip-link" href="#decision-area">Vai alle decisioni</a>
    <header className="topbar">
      <a className="brand" href="#" aria-label="SpecOps, missione corrente" onClick={event => { event.preventDefault(); if (!busy) setShowSummary(complete); }}><span className="brand-symbol"><Hexagon size={34} weight="light" /><Crosshair size={18} weight="bold" /></span><span>spec<span className="brand-light">ops</span><small>MISSION CONTROL</small></span></a>
      <nav className="main-nav" aria-label="Navigazione principale"><button className={panel !== 'briefing' ? 'nav-active' : ''} onClick={() => setPanel(null)} disabled={busy}><Crosshair size={16} /> Missione</button><button onClick={() => setPanel('briefing')} disabled={busy}><FileText size={16} /> Briefing <span className="nav-count">2</span></button></nav>
      <div className="topbar-actions"><span className="mode-badge"><span className="signal-dot" />{analysis.mode === 'mock' ? 'SCENARIO DEMO' : 'ANALISI LIVE'}</span><span className="topbar-divider" />
        <button className="icon-button" aria-label={sound ? 'Disattiva audio' : 'Attiva audio'} aria-pressed={sound} title={sound ? 'Disattiva audio' : 'Attiva audio'} onClick={() => setSound(s => !s)}>{sound ? <SpeakerHigh size={19} /> : <SpeakerSlash size={19} />}</button>
        <button className="icon-button fullscreen-button" aria-label={fullscreen ? 'Esci da fullscreen' : 'Apri fullscreen'} title="Fullscreen · F" onClick={() => void toggleFullscreen()}>{fullscreen ? <ArrowsIn size={19} /> : <ArrowsOut size={19} />}</button>
        <button className="icon-button" aria-label="Ricomincia missione" title="Ricomincia missione" onClick={() => setPanel('reset')} disabled={busy}><ArrowCounterClockwise size={19} /></button>
      </div>
    </header>

    <main className="mission-layout">
      <section className="mission-field" aria-label="Mappa della missione">
        <div className="mission-intro"><div className="mission-location"><span className="location-square" />{analysis.mode === 'mock' ? 'OPERAZIONE / ROOM BOOKING' : 'OPERAZIONE / CUSTOM SPEC'}</div><h1>La spec è la missione.<br /><span>Le decisioni sono tue.</span></h1><p>L’agente ha tracciato una rotta.<br />Decidi quali assunzioni possono restare.</p></div>
        <div className="field-corner"><span className="mono">{String(analysis.tasks.length).padStart(2, '0')}</span><span>TASK<br />IN ORBITA</span></div>
        <OrbitalScene tasks={analysis.tasks} states={displayedStates} highlightedIds={highlightedIds} previewRevise={Boolean(isPreview && selected?.effect === 'revise')} answered={resolution.progress.answered} pulse={pulse} onTask={openTask} />
        <div className="mission-progress"><div className="progress-heading"><FlagCheckered size={15} /><span>Decisioni acquisite</span><strong>{resolution.progress.answered}<span> / {analysis.assumptions.length}</span></strong></div><div className="progress-segments">{analysis.assumptions.map((a, i) => <button key={a.id} className={`${answers.some(s => s.assumptionId === a.id) ? 'segment-complete' : ''} ${!showSummary && index === i ? 'segment-current' : ''}`} aria-label={`Apri decisione ${i + 1}: ${a.question}`} disabled={busy} onClick={() => navigate(i)} />)}</div><span className="progress-footnote">{complete ? 'Rotta definita. Brief pronto per l’agente.' : 'Ogni scelta definisce la prossima mossa.'}</span></div>
        <div className="map-legend"><span><i className="legend-dot" />Proposto</span><span><i className="legend-dot legend-amber" />Da rivalutare</span><span className="legend-action"><ArrowUpRight size={12} />Esplora i task</span></div>
      </section>

      <aside className="decision-column" id="decision-area" tabIndex={-1} aria-label="Console delle decisioni">
        <div className="console-header"><span><Command size={14} /> IL TUO TURNO</span><button onClick={() => setPanel('help')} className="help-button" aria-label="Come si gioca"><Info size={17} /></button></div>
        <div className="decision-tabs" role="group" aria-label="Decisioni della missione">{analysis.assumptions.map((a, i) => { const done = answers.some(s => s.assumptionId === a.id); return <button key={a.id} className={`${!showSummary && index === i ? 'tab-current' : ''} ${done ? 'tab-done' : ''}`} aria-label={`Decisione ${i + 1}${done ? ', risposta acquisita' : ''}: ${a.title}`} aria-pressed={!showSummary && index === i} onClick={() => navigate(i)} disabled={busy}><span>{done ? <Check size={13} weight="bold" /> : String(i + 1).padStart(2, '0')}</span>{['Accesso', 'Durata', 'Cancellazione'][analysis.mode === 'mock' ? i : -1] ?? `Scelta ${i + 1}`}</button>; })}</div>
        {showSummary || !card ? <motion.section className="summary-card" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }}>
          <div className="completion-emblem"><Hexagon size={110} weight="thin" /><ShieldCheck size={44} weight="light" /><span /></div>
          <span className="summary-status">{analysis.assumptions.length ? 'TUTTE LE DECISIONI ACQUISITE' : 'ANALISI COMPLETATA'}</span>
          <h2>{analysis.assumptions.length ? <>Missione<br /><span>chiarita.</span></> : <>Nessun bivio<br /><span>da risolvere.</span></>}</h2>
          <p>{analysis.assumptions.length ? 'Hai trasformato le assunzioni in istruzioni. Ora l’agente sa quale rotta seguire.' : 'Il core non ha rilevato assunzioni da sottoporre. Puoi consultare il brief o analizzare una nuova spec.'}</p>
          <div className="summary-stats"><div><strong>{resolution.progress.confirmed}</strong><span>Confermate</span></div><div><strong>{resolution.progress.revised}</strong><span>Modificate</span></div><div><strong>{reviewCount}</strong><span>Task da rivedere</span></div></div>
          <button className="primary-button" onClick={() => void copyBrief()}><span>Copia il brief per l’agente</span><Copy size={18} /></button>
          <button className="secondary-button" onClick={() => setPanel('brief')}>Esplora il riepilogo <ArrowUpRight size={17} /></button>
          <small className="summary-disclaimer">Le decisioni sono risolte. Il codice resta da implementare e verificare.</small>
        </motion.section> : <DecisionCard assumption={card} index={index} total={analysis.assumptions.length} selected={selected} savedChoiceId={savedChoiceId} affectedCount={highlightedIds.length} busy={busy} error={error} onSelect={choose} onCommit={() => void commit()} onSkip={skip} />}
        <div className="keyboard-hint"><Keyboard size={14} /><span><kbd>1</kbd><kbd>2</kbd> scegli</span><span><kbd>↵</kbd> conferma</span><button onClick={() => setPanel('help')}>?</button></div>
      </aside>

      <section className="task-deck" aria-label="Task e dipendenze"><div className="deck-header"><h2><GitBranch size={16} /> La catena delle conseguenze</h2><span>{isPreview ? <><span className="signal-dot" /> ANTEPRIMA DELLA SCELTA</> : 'NESSUN TASK VIENE ESEGUITO'}</span></div><div className="task-grid" style={{ '--task-count': analysis.tasks.length } as React.CSSProperties}>
        {analysis.tasks.map((task, i) => { const Icon = taskIcons[i % taskIcons.length]; const state = displayedStates.find(s => s.taskId === task.id); const warning = state?.status === 'needs_review'; const direct = Boolean(state?.directCauseIds.length); return <button key={task.id} className={`task-tile ${warning ? 'task-warning' : ''} ${highlightedIds.includes(task.id) ? 'task-linked' : ''}`} onClick={() => openTask(task.id)}><div className="task-tile-top"><span className="task-number">{String(i + 1).padStart(2, '0')}</span><Icon size={19} weight="light" /><ArrowUpRight size={14} className="task-open" /></div><h3>{task.title}</h3><div className="task-tile-bottom"><span>{warning ? <WarningCircle size={12} /> : <span className="task-state-dot" />}{warning ? 'Da rivalutare' : 'Proposto'}</span><small>{warning ? direct ? 'Impatto diretto' : 'A cascata' : task.dependsOnTaskIds.length ? `Dipende da ${task.dependsOnTaskIds.map(id => id.toUpperCase()).join(', ')}` : 'Punto di partenza'}</small></div></button>; })}
        {!analysis.tasks.length && <p className="empty-tasks">Nessun task individuato nel piano.</p>}
      </div></section>
    </main>

    <footer className="statusbar"><span><span className="status-square" />{analysis.mode === 'mock' ? 'SIMULAZIONE LOCALE' : 'CORE CONNESSO'}<span className="statusbar-note">{analysis.mode === 'mock' ? 'Nessuna chiamata AI' : 'Decisioni risolte dal core'}</span></span><p>Il codice lo scrive l’agente. <strong>La direzione la dai tu.</strong></p><button onClick={() => { setFormError(''); setPanel('source'); }} disabled={busy}><Plus size={13} /> Nuova missione</button></footer>

    <AnimatePresence>{toast && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}><CheckCircle size={17} /><span>{toast}</span><button aria-label="Chiudi notifica" onClick={() => setToast('')}><X size={14} /></button></motion.div>}</AnimatePresence>

    <Dialog open={panel !== null} onClose={closePanel} title={panel === 'source' ? 'Prepara la prossima missione' : panel === 'briefing' ? 'Il briefing della missione' : panel === 'brief' ? 'Brief per l’agente' : panel === 'task' ? inspectedTask?.title ?? 'Dettaglio task' : panel === 'reset' ? 'Ripartire da zero?' : 'Il comando è tuo'} wide={panel === 'source' || panel === 'briefing'}>
      {panel === 'source' && <form onSubmit={e => { e.preventDefault(); void startLive(); }}><p className="dialog-lead">La spec dice cosa vuoi. Il piano rivela cosa ha deciso l’agente. Il core trova le differenze.</p><div className="source-grid"><label><span><FileText size={16} /> La tua spec <small>COSA VUOI</small></span><textarea value={draftSpec} onChange={e => setDraftSpec(e.target.value)} maxLength={20000} required disabled={busy} placeholder="Descrivi il prodotto e le sue regole…" /><small>{draftSpec.length.toLocaleString('it')} / 20.000</small></label><label><span><GitBranch size={16} /> Il piano dell’agente <small>COME LO FARÀ</small></span><textarea value={draftPlan} onChange={e => setDraftPlan(e.target.value)} maxLength={20000} required disabled={busy} placeholder="Incolla il piano con i task proposti dall’agente…" /><small>{draftPlan.length.toLocaleString('it')} / 20.000</small></label></div>{formError && <p className="inline-error" role="alert"><WarningCircle size={17} />{formError}</p>}<div className="source-footer"><span><Info size={16} /> L’analisi di testi nuovi richiede il core AI.</span><button className="secondary-button" type="button" onClick={loadDemo} disabled={busy}>Carica scenario demo</button><button className="primary-button" type="submit" disabled={busy || !draftSpec.trim() || !draftPlan.trim()}>{busy ? <><CircleNotch className="spin" size={17} /> Analisi in corso…</> : <>Trova le decisioni <ArrowRight size={18} /></>}</button></div></form>}
      {panel === 'briefing' && <><p className="dialog-lead">La tua intenzione, il suo piano. Le decisioni nascoste sono lo spazio tra i due.</p><div className="briefing-grid"><section><h3><FileText size={18} /> La spec</h3><p>{analysis.source.spec}</p><span className="source-tag">INPUT DEL DEVELOPER</span></section><section><h3><GitBranch size={18} /> Il piano</h3><p>{analysis.source.plan}</p><span className="source-tag">INPUT DELL’AGENTE</span></section></div><div className="dialog-bottom"><span>{analysis.mode === 'mock' ? 'Scenario dimostrativo preparato. Non è un’analisi AI.' : 'Analisi generata dal core sui testi forniti.'}</span><button className="secondary-button" onClick={() => { setDraftSpec(analysis.source.spec); setDraftPlan(analysis.source.plan); setPanel('source'); }}>Cambia gli input <ArrowRight size={16} /></button></div></>}
      {panel === 'brief' && <><p className="dialog-lead">Consegna queste regole all’agente prima che riprenda il lavoro.</p><pre className="brief-output" tabIndex={0}>{resolution.briefMarkdown}</pre><div className="dialog-bottom"><button className="secondary-button" onClick={downloadBrief}><DownloadSimple size={17} /> Scarica .md</button><button className="primary-button" onClick={() => void copyBrief()}>Copia brief <Copy size={17} /></button></div></>}
      {panel === 'task' && inspectedTask && <><div className={`task-detail-status ${inspectedState?.status === 'needs_review' ? 'text-amber' : ''}`}>{inspectedState?.status === 'needs_review' ? <WarningCircle size={18} /> : <CircleNotch size={18} />}{inspectedState?.status === 'needs_review' ? 'Da rivalutare' : 'Task proposto'}<span>{inspectedTask.id.toUpperCase()}</span></div><blockquote>{inspectedTask.planExcerpt}</blockquote><h3 className="detail-heading">Dipendenze</h3><p className="dialog-lead">{inspectedTask.dependsOnTaskIds.length ? inspectedTask.dependsOnTaskIds.map(id => analysis.tasks.find(t => t.id === id)?.title ?? id).join(', ') : 'Nessuna. Questo task è un punto di partenza.'}</p><h3 className="detail-heading">Decisioni collegate</h3><div className="detail-decisions">{analysis.assumptions.filter(a => a.affectedTaskIds.includes(taskId) || inspectedState?.upstreamCauseIds.includes(a.id)).map(a => <button className="detail-decision" key={a.id} onClick={() => { navigate(analysis.assumptions.indexOf(a)); setPanel(null); }}><span>{a.question}</span><ArrowUpRight size={17} /></button>)}</div>{!analysis.assumptions.some(a => a.affectedTaskIds.includes(taskId) || inspectedState?.upstreamCauseIds.includes(a.id)) && <p className="dialog-lead">Nessuna decisione diretta. I cambiamenti ai task precedenti possono coinvolgerlo a cascata.</p>}<p className="dialog-notice">Questo pannello mostra le decisioni già confermate. Le anteprime non modificano il piano.</p></>}
      {panel === 'help' && <><p className="dialog-lead">Tre scelte. Una rotta più chiara. Nessuna risposta giusta o sbagliata.</p><ol className="help-steps"><li><span>01</span><div><h3>Leggi il bivio</h3><p>L’agente ha deciso qualcosa che la spec non stabiliva.</p></div></li><li><span>02</span><div><h3>Scegli la regola</h3><p>Conferma l’assunzione o cambiala. La mappa anticipa le conseguenze.</p></div></li><li><span>03</span><div><h3>Passa il comando</h3><p>Copia il brief e consegnalo al tuo agente. Puoi sempre rivedere una scelta.</p></div></li></ol><div className="shortcut-list"><span><kbd>1</kbd><kbd>2</kbd> Scegli</span><span><kbd>←</kbd><kbd>→</kbd> Cambia carta</span><span><kbd>F</kbd> Fullscreen</span><span><kbd>Esc</kbd> Chiudi finestra</span></div><button className="primary-button" onClick={closePanel}>Ci sono. Iniziamo. <Lightning size={18} /></button></>}
      {panel === 'reset' && <><p className="dialog-lead">Le risposte di questa missione verranno azzerate. La spec e il piano restano disponibili.</p><div className="dialog-bottom"><button className="secondary-button" onClick={closePanel}>Continua la missione</button><button className="primary-button" onClick={reset}>Ricomincia <ArrowCounterClockwise size={18} /></button></div></>}
    </Dialog>
  </div>;
}
