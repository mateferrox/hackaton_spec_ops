# SpecOps — specifica completa per Grok

Data: 25 settembre 2026. Questa specifica sostituisce le proposte grafiche precedenti. Il contratto core del primo prototipo resta valido solo per gli endpoint legacy.

## 1. Incarico

Trasformare la demo zen già funzionante nella home in un prodotto che accompagna l'esecuzione di una spec: parte dalla selezione di una spec già generata dall'utente, ricava ipotesi e domande mediante LLM, mostra gli step reali, riconosce risposte in conflitto con le regole e permette al developer di chiedere la pausa dell'agente.

Aggiornamento del brief: la spec è l'unico input obbligatorio. Il prodotto non genera la spec iniziale e non richiede di incollare anche un piano. Il flusso dettagliato di preflight proposto qui sotto deve essere confermato con l'utente prima di implementarlo; la demo attuale rimane una missione già caricata.

Implementare per milestone verificabili, nell'ordine indicato in fondo. La prima consegna deve già essere usabile dall'inizio alla fine. Non ridisegnare la home: l'utente ha approvato questa versione dopo aver rifiutato un'interfaccia da dashboard.

## 2. Base esistente: leggere prima di modificare

- `index.html`: home attiva.
- `src/zen/main.js`: simulazione, domande e wallpaper Canvas.
- `src/zen/style.css`: stile approvato e responsive.
- `public/demo-assets/`: font locali e ramo di ciliegio trasparente.
- `output/demo/index.html`: prototipo autonomo; riferimento visivo, non entrypoint di produzione.
- `core/src/contracts.ts`, `core/src/http.ts`, `core/src/analyze.ts`, `core/src/resolve.ts`: core HTTP del primo prototipo.
- `core/README.md`: avvio e limiti effettivi del core.
- `docs/superpowers/specs/2026-09-25-specops-core-design.md`: contratto legacy.

La vecchia UI React/Three.js (`src/App.tsx`, `src/OrbitalScene.tsx` e componenti collegati) non è più usata dalla home. Non ripartire da quella UI. Il progetto usa Vite; la home zen è HTML/CSS/JavaScript con Canvas. È consentito suddividere il controller in moduli e tipizzarlo; non è necessario migrare framework.

Il core attuale ha un mock deterministico e un resolver. Non ha analisi AI live né controllo di agenti. La home attuale non è collegata al core. Le domande zen sono casi preparati con regole esplicite: non sono le vecchie carte delle assunzioni non specificate.

## 3. Esperienza da preservare

Sidebar sottile, wallpaper a tutto spazio restante, una domanda alla volta nel paesaggio. Nessuna griglia di card, cruscotto di metriche, feed di log persistente o barra strumenti ingombrante.

### Sidebar

- Nome della missione e step della spec.
- Stati testuali `pending`, `working`, `done`, `paused`, `blocked`, `failed`; colore sempre accompagnato dal testo.
- Lo stato deve derivare dal runner, non da un timer del frontend.
- Una domanda risposta non rende automaticamente un task `done`.
- Un click su uno step apre un dettaglio leggero: cosa sta facendo, regole coinvolte, dipendenze, evidenze disponibili.
- In basso accesso alla spec e indicazione inequivocabile `Simulazione` oppure identità del runner connesso.

### Wallpaper

Conservare fondo avorio, verdi profondi, sabbia rastrellata, ciottoli, sakura e petali lenti. Il movimento resta secondario alla lettura; i fiori non devono coprire testo e controlli. Quando la missione è realmente in pausa, fermare il movimento ambientale. Il pulsante “Ferma movimento” controlla invece solo il wallpaper: non mette in pausa il runner.

Il vermiglio serve a segnalare il conflitto. Non trasformare tutta la pagina in un allarme rosso. Rispettare `prefers-reduced-motion`, sospendere il rendering quando la pagina è nascosta e mantenere i controlli accessibili da tastiera.

