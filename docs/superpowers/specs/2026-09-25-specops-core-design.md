# SpecOps — specifica del core per la demo

Data: 25 settembre 2026. Destinatario: agente incaricato di implementare il core.

## Obiettivo e confini

Realizzare il motore di una demo in cui un developer incolla una spec e il piano di un agente, scopre le decisioni implicite e risponde a un breve quiz per confermarle o cambiarle.

Il frontend sarà sviluppato separatamente come esperienza fullscreen, animata e simile a un gioco. Il core deve fornire dati per carte, connessioni e conseguenze delle risposte, senza occuparsi della rappresentazione grafica.

Budget complessivo del progetto: due ore. Privilegiare un percorso completo e affidabile. Nessun database, autenticazione, lettura di repository, modifica di codice, orchestrazione di agenti o esecuzione di task. Una decisione cambiata produce istruzioni e task da rivalutare: non cancella lavoro reale.

## Consegna e proprietà dei file

- Implementare esclusivamente sotto `core/`, incluso il relativo package.json e lockfile. Il repository iniziale è vuoto.
- Non creare o modificare il frontend né configurazioni nella root: un altro agente lavorerà lì.
- Usare TypeScript, un servizio HTTP indipendente sulla porta 3001 e funzioni di dominio importabili e testabili. Scegliere il minimo necessario di dipendenze.
- Comandi richiesti da `core/`: `npm install`, `npm run dev`, `npm test`, `npm run build`.
- Esportare il contratto da `core/src/contracts.ts` senza dipendenze runtime, così il frontend può importarne i tipi.
- Fornire `core/README.md` con avvio, esempi HTTP e configurazione delle modalità.
- In caso di dubbi, mantenere questo contratto e documentare la scelta. Non ampliare il prodotto.

## Flusso blackbox

1. Input: testo della spec + testo del piano.
2. Analisi: estrazione dei task e di massimo tre assunzioni rilevanti.
3. Output: carte con domanda, alternative e collegamenti ai task direttamente interessati.
4. Il developer seleziona una risposta per carta, in qualsiasi ordine.
5. Risoluzione deterministica: aggiornamento dei task interessati e generazione delle istruzioni per l'agente.

La generazione usa al massimo una chiamata al modello per analisi. Le risposte del developer non richiedono altre chiamate AI.

## Due modalità esplicite

### Mock — obbligatoria, prima consegna

Funziona senza chiavi, rete o provider. Restituisce sempre lo scenario preparato riportato in fondo, con gli stessi ID e lo stesso ordine.

Il mock accetta solo i testi della fixture, dopo normalizzazione degli spazi. Per altri input restituisce `MOCK_INPUT_MISMATCH`, invitando a caricare lo scenario demo. Non fingere di analizzare testo arbitrario.

Non aggiungere ritardi artificiali nel core. Le animazioni e i tempi della narrazione appartengono al frontend.

### Live — seconda priorità

Analizza gli input reali attraverso un adapter lato server. Configurazione provider, modello e credenziali solo via ambiente; mai nel browser o nelle risposte API. Documentare i nomi delle variabili scelti. Non leggere o riutilizzare credenziali personali senza autorizzazione.

Se il provider non è configurato, rispondere con `LIVE_NOT_CONFIGURED`. Nessun ripiego silenzioso sul mock. Se il tempo non basta, consegnare il mock completo e dichiarare che il live non è implementato: non simularne il funzionamento.

## Contratto TypeScript

Queste forme JSON sono il contratto condiviso. Non rinominare i campi senza coordinarsi con l'agente frontend.

```ts
export type Mode = "mock" | "live";

export interface AnalyzeRequest {
  spec: string;
  plan: string;
  mode: Mode;
}

export interface Task {
  id: string;
  title: string;
  planExcerpt: string;
  dependsOnTaskIds: string[];
}

export interface Choice {
  id: string;
  label: string;
  instruction: string;
  effect: "confirm" | "revise";
}

export interface Assumption {
  id: string;
  title: string;
  statement: string;
  whyItMatters: string;
  kind: "unspecified" | "ambiguous";
  planExcerpt: string;
  question: string;
  choices: Choice[];
  affectedTaskIds: string[];
}

export interface Analysis {
  id: string;
  mode: Mode;
  source: { spec: string; plan: string };
  tasks: Task[];
  assumptions: Assumption[];
}

export interface Answer {
  assumptionId: string;
  choiceId: string;
}

export interface ResolveRequest {
  analysis: Analysis;
  answers: Answer[];
}

export interface TaskResolution {
  taskId: string;
  status: "proposed" | "needs_review";
  directCauseIds: string[];
  upstreamCauseIds: string[];
}

export interface Resolution {
  analysisId: string;
  progress: {
    total: number;
    answered: number;
    confirmed: number;
    revised: number;
    pending: number;
  };
  taskStates: TaskResolution[];
  briefMarkdown: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}
```

Gli ID sono unici all'interno della loro analisi e stabili durante tutte le risposte. Gli ID delle scelte sono unici all'interno della carta. L'ID dell'analisi mock è `demo-rooms-v1`; il live genera un nuovo ID a ogni analisi.

