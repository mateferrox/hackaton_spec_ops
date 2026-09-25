import './style.css';
import * as api from './api.js';
import { createWallpaper } from './wallpaper.js';

(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const demo = $('#demo');
  const stage = $('#stage');
  const narrative = $('#narrative');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  let motionStopped = reduced.matches;
  let sound = false;
  let audio = null;
  let scene = 'onboarding';
  let snapshot = null;
  let selectedSpec = null;
  let mode = 'demo';
  let pendingChoice = null;
  let connectionLost = false;
  let eventSource = null;
  let detailTaskId = null;
  let busy = false;

  const escape = (value) =>
    String(value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c]);

  const warnIcon =
    '<svg class="warning-symbol" viewBox="0 0 28 28" aria-hidden="true"><path d="M14 3 26 25H2Z"/><path d="M14 10v7m0 3v1"/></svg>';

  const wallpaper = createWallpaper({
    canvas: $('#wallpaper'),
    stage,
    sakuraBranch: $('#sakura-branch'),
    getSceneState: () => scene,
    isMotionStopped: () => motionStopped,
  });
  wallpaper.start();

  function notice(text) {
    document.querySelector('.notice')?.remove();
    const node = document.createElement('div');
    node.className = 'notice';
    node.role = 'status';
    node.textContent = text;
    document.body.append(node);
    setTimeout(() => node.remove(), 3500);
  }

  function playNote(kind) {
    if (!sound) return;
    try {
      audio ??= new AudioContext();
      audio.resume();
      const freqs = kind === 'conflict' ? [185, 146] : kind === 'complete' ? [330, 440, 660] : [330, 495];
      freqs.forEach((f, i) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0, audio.currentTime + i * 0.11);
        gain.gain.linearRampToValueAtTime(0.04, audio.currentTime + i * 0.11 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + i * 0.11 + 0.4);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(audio.currentTime + i * 0.11);
        osc.stop(audio.currentTime + i * 0.11 + 0.45);
      });
    } catch {
      sound = false;
    }
  }

  function button(text, action, primary = false, key = '') {
    return `<button class="answer ${primary ? 'primary' : ''}" data-action="${action}" ${busy ? 'disabled' : ''}><span>${text}</span>${key ? `<span class="key" aria-hidden="true">${key}</span>` : ''}</button>`;
  }

  function runnerLabel() {
    if (!snapshot) return '—';
    if (snapshot.mission.mode === 'demo') return 'Simulazione';
    return snapshot.mission.runnerId || 'Runner connesso';
  }

  function mapTaskStatus(task) {
    const exec = snapshot?.mission.executionState;
    if (exec === 'paused' && (task.status === 'working' || task.status === 'paused')) return 'paused';
    if (exec === 'pause_requested' && task.status === 'working') return 'paused';
    return task.status;
  }

  function drawSteps() {
    if (!snapshot) {
      $('#steps').innerHTML = '';
      return;
    }
    const tasks = snapshot.tasks || [];
    $('#steps').innerHTML = tasks
      .map((task, i) => {
        const status = mapTaskStatus(task);
        const review = task.needsReview ? ' · da rivalutare' : '';
        return `<li><button class="step" data-status="${status}" data-task="${escape(task.id)}" aria-label="${escape(task.title)}, ${status}">
          <span class="step-no">${String(i + 1).padStart(2, '0')}</span>
          <span><span class="step-name">${escape(task.title)}</span><span class="step-status">${status}${review}</span></span>
          <i class="step-dot" aria-hidden="true"></i>
        </button></li>`;
      })
      .join('');
  }

  function deriveScene() {
    if (!snapshot) return 'onboarding';
    const m = snapshot.mission;
    if (connectionLost) return 'disconnected';
    if (m.analysisPhase === 'pending') return 'analyzing';
    if (m.analysisPhase === 'failed') return 'provider_error';
    if (m.analysisPhase === 'ready' && !m.rulesConfirmed) return 'confirm_rules';
    if (m.executionState === 'pause_requested') return 'pause_requested';
    if (m.executionState === 'paused') return 'paused';
    if (m.executionState === 'unknown') return 'pause_failed';
    if (m.executionState === 'completed') return 'complete';
    if (m.executionState === 'failed') return 'failed';
    if (pendingChoice && pendingChoice.assessment?.classification === 'conflict') return 'conflict';
    if (snapshot.visibleQuestion) return 'question';
    if (m.executionState === 'idle' && m.rulesConfirmed) return 'ready_to_start';
    if (m.executionState === 'running') return 'working';
    return 'working';
  }

  function ambientText() {
    switch (scene) {
      case 'onboarding':
        return 'Scegli una spec per iniziare.';
      case 'analyzing':
        return 'Analisi della spec in corso.';
      case 'confirm_rules':
        return 'Verifica le regole estratte.';
      case 'ready_to_start':
        return 'Pronto. Avvio esplicito richiesto.';
      case 'question':
        return 'Il lavoro scorre. Tu scegli la direzione.';
      case 'conflict':
        return 'Una decisione richiede la tua attenzione.';
      case 'pause_requested':
        return 'Pausa richiesta. In attesa del runner.';
      case 'paused':
        return 'Esecuzione in pausa. Il comando è tuo.';
      case 'pause_failed':
        return 'Pausa non confermata.';
      case 'complete':
        return 'Missione completata.';
      case 'disconnected':
        return 'Connessione persa, stato non aggiornato.';
      case 'provider_error':
        return 'Provider indisponibile.';
      default:
        return 'Il lavoro scorre. Tu scegli la direzione.';
    }
  }

  function render(focus = false) {
    scene = deriveScene();
    demo.dataset.scene = scene === 'pause_requested' ? 'paused' : scene;
    drawSteps();
    $('.project').textContent = snapshot?.mission.title || 'SpecOps';
    $('#ambient-status').textContent = ambientText();
    $('.demo-label').textContent = runnerLabel();
    const q = snapshot?.visibleQuestion;
    const totalQ =
      (snapshot?.queuedQuestions?.length || 0) +
      (q ? 1 : 0) +
      (snapshot?.activeAnswers?.length || 0);
    const answered = snapshot?.activeAnswers?.length || 0;
    $('#case-counter').textContent =
      scene === 'complete'
        ? 'fine'
        : `${String(Math.min(answered + (q ? 1 : 0), Math.max(totalQ, 1))).padStart(2, '0')} / ${String(Math.max(totalQ, 1)).padStart(2, '0')}`;

    if (scene === 'onboarding') {
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1"><span>Il giardino</span><span>delle decisioni.</span></h1><p class="story-question">Seleziona una spec già scritta. Poi esplora le regole e accompagna l’esecuzione.</p><div class="answers">${button('Scegli una spec', 'open_specs', true)}</div>`;
    } else if (scene === 'analyzing') {
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1"><span>Sto leggendo</span><span>la tua spec.</span></h1><p class="story-question">Estraggo regole esplicite, step proposti e i primi casi di prova.</p>`;
    } else if (scene === 'provider_error') {
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1"><span>Analisi non disponibile.</span></h1><p class="story-question">${escape(snapshot.mission.analysisError || 'Provider non configurato.')}</p><div class="answers">${button('Torna alle spec', 'reset', true)}${button('Riprova', 'reanalyze')}</div>`;
    } else if (scene === 'confirm_rules') {
      const rules = snapshot.rules || [];
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1"><span>Queste regole</span><span>guidano la missione.</span></h1><ol class="inline-rules">${rules.map((r) => `<li>${escape(r.statement)}</li>`).join('')}</ol><p class="advice">Nessuna regola dedotta diventa esplicita senza questa conferma.</p><div class="answers">${button('Conferma le regole', 'confirm_rules', true)}${button('Rivedi la spec', 'spec')}</div>`;
    } else if (scene === 'ready_to_start') {
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1"><span>Le regole sono ferme.</span><span>Puoi partire.</span></h1><p class="story-question">Prima dell’avvio nessuno step è working.</p><div class="answers">${button('Avvia la missione', 'start', true)}${q ? button('Prima le domande', 'show_question') : ''}</div>`;
    } else if (scene === 'question' && q) {
      const lines = q.situation.split('\n');
      const choices = q.choices
        .map((c, i) =>
          button(escape(c.label), `answer:${c.id}`, i === 0, String(i + 1)),
        )
        .join('');
      const startBtn =
        snapshot.mission.rulesConfirmed && snapshot.mission.executionState === 'idle'
          ? button('Avvia la missione', 'start')
          : '';
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1">${lines.map((l) => `<span>${escape(l)}</span>`).join('')}</h1><p class="story-question">${escape(q.prompt)}</p><div class="answers">${choices}${startBtn}</div>`;
    } else if (scene === 'conflict' && pendingChoice) {
      const evidence = pendingChoice.assessment.evidence;
      const running = snapshot.mission.executionState === 'running';
      narrative.innerHTML = `<div class="conflict-line">${warnIcon}<span>Hai scelto: «${escape(pendingChoice.label)}»</span></div><h1 class="story-title" tabindex="-1"><span>Aspetta. Questa scelta</span><span>contraddice la spec.</span></h1><p class="rule">La spec dice: <strong>«${escape(evidence?.excerpt || '')}»</strong></p><p class="advice">${escape(pendingChoice.assessment.explanation)} Conviene fermare l’esecuzione e chiarire la regola.</p><div class="answers">${running ? button('Metti in pausa', 'pause', true) : ''}${button('Resta nella spec', 'stay_aligned', !running)}${button('Rivedi la spec', 'spec')}</div>`;
    } else if (scene === 'pause_requested') {
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1"><span>Pausa richiesta.</span></h1><p class="story-question">Aspettiamo la conferma del runner. requested non è ancora paused.</p>`;
    } else if (scene === 'paused') {
      narrative.innerHTML = `<div class="conflict-line">${warnIcon}<span>Esecuzione sospesa</span></div><h1 class="story-title" tabindex="-1"><span>Anche fermarsi</span><span>è una buona decisione.</span></h1><p class="story-question">Prima chiarisci la regola. Poi riprendi con un comando esplicito.</p><div class="answers">${button('Resta nella spec e riprendi', 'resume_aligned', true)}${button('Rivedi la spec', 'spec')}${button('Solo riprendi', 'resume')}</div>`;
    } else if (scene === 'pause_failed') {
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1"><span>Pausa non confermata.</span></h1><p class="story-question">Lo stato del runner è unknown. Puoi riprovare o fermare l’agente dal suo ambiente.</p><div class="answers">${button('Riprova pausa', 'pause', true)}${button('Rivedi la spec', 'spec')}</div>`;
    } else if (scene === 'working') {
      const working = snapshot.tasks.find((t) => t.status === 'working');
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1"><span>Il giardino è quieto.</span><span>Il lavoro continua.</span></h1><p class="story-question">${working ? `Step corrente: ${escape(working.title)}` : 'In attesa del prossimo passo del runner.'}</p>`;
    } else if (scene === 'complete') {
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1"><span>Un mondo in movimento.</span><span>Una direzione chiara.</span></h1><p class="story-question">La missione del runner è conclusa. Le decisioni restano nel brief.</p><div class="answers">${button('Apri il brief', 'brief', true)}${button('Nuova missione', 'reset')}</div>`;
    } else if (scene === 'disconnected') {
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1"><span>Connessione persa.</span></h1><p class="story-question">Stato non aggiornato. Ritentativo in corso…</p>`;
    } else {
      narrative.innerHTML = `<h1 class="story-title" tabindex="-1"><span>SpecOps</span></h1><div class="answers">${button('Scegli una spec', 'open_specs', true)}</div>`;
    }

    narrative.classList.remove('enter');
    void narrative.offsetWidth;
    narrative.classList.add('enter');
    if (focus) narrative.querySelector('h1')?.focus({ preventScroll: true });
  }

  async function refreshSnapshot() {
    if (!snapshot?.mission?.id) return;
    const previousPending = pendingChoice;
    snapshot = await api.getMission(snapshot.mission.id);
    // Keep conflict chrome if the active answer on the visible question is still a conflict
    const q = snapshot.visibleQuestion;
    const conflictAnswer = snapshot.activeAnswers?.find(
      (a) =>
        a.questionId === q?.id &&
        a.assessmentSnapshot.classification === 'conflict',
    );
    if (conflictAnswer && q) {
      pendingChoice =
        q.choices.find((c) => c.id === conflictAnswer.choiceId) || previousPending;
    } else if (!conflictAnswer) {
      pendingChoice = null;
    }
    localStorage.setItem('specops.missionId', snapshot.mission.id);
    render(false);
  }

  function connectEvents() {
    if (!snapshot?.mission?.id) return;
    eventSource?.close();
    const handlers = {
      onEvent() {
        connectionLost = false;
        void refreshSnapshot();
      },
      onDisconnect() {
        connectionLost = true;
        render(false);
      },
      onReconnect() {
        void refreshSnapshot().then(() => {
          connectionLost = false;
          render(false);
        });
      },
      onSnapshotRequired() {
        void refreshSnapshot();
      },
    };
    eventSource = api.subscribeEvents(snapshot.mission.id, snapshot.lastSequence || 0, handlers);
  }

  async function pollUntilReady(missionId) {
    await new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = async () => {
        try {
          snapshot = await api.getMission(missionId);
          if (
            snapshot.mission.analysisPhase === 'ready' ||
            snapshot.mission.analysisPhase === 'failed'
          ) {
            resolve();
            return;
          }
          if (Date.now() - start > 30000) {
            reject(new Error('Analisi in timeout'));
            return;
          }
          render(false);
          setTimeout(tick, 200);
        } catch (err) {
          reject(err);
        }
      };
      void tick();
    });
  }

  async function startFromSpec(spec, selectedMode) {
    busy = true;
    render(false);
    try {
      mode = selectedMode;
      snapshot = await api.createMission({
        specId: spec.id,
        specVersion: spec.version,
        mode: selectedMode,
        runnerId: selectedMode === 'demo' ? 'demo' : undefined,
      });
      scene = 'analyzing';
      render(true);
      await pollUntilReady(snapshot.mission.id);
      connectEvents();
      pendingChoice = null;
      render(true);
    } catch (err) {
      notice(err.message || 'Impossibile creare la missione');
    } finally {
      busy = false;
      render(false);
    }
  }

  async function openSpecsDialog() {
    const dialog = $('#spec-picker');
    const list = $('#spec-list');
    list.innerHTML = '<p class="dialog-subtitle">Caricamento…</p>';
    dialog.showModal();
    try {
      const data = await api.listSpecs();
      list.innerHTML = data.specs
        .map(
          (s) => `<button class="spec-card" data-spec-id="${escape(s.id)}" data-spec-version="${s.version}">
            <strong>${escape(s.title)}</strong>
            <span>v${s.version} · ${s.characterCount} caratteri</span>
            <p>${escape(s.preview)}</p>
          </button>`,
        )
        .join('');
    } catch (err) {
      list.innerHTML = `<p class="dialog-note">${escape(err.message)}. Il catalogo spec non è raggiungibile. Riprova tra poco.</p>`;
    }
  }

  async function handleAction(name) {
    if (busy && name !== 'spec') return;
    if (name === 'open_specs') {
      await openSpecsDialog();
      return;
    }
    if (name === 'spec') {
      openSpecDialog();
      return;
    }
    if (name === 'reset') {
      eventSource?.close();
      localStorage.removeItem('specops.missionId');
      snapshot = null;
      pendingChoice = null;
      selectedSpec = null;
      scene = 'onboarding';
      render(true);
      return;
    }
    if (name === 'confirm_rules') {
      busy = true;
      try {
        snapshot = await api.confirmRules(snapshot.mission.id, {
          specVersion: snapshot.mission.specVersion,
          rules: snapshot.rules,
        });
        wallpaper.pulse();
        playNote('aligned');
        render(true);
      } catch (err) {
        notice(err.message);
      } finally {
        busy = false;
        render(false);
      }
      return;
    }
    if (name === 'start') {
      busy = true;
      try {
        snapshot = await api.startMission(snapshot.mission.id);
        wallpaper.pulse();
        render(true);
      } catch (err) {
        notice(err.message);
      } finally {
        busy = false;
        render(false);
      }
      return;
    }
    if (name === 'show_question') {
      render(true);
      return;
    }
    if (name.startsWith('answer:')) {
      const choiceId = name.slice(7);
      const q = snapshot.visibleQuestion;
      const choice = q?.choices.find((c) => c.id === choiceId);
      if (!choice) return;
      busy = true;
      try {
        const result = await api.answerMission(snapshot.mission.id, {
          questionId: q.id,
          choiceId,
          specVersion: snapshot.mission.specVersion,
          idempotencyKey: api.newIdempotencyKey('ans'),
        });
        snapshot = result.snapshot;
        if (choice.assessment.classification === 'conflict') {
          pendingChoice = choice;
          playNote('conflict');
        } else {
          pendingChoice = null;
          playNote('aligned');
        }
        wallpaper.pulse();
        render(true);
      } catch (err) {
        notice(err.message);
        if (err.code === 'STALE_SPEC') await refreshSnapshot();
      } finally {
        busy = false;
        render(false);
      }
      return;
    }
    if (name === 'stay_aligned') {
      // Conflict already recorded; aligned correction is a new answer on the *current* visible question if any,
      // otherwise clear local conflict chrome and leave the recorded conflict for brief/start gating.
      pendingChoice = null;
      const q = snapshot.visibleQuestion;
      const aligned = q?.choices.find((c) => c.assessment.classification === 'aligned');
      if (aligned) await submitAnswer(aligned.id);
      else render(true);
      return;
    }
    if (name === 'pause') {
      busy = true;
      try {
        await api.controlMission(snapshot.mission.id, {
          kind: 'pause',
          idempotencyKey: api.newIdempotencyKey('pause'),
        });
        await refreshSnapshot();
        // If conflict pending, still submit after requesting pause? Spec: pause is separate.
        // Keep conflict visible until stay_aligned or resume path.
        render(true);
      } catch (err) {
        notice(err.message);
        await refreshSnapshot();
      } finally {
        busy = false;
        render(false);
      }
      return;
    }
    if (name === 'resume' || name === 'resume_aligned') {
      busy = true;
      try {
        if (name === 'resume_aligned' && snapshot.visibleQuestion) {
          const aligned = snapshot.visibleQuestion.choices.find(
            (c) => c.assessment.classification === 'aligned',
          );
          if (aligned) await submitAnswer(aligned.id, true);
        }
        await api.controlMission(snapshot.mission.id, {
          kind: 'resume',
          idempotencyKey: api.newIdempotencyKey('resume'),
        });
        pendingChoice = null;
        await refreshSnapshot();
      } catch (err) {
        notice(err.message);
      } finally {
        busy = false;
        render(true);
      }
      return;
    }
    if (name === 'reanalyze') {
      busy = true;
      try {
        snapshot = await api.reanalyze(snapshot.mission.id);
        await pollUntilReady(snapshot.mission.id);
        render(true);
      } catch (err) {
        notice(err.message);
      } finally {
        busy = false;
        render(false);
      }
      return;
    }
    if (name === 'brief') {
      try {
        const brief = await api.getBrief(snapshot.mission.id);
        $('#brief-body').textContent = brief.markdown;
        $('#brief-dialog').showModal();
      } catch (err) {
        notice(err.message);
      }
    }
  }

  async function submitAnswer(choiceId, skipRender) {
    const q = snapshot.visibleQuestion;
    if (!q) return;
    busy = true;
    try {
      const result = await api.answerMission(snapshot.mission.id, {
        questionId: q.id,
        choiceId,
        specVersion: snapshot.mission.specVersion,
        idempotencyKey: api.newIdempotencyKey('ans'),
      });
      snapshot = result.snapshot;
      pendingChoice = null;
      wallpaper.pulse();
      playNote('aligned');
      if (!skipRender) render(true);
    } catch (err) {
      notice(err.message);
      if (err.code === 'STALE_SPEC') await refreshSnapshot();
    } finally {
      busy = false;
      render(false);
    }
  }

  function openSpecDialog() {
    const dialog = $('#spec-dialog');
    const rules = snapshot?.rules?.length
      ? snapshot.rules
      : [];
    $('#spec-title').textContent = snapshot
      ? `${snapshot.mission.title} · v${snapshot.mission.specVersion}`
      : 'La spec in vigore.';
    $('.dialog-subtitle').textContent = snapshot?.activeSpec?.text?.slice(0, 220) || '';
    $('.spec-rules').innerHTML = rules.map((r) => `<li>${escape(r.statement)}</li>`).join('') || '<li>Nessuna regola confermata.</li>';
    dialog.showModal();
  }

  narrative.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (b) void handleAction(b.dataset.action);
  });

  $('#steps').addEventListener('click', (e) => {
    const b = e.target.closest('[data-task]');
    if (!b || !snapshot) return;
    const task = snapshot.tasks.find((t) => t.id === b.dataset.task);
    if (!task) return;
    detailTaskId = task.id;
    const rules = snapshot.rules.filter((r) => task.relevantRuleIds.includes(r.id));
    $('#task-detail-title').textContent = task.title;
    $('#task-detail-body').innerHTML = `
      <p><strong>Stato:</strong> ${escape(mapTaskStatus(task))}${task.needsReview ? ' (da rivalutare)' : ''}</p>
      <p>${escape(task.description)}</p>
      <p><strong>Dipendenze:</strong> ${task.dependsOnTaskIds.length ? task.dependsOnTaskIds.join(', ') : 'nessuna'}</p>
      <p><strong>Regole:</strong></p>
      <ul>${rules.map((r) => `<li>${escape(r.statement)}</li>`).join('') || '<li>nessuna</li>'}</ul>
      <p><strong>Evidenze:</strong> ${task.evidenceRefs.length ? task.evidenceRefs.join(', ') : '—'}</p>`;
    $('#task-dialog').showModal();
  });

  $('#open-spec').onclick = () => openSpecDialog();
  $('#close-spec').onclick = () => $('#spec-dialog').close();
  $('#close-picker').onclick = () => $('#spec-picker').close();
  $('#close-task').onclick = () => $('#task-dialog').close();
  $('#close-brief').onclick = () => $('#brief-dialog').close();

  $('#spec-list').addEventListener('click', (e) => {
    const card = e.target.closest('[data-spec-id]');
    if (!card) return;
    selectedSpec = {
      id: card.dataset.specId,
      version: Number(card.dataset.specVersion),
      title: card.querySelector('strong')?.textContent || 'Spec',
    };
    $('#spec-picker').close();
    $('#mode-dialog').showModal();
  });

  $('#mode-demo').onclick = () => {
    $('#mode-dialog').close();
    if (selectedSpec) void startFromSpec(selectedSpec, 'demo');
  };
  $('#mode-connected').onclick = () => {
    $('#mode-dialog').close();
    if (selectedSpec) void startFromSpec(selectedSpec, 'connected');
  };
  $('#close-mode').onclick = () => $('#mode-dialog').close();

  $('#import-spec').onclick = async () => {
    const title = $('#import-title').value.trim() || 'Spec importata';
    const text = $('#import-text').value.trim();
    if (!text) {
      notice('Incolla il testo della spec.');
      return;
    }
    try {
      const doc = await api.importSpec(title, text);
      selectedSpec = { id: doc.id, version: doc.version, title: doc.title };
      $('#spec-picker').close();
      $('#mode-dialog').showModal();
    } catch (err) {
      notice(err.message);
    }
  };

  $('#motion-toggle').onclick = () => {
    motionStopped = !motionStopped;
    localStorage.setItem('specops.motionStopped', String(motionStopped));
    $('#motion-toggle').setAttribute('aria-pressed', String(motionStopped));
    $('#motion-toggle').setAttribute('aria-label', motionStopped ? 'Riprendi animazione' : 'Ferma animazione');
    $('#motion-label').textContent = motionStopped ? 'Riprendi movimento' : 'Ferma movimento';
  };
  $('#sound-toggle').onclick = () => {
    sound = !sound;
    localStorage.setItem('specops.sound', String(sound));
    $('#sound-label').textContent = sound ? 'Suono on' : 'Suono off';
    $('#sound-toggle').setAttribute('aria-label', sound ? 'Disattiva suoni' : 'Attiva suoni');
    $('#sound-toggle').setAttribute('aria-pressed', String(sound));
    if (sound) playNote('aligned');
  };
  $('#fullscreen').onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else notice('Schermo intero non disponibile in questo browser.');
    } catch {
      notice('Il browser non consente lo schermo intero in questa finestra.');
    }
  };

  document.addEventListener('keydown', (e) => {
    if ($('#spec-dialog').open || $('#spec-picker').open || $('#mode-dialog').open || e.altKey || e.ctrlKey || e.metaKey || e.repeat)
      return;
    if (scene === 'question' && ['1', '2', '3'].includes(e.key)) {
      const q = snapshot?.visibleQuestion;
      const choice = q?.choices[Number(e.key) - 1];
      if (choice) {
        e.preventDefault();
        void handleAction(`answer:${choice.id}`);
      }
    }
    if (e.key.toLowerCase() === 'f') $('#fullscreen').click();
  });

  reduced.addEventListener('change', () => {
    motionStopped = reduced.matches;
    $('#motion-label').textContent = motionStopped ? 'Riprendi movimento' : 'Ferma movimento';
  });
  if (localStorage.getItem('specops.motionStopped') === 'true') motionStopped = true;
  if (localStorage.getItem('specops.sound') === 'true') sound = true;
  if (motionStopped) {
    $('#motion-label').textContent = 'Riprendi movimento';
    $('#motion-toggle').setAttribute('aria-pressed', 'true');
  }

  async function restore() {
    const id = localStorage.getItem('specops.missionId');
    if (!id) {
      render(false);
      return;
    }
    try {
      snapshot = await api.getMission(id);
      connectEvents();
      render(false);
    } catch {
      localStorage.removeItem('specops.missionId');
      render(false);
    }
  }

  void restore();
})();