### Domande

Il sistema traduce una regola in una situazione di prodotto, con una persona e una conseguenza comprensibile. Esempio: “Giulia è arrivata. Ma non ha un account. La lasci prenotare lo stesso?”. Due o tre risposte concrete. Non interrogare su dettagli tecnici che il developer può verificare meglio nel codice.

Le domande appaiono mentre il runner lavora. Non generare domande continue: una visibile, al massimo tre in coda. Dare priorità alle decisioni che influenzano task attivi o prossimi. Se non ci sono domande, lasciare visibile il paesaggio e una sola frase sullo step corrente.

### Risposta fuori spec

Mostrare nello stesso spazio narrativo:

1. La risposta selezionata.
2. “Questa scelta contraddice la spec” solo quando il conflitto è sostenuto da una regola esplicita.
3. Citazione esatta della regola, sua posizione e versione.
4. Conseguenza concreta e task potenzialmente coinvolti.
5. “Conviene fermare l’esecuzione e chiarire la regola”.

Azioni: **Metti in pausa**, **Resta nella spec**, **Rivedi la spec**. La seconda registra la scelta aderente e risolve il conflitto; non deve riprendere un runner già fermato senza un comando esplicito “Resta nella spec e riprendi”.

La pausa non è un effetto grafico: vedere il protocollo della sezione 8.

## 4. Input e avvio missione

La schermata iniziale permette di selezionare una spec prodotta dall'utente. Mostra titolo, versione e un'anteprima, con azione “Esplora questa spec”. Il collegamento alla fonte delle spec (file caricati, cartella del progetto o servizio esterno) è una decisione di integrazione da concordare; mantenere l'interfaccia di selezione indipendente dalla fonte. Per lo sviluppo usare una libreria locale con le spec demo e import esplicito di testo/Markdown.

Dopo la selezione, raccogliere solo la modalità `demo` o `connected` e, quando necessario, il runner configurato. Titolo e testo derivano dalla spec scelta. Il piano del runner, se già disponibile, arricchisce l'analisi ma non è un campo obbligatorio per l'utente.

Limiti iniziali: 20.000 caratteri per testo, 30 task per missione, massimo 3 scelte per domanda. Rifiutare input vuoti, JSON malformati e payload oltre 256 KB. Gli input non vengono inviati a un provider durante la navigazione della demo; nella modalità AI la selezione indica il provider configurato prima dell'analisi.

L'LLM legge la spec ed estrae regole esplicite, step proposti, punti non definiti e scenari di prova. Gli step proposti dall'LLM non sono ancora task in esecuzione. Con un piano del runner disponibile, riconciliare i due senza alterare silenziosamente il piano reale.

Flusso proposto: selezione → analisi → 2–3 domande sui punti più rischiosi → conferma regole → avvio esplicito → domande contestuali durante il lavoro. Prima dell'avvio la sidebar mostra pending, non working. Un conflitto nel preflight propone di chiarire prima di avviare; non offre di fermare un agente che non è partito.

Il developer verifica una breve lista delle regole estratte e conferma. Nessuna regola dedotta diventa esplicita senza una fonte o questa conferma, registrata nell'audit. Una risposta su un punto unspecified propone un'integrazione della spec; soltanto la conferma del developer la salva come nuova regola/versione.

La spec originaria resta disponibile. Ogni salvataggio successivo crea una versione; non sovrascrivere le versioni precedenti.

## 5. Modello dati

Usare ID stabili, timestamp ISO UTC, versioni intere crescenti. Persistenza SQLite in `core/data/`, esclusa da Git. Migrazioni versionate e transazioni per risposte, conflitti, comandi ed eventi. Non serve autenticazione multiutente per la prima versione locale; ascoltare su loopback. Un'esposizione remota richiede una scelta esplicita di accesso e autenticazione.

Entità minime:

- **Mission**: id, title, mode, specVersion, runnerId opzionale, executionState, createdAt, updatedAt.
- **SpecVersion**: missionId, version, text, confirmedRules, createdAt.
- **Rule**: id, statement, origin (`explicit` o `developer_confirmed`), sourceExcerpt, sourceStart, sourceEnd. Gli offset sono indici UTF-16, fine esclusa, coerenti con `String.slice` del testo esatto memorizzato.
- **Task**: id, missionId, title, description, dependsOnTaskIds, relevantRuleIds, runnerTaskId opzionale, status, evidenceRefs.
- **Question**: id, missionId, specVersion, taskIds, ruleIds, situation, prompt, choices, state (`queued`, `visible`, `answered`, `stale`), deduplicationKey.
- **Choice**: id, label, proposedRule, assessment. L'assessment è assegnato e validato lato server, non inviato dal browser come verità.
- **Assessment**: classification (`aligned`, `conflict`, `unspecified`, `uncertain`), explanation, evidence (ruleId + excerpt esatto), affectedTaskIds.
- **Answer**: id, missionId, questionId, specVersion, choiceId, assessmentSnapshot, createdAt. Immutabile; una correzione crea un nuovo evento che sostituisce la risposta attiva.
- **ControlCommand**: id, missionId, kind (`pause`, `resume`), requestedAt, status (`requested`, `acknowledged`, `failed`, `timed_out`), acknowledgedAt opzionale, runnerMessage.
- **Event**: missionId, sequence, type, timestamp, payload. Sequence cresce per missione; serve al recupero SSE.

Stati esecuzione: `idle`, `running`, `pause_requested`, `paused`, `resume_requested`, `completed`, `failed`, `unknown`. `unknown` significa che manca una conferma affidabile dello stato, non che il runner sia fermo.

Le dipendenze task devono essere un DAG: validare ID, riferimenti, unicità e assenza di cicli. Non inventare dipendenze per rendere più ricco il wallpaper.

## 6. Regole, assunzioni e conflitti

La distinzione fondamentale è questa:

| Spec e risposta | Classificazione | Comportamento |
| --- | --- | --- |
| Spec: “solo utenti registrati”; risposta: “consenti ospiti” | conflict | Cita la regola e raccomanda pausa |
| Spec: “solo utenti registrati”; risposta: “richiedi accesso” | aligned | Registra conferma |
| Spec: “gli utenti prenotano”; risposta: “consenti ospiti” | unspecified | Chiedi di formalizzare la scelta, senza dichiarare violazione |
| Spec ambigua o due regole incompatibili | uncertain | Chiedi chiarimento; niente certezza inventata |

Per le regole strutturate e confermate, usare confronti deterministici ove possibile. Per testo libero usare un modello, conservando la classificazione `uncertain` quando non basta l'evidenza.

Validare ogni citazione come sottostringa esatta della versione indicata e verificare che gli ID siano noti. Una citazione reale ma non pertinente non prova la contraddizione: il prompt richiede la relazione precisa tra regola e scelta, e l'UI la rende contestabile. Non dichiarare infallibile il giudizio del modello.

Ogni domanda e risposta è legata a una specVersion. Se la versione è cambiata, rispondere 409 `STALE_SPEC`, segnare la domanda stale e rigenerarla prima di accettare un'altra risposta.

Un conflitto influenza direttamente i task indicati dall'assessment; il resolver propaga la necessità di revisione sui task che dipendono da loro. Un task già completato diventa “da rivalutare” come attributo separato, senza falsificarne lo stato di esecuzione. Non cancellare lavoro o riavviare task automaticamente.

## 7. Analisi e generazione AI

Introdurre un adapter provider lato server, configurabile tramite ambiente. Prima di usare un account reale, ottenere dall'utente la scelta del provider e l'autorizzazione a usare le credenziali. Mai chiavi nel frontend o nei documenti. Nessuna chiamata a pagamento nei test.

Pipeline:

1. Analisi iniziale della spec selezionata: regole, step proposti e ipotesi con evidenza esatta. Il piano è facoltativo e può arrivare dal runner. Un'unica chiamata strutturata ove possibile.
2. Dopo conferma delle regole, generazione di un primo gruppo di massimo tre domande su task rilevanti.
3. Agli eventi rilevanti del runner, creare una nuova domanda solo se è emersa una decisione non già coperta. Non generare a ogni chunk di log.
4. Le scelte già valutate hanno assessment persistito: il click non richiede un'altra chiamata AI. Eventuale risposta libera resta fuori dalla prima versione.

Trattare spec, piano, log e output degli agenti come dati non fidati. Le istruzioni in quei testi non possono cambiare prompt di sistema, leggere segreti, eseguire comandi o autorizzare operazioni.

Schema JSON validato sul server. Timeout 25 secondi; massimo un retry per errori temporanei, con jitter, mai per input invalidi o quota esaurita. Se il modello fallisce, mostrare errore e consentire retry; non sostituire silenziosamente dati reali con fixture.

La modalità demo deve restare disponibile senza chiavi o rete. Il provider non configurato restituisce un errore esplicito, non un output inventato.

## 8. Runner e pausa reale

Separare il dominio da un `AgentAdapter` con metodi `getCapabilities`, `getSnapshot`, `subscribe`, `requestPause(commandId)` e `requestResume(commandId)`. Capability almeno: observe, pause, resume, dispatchControl.

Implementare due adapter:

- **DemoAdapter**: eventi e casi preparati; sempre etichettato simulazione. Pausa effettivamente timer, progressione e wallpaper.
- **HttpRunnerAdapter**: si collega a un runner compatibile configurato lato server. Usa snapshot, eventi e comandi HTTP autenticati. Includere un reference runner controllabile e una guida per collegare un agente reale. Un endpoint inventato non costituisce un'integrazione con Grok, Codex o altri prodotti: non dichiararla disponibile senza averla verificata.

Contratto minimo del runner:

- `GET /snapshot`: executionState, taskStates, lastSequence, capabilities.
- `GET /events`: SSE con sequence e snapshot coerenti.
- `POST /commands`: `{ commandId, kind: "pause" | "resume" }`, accettazione 202. Lo stesso commandId non esegue due volte il comando.
- Un successivo evento `command.acknowledged` contiene commandId e stato reale raggiunto. `paused` è valido solo quando il runner ha fermato il dispatch e il task corrente ha raggiunto un punto di arresto sicuro.
- `command.failed` contiene un motivo utilizzabile dall'utente.

Click “Metti in pausa”:

1. Verificare capability e stato. Senza supporto: mostrare “Controllo pausa non disponibile: ferma l’agente dal suo ambiente”. Non mostrare paused.
2. Persistire commandId e passare a `pause_requested`; UI “Pausa richiesta”.
3. Chiamare l'adapter. Non bloccare l'event loop.
4. Solo alla conferma del runner passare a `paused` e congelare il wallpaper.
5. Dopo 15 secondi senza conferma: comando `timed_out`, executionState `unknown`, messaggio “Pausa non confermata”. Un ack tardivo resta gestibile tramite il suo commandId.
6. Un errore o una disconnessione non equivale a una pausa.

Resume segue lo stesso protocollo. Non riprendere se la spec è cambiata e il piano non è stato riallineato. Il reference runner deve dimostrare che, dopo l'ack di pausa, non parte altro lavoro e che resume riprende una sola volta.

Quando emerge un conflitto, bloccare il dispatch dei task dipendenti solo se l'adapter controlla il dispatch. Un task esterno già in esecuzione rimane working finché il runner non comunica altro. Dichiarare il limite se il dispatch è esterno; non rappresentare come sospesi task che continuano.

## 9. API dell'applicazione

Conservare `/api/demo`, `/api/analyze`, `/api/resolve` del core legacy. Le nuove funzionalità usano `/api/v2`:

- `GET /api/v2/specs`: libreria delle spec selezionabili, con id, titolo, versione e anteprima. Il client non invia percorsi filesystem arbitrari.
- `POST /api/v2/missions`: `{ specId, specVersion, mode, runnerId? }` → 201 missione creata con analisi `pending`; risolvere lato server testo e titolo della spec. L'eventuale piano viene ottenuto dal runner. Analisi completata notificata tramite evento.
- `GET /api/v2/missions/:id`: snapshot completo di spec attiva, regole, task, domanda visibile, coda, risposte attive, stato esecuzione, capabilities e lastSequence.
- `GET /api/v2/missions/:id/events`: SSE; supportare Last-Event-ID e replay da sequence persistita. Se il replay non è disponibile, inviare `snapshot.required`.
- `POST /api/v2/missions/:id/confirm-rules`: `{ specVersion, rules }`, con verifica di provenienza. Sblocca l'avvio autorizzato della missione.
- `POST /api/v2/missions/:id/start`: avvio esplicito dopo conferma della versione/regole e risoluzione dei conflitti bloccanti. Se il runner non supporta l'avvio, indicare che va avviato nel suo ambiente e attendere un evento reale prima di mostrare working.
- `POST /api/v2/missions/:id/answers`: `{ questionId, choiceId, specVersion, idempotencyKey }` → risposta persistita, assessment e impatti. L'assessment del client, se presente, viene ignorato/rifiutato.
- `POST /api/v2/missions/:id/control`: `{ kind, idempotencyKey }` → 202 `{ commandId, status: "requested" }` oppure errore esplicito di capability/stato.
- `PUT /api/v2/missions/:id/spec`: `{ baseVersion, text, changeReason }` → nuova versione. Richiede missione idle/paused; concorrenza ottimistica, 409 se baseVersion vecchia.
- `POST /api/v2/missions/:id/reanalyze`: riallinea regole, piano e domande alla nuova spec; non riprende il runner.
- `GET /api/v2/missions/:id/brief`: Markdown con regole, decisioni, conflitti aperti, task da rivedere e versione della spec.

Formato errori coerente: `{ error: { code, message, retryable } }`. Codici almeno INVALID_INPUT, STALE_SPEC, CAPABILITY_UNAVAILABLE, INVALID_STATE, PROVIDER_NOT_CONFIGURED, PROVIDER_ERROR, ANALYSIS_TIMEOUT, RUNNER_UNREACHABLE, COMMAND_TIMEOUT.

Validare sul server ogni input e ogni risposta del provider. Deduplicare idempotencyKey per missione/tipo operazione, conservando anche l'hash del payload; chiave riusata con payload diverso → 409. Retry della stessa richiesta restituisce l'esito precedente.

CORS per gli origin locali esistenti, oppure proxy Vite same-origin. Nessun wildcard con credenziali. Configurazione del runner solo lato server: il browser non può fornire URL arbitrari a cui il core inoltri richieste.

## 10. Frontend e recupero stato

Refactoring contenuto: separare renderer wallpaper, stato missione, client API/SSE e componenti/pannelli. Non introdurre una nuova libreria grafica per sostituire il canvas già approvato.

Il server è autorità su spec, task, risposte e comandi. Nel browser tenere preferenze di audio/movimento e missionId, non credenziali. All'avvio caricare snapshot e aprire SSE dalla sequence dello snapshot, recuperando gli eventi eventualmente intervenuti.

SSE disconnesso: mostrare “Connessione persa, stato non aggiornato”, ritentare con backoff limitato e ricaricare snapshot alla riconnessione. Non far avanzare la sidebar con timer mentre manca il server.

Il frontend gestisce almeno: onboarding vuoto, analisi in corso, nessuna domanda, domanda pronta, risposta in invio, conflitto, pausa richiesta, pausa confermata, pausa fallita, spec stale, provider indisponibile, runner disconnesso e missione completata.