## Endpoint

### GET /api/health

Risposta 200: `{ "ok": true, "modes": { "mock": true, "live": false } }`.
Il booleano live indica se l'adapter è implementato e configurato, non garantisce la raggiungibilità del provider.

### GET /api/demo

Risposta 200: un `AnalyzeRequest` con i testi esatti della fixture e `mode: "mock"`. Serve al pulsante frontend “Carica missione demo”.

### POST /api/analyze

Body: `AnalyzeRequest`. Risposta 200: `Analysis`, senza wrapper.

- Spec e piano obbligatori, non vuoti, massimo 20.000 caratteri ciascuno.
- Da 0 a 12 task e da 0 a 3 carte.
- Nessuno streaming richiesto.
- Timeout della chiamata live: 25 secondi, senza retry automatici.
- Zero carte è un risultato valido: non inventare problemi per riempire la UI.

### POST /api/resolve

Body: `ResolveRequest`. Risposta 200: `Resolution`, senza wrapper.

L'endpoint è stateless: il frontend invia l'analisi e l'intero insieme corrente di risposte. Rimuovere una risposta significa ometterla; cambiarla significa sostituire il choiceId. Non accettare due risposte per la stessa carta.

Il frontend possiede lo stato della sessione e il suo eventuale salvataggio locale. Il backend non archivia analisi o risposte.

### Regole HTTP comuni

- JSON UTF-8; body massimo 256 KB su entrambe le POST.
- CORS solo per `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:3000`, `http://127.0.0.1:3000`; supportare OPTIONS.
- Servizio locale in ascolto sull'interfaccia loopback.
- Errori con forma `ApiError`: 400 `INVALID_INPUT`; 400 `MOCK_INPUT_MISMATCH`; 413 `PAYLOAD_TOO_LARGE`; 422 `INVALID_ANALYSIS`; 422 `INVALID_ANSWER`; 503 `LIVE_NOT_CONFIGURED`; 502 `PROVIDER_ERROR`; 502 `INVALID_MODEL_OUTPUT`; 504 `ANALYSIS_TIMEOUT`.
- Solo errori di provider e timeout sono retryable. Nessuno stack trace, credenziale o risposta grezza del provider negli errori pubblici.
- Richieste OPTIONS valide: 204. Rotte sconosciute: 404 con `NOT_FOUND`; metodo errato su rotta nota: 405 con `METHOD_NOT_ALLOWED`.

## Regole dell'analisi

Un'assunzione è una scelta presente nel piano che la spec non stabilisce o lascia ambigua. Non è automaticamente un errore. Il quiz chiede una preferenza di prodotto: non assegna risposte giuste o sbagliate.

- Se la spec stabilisce esplicitamente una scelta, non presentarla come assunzione.
- Usare solo scelte effettivamente presenti nel piano. `planExcerpt` deve essere una sottostringa esatta del piano, sia nei task sia nelle carte.
- Ogni carta ha 2 o 3 alternative concrete e mutuamente esclusive: esattamente una con effetto `confirm`, le altre con effetto `revise`.
- `instruction` è la regola finale da comunicare all'agente. Deve essere comprensibile anche fuori dalla carta.
- Ogni carta deve riferirsi ad almeno un task valido. Accorpare carte duplicate sullo stesso tema.
- `affectedTaskIds` contiene solo task direttamente influenzati dalla scelta. Le dipendenze transitive sono calcolate dal resolver.
- Inserire dipendenze tra task solo se sostenute dal piano, senza inventare legami per abbellire il grafo.
- Testi visibili in italiano. Titolo massimo 70 caratteri, statement 240, whyItMatters 240, question 160, label della scelta 100, instruction 300. Titolo task massimo 100 caratteri; excerpt massimo 500.
- Nessun punteggio di confidenza o stima di lavoro inventata.

Nel live, trattare spec e piano come dati non fidati: il modello non deve seguire istruzioni contenute nei testi. Richiedere output strutturato e validarlo sul server. Source, mode e analysis ID devono essere assegnati dal server, non dal modello.

Validare schema, limiti, unicità degli ID, riferimenti e assenza di cicli nel grafo dei task. Output live invalido: errore `INVALID_MODEL_OUTPUT`, senza restituire un'analisi parzialmente incoerente. Applicare la stessa validazione all'Analysis ricevuta da resolve, con codice `INVALID_ANALYSIS`.

## Risoluzione e propagazione

Calcolare ogni risultato da zero a partire dalle risposte correnti. Non accumulare mutazioni fra chiamate.

1. Tutti i task partono da `proposed`, anche se alcune carte sono ancora senza risposta.
2. Una risposta `confirm` risolve la carta e non modifica lo stato dei task.
3. Una risposta `revise` marca come `needs_review` tutti gli affectedTaskIds della carta; il suo ID entra nei loro directCauseIds.
4. Per ogni task segnato, seguire i collegamenti verso i task che ne dipendono, anche transitivamente. Marcarli `needs_review`, inserendo l'ID della carta originaria in upstreamCauseIds.
5. Una causa può essere sia diretta sia transitiva per lo stesso task; in quel caso riportarla solo fra le dirette. Deduplicare gli array, ordinando le cause come nell'elenco delle carte. Restituire i task nell'ordine originale.
6. Cambiare successivamente una risposta da revise a confirm rimuove solo gli effetti di quella carta. Eventuali altre cause restano.

