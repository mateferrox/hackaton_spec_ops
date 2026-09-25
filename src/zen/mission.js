import { DEMO_SPECS } from './scenarios.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const warning = '<svg class="warning-symbol" viewBox="0 0 28 28" aria-hidden="true"><path d="M14 3 26 25H2Z"/><path d="M14 10v7m0 3v1"/></svg>';
const button = (text, action, primary = false, key = '') => `<button class="answer ${primary ? 'primary' : ''}" data-action="${action}"><span>${escape(text)}</span>${key ? `<span class="key" aria-hidden="true">${key}</span>` : ''}</button>`;

export function createMission({ onState, onFeedback }) {
  const $ = s => document.querySelector(s);
  const narrative = $('#narrative');
  const sessions = new Map();
  let spec = null, current = 0, state = 'selection', answers = new Map(), selected = 0, timer;
  const question = () => spec?.questions[current];
  const rule = () => spec.rules[question().ruleIndex];
  const save = () => { if (spec) sessions.set(spec.id, { current, state, answers: new Map(answers), selected }); };

  function updateSpecDialog() {
    $('#spec-title').textContent = spec ? `${spec.filename} · v${spec.version}` : 'Le spec demo';
    $('.dialog-subtitle').textContent = spec?.summary ?? 'Scegli una spec per leggere le sue regole.';
    $('.spec-rules').innerHTML = spec?.rules.map(r => `<li>${escape(r)}</li>`).join('') ?? '';
    const decisions = spec ? [...answers.entries()].filter(([i, index]) => spec.questions[i].choices[index].assessment === 'unspecified') : [];
    $('#session-decisions').innerHTML = decisions.length ? `<h3>Proposte della sessione</h3><ul>${decisions.map(([i, index]) => `<li>${escape(spec.questions[i].choices[index].instruction)}</li>`).join('')}</ul><p>Da integrare nella prossima versione. La spec 1.0 non è stata modificata.</p>` : '';
  }

  function drawSteps() {
    $('.project').textContent = spec ? spec.filename : 'specs/';
    $('#open-spec').hidden = !spec;
    $('#change-spec').hidden = !spec;
    if (!spec) {
      $('#steps').innerHTML = '<li class="sidebar-empty"><span class="directory-label">2 SPEC DISPONIBILI</span><p>Seleziona un file.<br>Esplora i suoi edge case.</p><span class="demo-runtime">runtime: demo<br>generator: fixtures</span></li>';
      return;
    }
    const rows = [
      { id: '0a', title: 'Parse spec', status: 'done' },
      ...spec.questions.map((q, i) => ({ id: q.stepId, title: q.task, index: i, status: i === current && !['complete', 'verifying'].includes(state) ? (state === 'paused' ? 'paused' : 'working') : answers.has(i) ? 'done' : 'pending' })),
      { id: '4a', title: 'Review decisions', status: state === 'complete' ? 'done' : state === 'verifying' ? 'working' : 'pending' },
    ];
    $('#steps').innerHTML = rows.map(row => {
      const attrs = `class="step" data-status="${row.status}"`;
      const content = `<span class="step-no">${row.id}</span><span><span class="step-name">${escape(row.title)}</span><span class="step-status">${row.status}</span></span><i class="step-dot" aria-hidden="true"></i>`;
      return `<li>${row.index !== undefined ? `<button ${attrs} data-step="${row.index}" aria-label="${row.id} ${row.title}, ${row.status}">${content}</button>` : `<div ${attrs}>${content}</div>`}</li>`;
    }).join('');
  }

  function render(focus = false) {
    $('#demo').dataset.scene = state;
    onState(state);
    drawSteps(); updateSpecDialog();
    const q = question();
    $('#case-counter').parentElement.hidden = state === 'selection';
    $('#case-counter').textContent = spec ? `${String(state === 'complete' ? spec.questions.length : current + 1).padStart(2, '0')} / ${String(spec.questions.length).padStart(2, '0')}` : '';
    $('#ambient-status').textContent = ({ selection: 'Un giardino. Due spec da esplorare.', paused: 'Simulazione in pausa. Il comando è tuo.', conflict: 'Una decisione richiede la tua attenzione.', unspecified: 'Questa parte della spec è ancora aperta.', complete: 'Hai esplorato tutti i casi della spec.', verifying: 'Riepilogo delle decisioni in corso.' })[state] ?? 'Il lavoro scorre. Tu scegli la direzione.';
    if (state === 'selection') {
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1"><span>Scegli una spec.</span><span>Troviamo i suoi bivi.</span></h1><p class="selection-lead">Due scenari, sei casi concreti ciascuno. Quale esploriamo?</p><div class="spec-catalog">${DEMO_SPECS.map((s, i) => `<button class="spec-option" data-spec="${s.id}"><span class="spec-index">0${i + 1}</span><span class="spec-option-copy"><strong>${escape(s.title)}</strong><small>${escape(s.description)}</small></span><span class="spec-option-action">${sessions.has(s.id) ? 'Riprendi' : 'Esplora'} <span aria-hidden="true">↗</span></span></button>`).join('')}</div><p class="selection-note">Domande demo preparate. Nessuna chiamata LLM.</p>`;
    } else if (state === 'question') {
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1">${q.title.map(line => `<span>${escape(line)}</span>`).join('')}</h1><p class="story-question">${escape(q.question)}</p><div class="answers">${q.choices.map((c, i) => button(c.label, `answer-${i}`, i === 0, String(i + 1))).join('')}</div>`;
    } else if (state === 'conflict') {
      narrative.innerHTML = `<div class="conflict-line">${warning}<span>Hai scelto: «${escape(q.choices[selected].label)}»</span></div><h1 class="story-title" tabindex="-1"><span>Aspetta. Questa scelta</span><span>contraddice la spec.</span></h1><p class="rule">La spec dice: <strong>«${escape(rule())}»</strong></p><p class="advice">Conviene fermare l’esecuzione e chiarire la regola.</p><div class="answers">${button('Metti in pausa', 'pause', true)}${button('Resta nella spec', 'aligned')}<button class="subtle-link" data-action="spec">Leggi la regola</button></div>`;
    } else if (state === 'paused') {
      narrative.innerHTML = `<div class="conflict-line">${warning}<span>Simulazione sospesa · ${escape(q.stepId)} / ${escape(q.task)}</span></div><h1 class="story-title" tabindex="-1"><span>Anche fermarsi</span><span>è una buona decisione.</span></h1><p class="story-question">Prima chiarisci la regola. Poi riprendi il lavoro.</p><p class="advice">${escape(q.reason)} Nessun agente reale è stato fermato.</p><div class="answers">${button('Resta nella spec e riprendi', 'aligned', true)}${button('Rivedi la spec', 'spec')}<button class="subtle-link" data-action="reconsider">Riconsidera la risposta</button></div>`;
    } else if (state === 'unspecified') {
      narrative.innerHTML = `<div class="open-rule-label">Un punto da definire · ${escape(q.stepId)}</div><h1 class="story-title" tabindex="-1"><span>Qui la spec</span><span>lascia spazio a te.</span></h1><p class="rule">${escape(q.gap)}</p><p class="advice">Proposta: ${escape(q.choices[selected].instruction)} La registriamo nella sessione, senza modificare la spec originale.</p><div class="answers">${button('Registra la proposta', 'record', true)}${button('Cambia risposta', 'reconsider')}</div>`;
    } else if (state === 'verifying') {
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1"><span>Le risposte si collegano.</span><span>La rotta prende forma.</span></h1><p class="story-question">Raccogliamo le ${spec.questions.length} decisioni della sessione.</p>`;
    } else {
      const additions = [...answers.entries()].filter(([i, c]) => spec.questions[i].choices[c].assessment === 'unspecified').length;
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1"><span>Un mondo in movimento.</span><span>Una direzione chiara.</span></h1><p class="story-question">${answers.size} casi esplorati. ${additions} proposta da integrare nella spec.</p><p class="advice">Le decisioni della demo sono complete. Il codice resta da sviluppare e verificare.</p><div class="answers">${button('Esplora l’altra spec', 'catalog', true)}${button('Rileggi spec e decisioni', 'spec')}<button class="subtle-link" data-action="restart">Ricomincia questa missione</button></div>`;
    }
    narrative.classList.remove('enter'); void narrative.offsetWidth; narrative.classList.add('enter');
    if (focus) narrative.querySelector('h1').focus({ preventScroll: true });
  }

  function catalog() { clearTimeout(timer); if (state === 'verifying') state = 'complete'; save(); spec = null; state = 'selection'; render(true); }
  function select(id) {
    const found = DEMO_SPECS.find(s => s.id === id); if (!found) return;
    spec = found;
    const saved = sessions.get(id);
    current = saved?.current ?? 0; answers = new Map(saved?.answers); selected = saved?.selected ?? 0; state = saved?.state ?? 'question';
    render(true);
  }
  function finish(index) {
    if (index < 0) return;
    answers.set(current, index); onFeedback('aligned');
    const next = spec.questions.findIndex((_, i) => !answers.has(i));
    if (next >= 0) { current = next; state = 'question'; render(true); }
    else { state = 'verifying'; render(true); timer = setTimeout(() => { state = 'complete'; onFeedback('complete'); render(true); save(); }, 1000); }
  }
  function action(name) {
    if (name === 'spec' && spec) { updateSpecDialog(); $('#spec-dialog').showModal(); return; }
    if (name === 'catalog') { catalog(); return; }
    if (name === 'restart' && spec) { clearTimeout(timer); current = 0; answers.clear(); state = 'question'; selected = 0; render(true); save(); return; }
    if (!spec || state === 'verifying') return;
    if (name.startsWith('answer-') && state === 'question') {
      selected = Number(name.slice(7)); const c = question().choices[selected]; if (!c) return;
      if (c.assessment === 'aligned') finish(selected);
      else { state = c.assessment === 'conflict' ? 'conflict' : 'unspecified'; onFeedback(c.assessment); render(true); }
    } else if (name === 'pause' && state === 'conflict') { state = 'paused'; render(true); }
    else if (name === 'reconsider' && ['paused', 'unspecified'].includes(state)) { state = 'question'; render(true); }
    else if (name === 'aligned' && ['conflict', 'paused'].includes(state)) finish(question().choices.findIndex(c => c.assessment === 'aligned'));
    else if (name === 'record' && state === 'unspecified') finish(selected);
  }
  narrative.addEventListener('click', e => {
    const pick = e.target.closest('[data-spec]'); if (pick) { select(pick.dataset.spec); return; }
    const a = e.target.closest('[data-action]'); if (a) action(a.dataset.action);
  });
  $('#steps').addEventListener('click', e => {
    const b = e.target.closest('[data-step]'); if (!b || ['paused', 'conflict', 'unspecified'].includes(state)) return;
    clearTimeout(timer); current = Number(b.dataset.step); state = 'question'; render(true);
  });
  $('#change-spec').onclick = catalog;
  $('#open-spec').onclick = () => action('spec');
  $('#close-spec').onclick = () => $('#spec-dialog').close();
  $('#spec-dialog').addEventListener('click', e => { if (e.target === $('#spec-dialog')) $('#spec-dialog').close(); });
  document.addEventListener('keydown', e => {
    if ($('#spec-dialog').open || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    if (state === 'question' && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); action(`answer-${Number(e.key) - 1}`); }
  });
  render();
  return { get state() { return state; } };
}