Una missione termina quando il runner completa i task, non quando terminano le domande. Durante un conflitto la sidebar rimane visibile. Apertura e chiusura dei pannelli deve preservare focus e scroll; tastiera, lettore schermo e viewport mobile restano usabili.

## 11. Verifica necessaria

- Estrazione: regole esplicite citate esattamente; testo assente non classificato come conflitto.
- Classificazioni: coprire aligned, conflict, unspecified e uncertain con fixture diverse.
- Cambi di versione: domande precedenti stale, risposte obsolete rifiutate, reanalisi senza resume automatico.
- Impatti: propagazione transitiva, inversione di una decisione senza cancellare cause indipendenti, stato esecuzione distinto dalla necessità di revisione.
- Pause: requested non è paused; ack tardivo, timeout, errore, capability assente, doppio click, retry e disconnessione. Provare che il reference runner si ferma davvero dopo l'ack.
- Persistenza: riavvio del server, refresh browser, replay SSE e nessuna duplicazione di risposte/comandi.
- AI: timeout, output invalido, citazione inventata, prompt injection e provider non configurato. Provider simulato nei test.
- Flusso browser: selezione spec → analisi e ipotesi → domande preliminari → conferma regole → avvio → task working → domanda → risposta fuori spec → evidenza → richiesta pausa → ack → modifica spec → reanalisi → resume esplicito.
- Preflight: nessun working prima dell'avvio; conflitto prima dell'avvio non simula una pausa; assenza del piano non impedisce l'analisi della spec.
- Demo offline: nessuna chiave, nessuna chiamata AI, flusso completo e reset.
- UI: home fedele alla versione approvata, controlli raggiungibili a 1366×768 e 390×844, nessun overflow orizzontale, pause/reduced motion fermano anche petali e ramo, nessun errore JS.
- Build distribuibile: asset/font locali inclusi, home funzionante da `dist/`, nessun percorso di sviluppo obbligatorio.

## 12. Ordine di consegna

**Milestone 1 — dominio e demo collegate.** Contratti v2, SQLite, mission snapshot/eventi, DemoAdapter, frontend collegato al server. Il giardino e i casi attuali restano utilizzabili. Consegna una missione persistente dall'avvio al riepilogo.

**Milestone 2 — spec vere.** Adapter AI configurato con autorizzazione, estrazione e conferma regole, domande contestuali, assessment con evidenze, versioni e brief. Il prodotto lavora su testi nuovi senza fixture nascoste.

**Milestone 3 — esecuzione controllata.** HttpRunnerAdapter, reference runner, stati working/pending reali, pausa/resume con ack, riconnessione ed errori. Collegare un agente reale quando viene fornito un runner compatibile; dichiarare esattamente cosa è stato verificato.

**Milestone 4 — consolidamento.** Test end-to-end, build, README operativo, file .env.example senza segreti, guida integrazione runner, limiti residui e screenshot della home desktop/mobile.

Non iniziare auth, billing, cloud deployment, app mobile nativa, multiutente, editor di codice, marketplace di agenti, notifiche esterne o riscrittura automatica dei repository. Non sono parte di questa consegna.

## 13. Criterio di completamento e report

Una consegna completa permette di usare una spec nuova, vedere task reali tramite il runner configurato, rispondere a un caso concreto, ricevere un avviso motivato su una contraddizione e fermare il runner con conferma verificabile, mantenendo la home zen approvata.

Se mancano provider autorizzato o runner reale, completare tutte le parti indipendenti e riportare la capacità mancante senza simularla. “Demo completa”, “analisi live completa” e “controllo agente verificato” sono tre dichiarazioni distinte.

Alla fine indicare: comandi eseguiti, test e risultato, URL locale, modalità operative, adapter verificati, configurazione necessaria e limiti. Non dichiarare un deploy pubblico sulla base del solo localhost.