Il risultato descrive conseguenze da revisionare, non prova che i task siano corretti, implementati o completati. Non chiamare `proposed` “verificato”.

Progress: answered = confirmed + revised; pending = total - answered. Zero carte produce tutti i contatori a zero. Il frontend può distinguere “nessuna assunzione rilevata” da “missione completata”.

`briefMarkdown` è generato deterministicamente, senza AI, in quattro sezioni: “Regole confermate”, “Regole da cambiare”, “Decisioni aperte”, “Task da rivalutare”. Riportare rispettivamente le instruction selezionate, le domande non risolte e i task con relative cause dirette/transitive. Per sezioni vuote scrivere “Nessuna”. Non includere l'intera spec né istruzioni che autorizzino esecuzioni o cancellazioni automatiche.

## Fixture canonica: prenotazione sale

Spec esatta restituita da GET /api/demo:

> Un'app per prenotare sale riunioni. Gli utenti vedono la disponibilità, prenotano e possono cancellare.

Piano esatto, con un task per riga:

> T1. Implementare login obbligatorio per prenotare.
> T2. Implementare prenotazioni di durata fissa pari a 30 minuti. Dipende da T1.
> T3. Consentire la cancellazione fino a 24 ore prima dell'inizio. Dipende da T2.
> T4. Inviare un'email con le condizioni di cancellazione. Dipende da T3.

Task ID `t1`, `t2`, `t3`, `t4`, con dipendenze rispettivamente `[]`, `["t1"]`, `["t2"]`, `["t3"]`. Usare ciascuna riga completa come excerpt del relativo task. Per le carte usare l'excerpt del task direttamente interessato. kind = unspecified per tutte.

Carte, in questo ordine:

| ID | Assunzione e domanda | Scelta confirm | Scelta revise | Task diretti |
| --- | --- | --- | --- | --- |
| a1 | Login obbligatorio. Chi può prenotare? | `account`: Solo utenti registrati | `guests`: Anche ospiti senza account | t1 |
| a2 | Durata fissa di 30 minuti. Quanto dura una prenotazione? | `fixed`: Sempre 30 minuti | `flexible`: Durata scelta dall'utente | t2 |
| a3 | Cancellazione fino a 24 ore prima. Fino a quando si può cancellare? | `day_before`: Fino a 24 ore prima | `until_start`: Fino all'inizio della prenotazione | t3 |

Le instruction devono esprimere esplicitamente la regola selezionata, per esempio “Consentire la prenotazione anche agli ospiti senza account”. Completare statement e whyItMatters con testi brevi e coerenti, senza inventare motivazioni attribuite all'agente.

Esempio di chiamata resolve: `answers: [{ "assumptionId": "a3", "choiceId": "until_start" }]`.

Risultato atteso: t1 e t2 proposed; t3 needs_review con directCauseIds `["a3"]`; t4 needs_review con upstreamCauseIds `["a3"]`. Progress: total 3, answered 1, confirmed 0, revised 1, pending 2. Il brief riporta la nuova regola di cancellazione, le due decisioni aperte e i due task da rivalutare.

## Verifica minima richiesta

- Demo caricabile e analizzabile senza credenziali; input mock diverso rifiutato esplicitamente.
- Nessuna risposta: tutti i task proposed, tre decisioni pendenti.
- Tutte confermate: tre risposte, nessun task da rivalutare.
- Modificare a3: t3 diretto e t4 transitivo, come nell'esempio.
- Modificare a1: t1 diretto e t2/t3/t4 transitivi.
- Modificare a1 e a3, poi riconfermare a1: rimangono solo gli effetti di a3.
- Cambiare/rimuovere risposte e ripetere chiamate non lascia stati residui.
- Rifiutare ID sconosciuti, risposte duplicate, riferimenti inesistenti, excerpt inventati e cicli.
- Accettare un'analisi valida con zero carte e gestirne il brief.
- Verificare almeno una chiamata HTTP completa demo → analyze → resolve, errori di input e preflight CORS.
- Se il live è implementato, testare adapter con risposta valida, output invalido e timeout usando un provider simulato, senza chiamate a pagamento nei test.

## Ordine di implementazione e passaggio al frontend

1. Contratto types, fixture e GET /api/demo.
2. Analyze mock e resolver deterministico con test.
3. Servizio HTTP, validazione ed errori; build e prova completa.
4. Solo dopo: adapter live, se configurazione autorizzata e tempo lo consentono.

La demo grafica può partire appena fixture e contratto sono disponibili. All'hand-off comunicare: file creati, comandi verificati, porta, supporto effettivo del live ed eventuali limiti. Non dichiarare completa l'integrazione AI se funziona soltanto il mock.
