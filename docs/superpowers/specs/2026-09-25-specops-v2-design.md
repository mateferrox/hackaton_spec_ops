# SpecOps v2 — feedback per gli implementer

Data: 25 settembre 2026. Destinatari: agente core (`core/`) e agente frontend (root).

Questo documento aggiorna `2026-09-25-specops-core-design.md` e `PRODUCT.md`. Dove i due testi divergono, prevale questo. Tutto il resto della spec del core resta valido: proprietà dei file, principi, errori HTTP, niente esecuzione di codice reale, mock dichiarato, testi in italiano.

## Perché cambiamo

La v1 funziona, ma è un quiz che si fa prima dell'esecuzione: incolli spec e piano, rispondi a tre domande, ottieni un brief. Questo lo fanno già altri strumenti. SpecOps deve accompagnare una sessione **in corso**:

1. **Tempo.** L'agente lavora e le decisioni emergono mentre lavora. Più il developer aspetta, più lavoro viene costruito sopra un'assunzione, e cambiarla costa di più.
2. **Esempi realistici.** Mentre l'agente lavora, il developer non legge regole astratte ma casi concreti (persone, orari, sale) che mostrano cosa significa ogni scelta. I casi concreti fanno emergere anche i punti in cui la spec stessa è sbagliata o incompleta.
3. **Stop.** Se il developer si accorge che la spec è sbagliata, può fermare lo sviluppo dei task collegati invece di scegliere fra alternative che non vanno bene.

## Cosa va bene e non va toccato

- Il resolver: stateless, ricalcola da zero, cause dirette e transitive, ordine stabile. Va esteso, non riscritto.
- La validazione del core, dopo le correzioni delle 20:51.
- I principi di `PRODUCT.md`: scelte e non risposte giuste o sbagliate, decisioni risolte distinte da task implementati, modifiche reversibili.

## Priorità

- **P0**, obbligatorio per la demo, in questo ordine: §1 fonte unica → §2 contratto e fixture → §3 resolver → §4 tempo → §5 esempi nella UI → §6 stop nella UI.
- **P1**, solo se P0 è completo e verificato: §7.
- **P2**: fuori da questa consegna, §8.

Se il tempo finisce, consegnare P0 completo e dichiarare cosa manca. Non simulare funzionalità non implementate.

---

## §1 — Una sola fonte di verità (P0, frontend)

**Problema verificato.** In modalità mock il frontend non usa mai il core:

- `src/demo.ts` ha una sua fixture, con testi diversi da quelli di `core/src/fixture.ts`:
  - istruzione di a1: "Richiedere un account per prenotare una sala." contro "Consentire la prenotazione solo agli utenti registrati con account.";
  - titoli dei task: "Accesso utenti" contro "Login obbligatorio per prenotare".
- `src/demo.ts` ha un suo resolver (`resolvePreview`) che produce un brief in formato diverso.
- `src/contracts.ts` è una copia manuale del contratto.
- "Trova le decisioni" (`App.tsx`, `startLive`) manda sempre `mode: 'live'`, quindi riceve sempre `503 LIVE_NOT_CONFIGURED`.

**Correzione.**

- Il frontend importa direttamente da `core/src/`: `contracts.ts` (tipi), `fixture.ts`, `analyze.ts`, `resolve.ts`. Sono TypeScript puro senza dipendenze Node e girano nel browser. **Non** importare `core/src/index.ts`, che si porta dietro `node:http`.
- Eliminare da `src/demo.ts` la fixture e `resolvePreview`; eliminare `src/contracts.ts`. In `src/demo.ts` restano solo le utility di UI, come `updateAnswer`.
- In mock tutta la logica gira nel browser con il codice del core: `analyze()` per caricare lo scenario, `resolve()` per anteprime e conferme. Se il developer modifica i testi e rilancia in mock, deve vedere l'errore reale `MOCK_INPUT_MISMATCH` del core.
- Il pulsante di analisi live è attivo solo se `GET /api/health` restituisce `modes.live: true`. Altrimenti mostrare che il live non è disponibile, senza fare la chiamata.
- Se Vite o `tsc` non risolvono gli import `.js` → `.ts` del core, aggiungere un alias in `vite.config.ts`. Non copiare file.

**Verifica.** `npm run build` nella root passa. Nessun testo della fixture compare dentro `src/`. Il brief mostrato in UI è identico all'output di `resolve()` del core.

## §2 — Contratto e fixture (P0, core; da consegnare per primo)

L'agente core consegna prima questa sezione (contratto e fixture), così il frontend può partire. Solo dopo passa a §3.

### Delta del contratto (`core/src/contracts.ts`)

```ts
export interface Choice {
  id: string;
  label: string;
  instruction: string;
  effect: "confirm" | "revise" | "halt"; // nuovo: halt
}

export interface ExampleOutcome {
  choiceId: string; // id di una scelta confirm o revise della stessa carta
  outcome: string;  // max 200 caratteri
}

export interface Example {
  id: string;                 // unico nella carta
  story: string;              // max 240 caratteri: persone, orari, luoghi concreti
  outcomes: ExampleOutcome[]; // esattamente uno per ogni scelta confirm/revise
  specGap: boolean;           // true se almeno una scelta porta a un caso che spec e piano non risolvono
}

export interface Assumption {
  // ...campi esistenti invariati...
  examples: Example[]; // nuovo: da 0 a 3
}

export interface Answer {
  assumptionId: string;
  choiceId: string;
  note?: string; // nuovo: facoltativa, max 280, ammessa solo se la scelta ha effect "halt"
}

export interface TaskResolution {
  taskId: string;
  status: "proposed" | "needs_review" | "blocked"; // nuovo: blocked
  directCauseIds: string[];
  upstreamCauseIds: string[];
}

export interface Resolution {
  analysisId: string;
  progress: {
    total: number;
    answered: number; // confirmed + revised + halted
    confirmed: number;
    revised: number;
    halted: number;   // nuovo
    pending: number;
  };
  taskStates: TaskResolution[];
  briefMarkdown: string;
}
```

### Regole di validazione nuove

- Una carta ha 1 scelta `confirm`, da 1 a 2 `revise` e al massimo 1 `halt`: in totale da 2 a 4 scelte. Aggiornare `LIMITS.maxChoices` a 4.
- `examples`: array di 0–3 elementi, id unici nella carta.
- Ogni esempio ha esattamente un `outcome` per ogni scelta `confirm`/`revise`: nessun duplicato, nessun id sconosciuto, nessun outcome per la scelta `halt`.
- `story` e `outcome` non vuoti e dentro i limiti. `specGap` è un booleano.
- `Answer.note` deve essere una stringa di al massimo 280 caratteri. Se presente su una scelta che non è `halt`: `422 INVALID_ANSWER`.
- Output invalido: stessi codici di oggi (`INVALID_ANALYSIS`, `INVALID_ANSWER`).

### Regole per scrivere gli esempi (valgono anche per il live futuro)

- Persone, orari e luoghi concreti e plausibili per il dominio della spec.
- Gli outcome descrivono le conseguenze in modo neutro. Non giudicano: niente "giusto/sbagliato", niente "meglio".
- Gli outcome sono coerenti con la `instruction` della scelta. Non introducono requisiti nuovi presentandoli come fatti della spec.
- `specGap: true` solo se il caso mostra davvero qualcosa che spec e piano non stabiliscono. L'outcome deve dire esplicitamente che cosa manca.

### Fixture sale riunioni: testi esatti

Aggiungere a ciascuna carta la scelta `halt` e due esempi. Usare questi testi alla lettera, così non nascono divergenze fra i due agenti.

**Scelte halt** (id `spec_wrong`, label "Nessuna delle due: la spec va corretta"):

| Carta | instruction |
| --- | --- |
| a1 | Fermare i task collegati: chi può prenotare va chiarito nella spec prima di proseguire. |
| a2 | Fermare i task collegati: la durata delle prenotazioni va chiarita nella spec prima di proseguire. |
| a3 | Fermare i task collegati: le regole di cancellazione vanno chiarite nella spec prima di proseguire. |

**a1 — Chi può prenotare?**

- `a1-e1`, specGap `false`. Story: "Un fornitore esterno arriva alle 10 per una demo e vuole prenotare la sala Blu."
  - `account`: "Non può farlo da solo: deve chiedere a un collega con account di prenotare per lui."
  - `guests`: "Prenota senza registrarsi e ottiene la sala Blu."
- `a1-e2`, specGap `true`. Story: "Un ospite senza account prenota la sala Blu. Il task T4 prevede di inviare un'email con le condizioni di cancellazione."
  - `account`: "Il caso non si presenta: gli ospiti non possono prenotare."
  - `guests`: "Né la spec né il piano dicono se all'ospite va chiesta un'email: il T4 non sa dove inviarla."

**a2 — Quanto dura una prenotazione?**

- `a2-e1`, specGap `false`. Story: "Il team marketing ha un workshop di due ore, dalle 9 alle 11, in sala Verdi."
  - `fixed`: "Servono quattro prenotazioni da 30 minuti. Se un collega prende lo slot delle 10, il workshop resta spezzato a metà."
  - `flexible`: "Basta una sola prenotazione dalle 9 alle 11."
- `a2-e2`, specGap `true`. Story: "Luca ha una call di 10 minuti alle 14 e cerca una sala libera."
  - `fixed`: "Blocca comunque 30 minuti: per 20 minuti la sala resta vuota e nessun altro può usarla."
  - `flexible`: "Prenota solo 10 minuti. Ma la spec non dice se esistono una durata minima e una massima: anche 8 ore di fila andrebbero bene?"

**a3 — Fino a quando si può cancellare?**

- `a3-e1`, specGap `false`. Story: "Giulia ha prenotato la sala Verdi per le 15. Alle 14:30 la riunione salta."
  - `day_before`: "Non può cancellare: la sala resta prenotata e vuota, e nessun altro può usarla."
  - `until_start`: "Cancella alle 14:30 e la sala torna libera per chi la cerca."
- `a3-e2`, specGap `true`. Story: "La riunione di Anna dura dalle 15 alle 15:30. Alle 15:10 finisce in anticipo."
  - `day_before`: "Non può liberare la sala: si poteva cancellare solo fino a 24 ore prima. La spec non dice se una prenotazione in corso si può chiudere in anticipo."
  - `until_start`: "Non può liberare la sala: la riunione è già iniziata. La spec non dice se una prenotazione in corso si può chiudere in anticipo."

Ordine delle scelte in ogni carta: confirm, revise, halt.

## §3 — Resolver con lo stop (P0, core)

Estendere `resolve()` mantenendo tutte le regole esistenti:

1. Una risposta `halt` si propaga come una `revise`: la carta entra nei `directCauseIds` dei suoi `affectedTaskIds` e negli `upstreamCauseIds` dei task che ne dipendono, anche transitivamente. Stesse regole di deduplica e ordinamento di oggi.
2. Stato di ogni task, per precedenza: `blocked` se almeno una delle sue cause (dirette o transitive) è una carta con risposta `halt`; altrimenti `needs_review` se ha almeno una causa; altrimenti `proposed`.
3. Passare da `halt` a un'altra scelta rimuove solo gli effetti di quella carta.
4. `progress.halted` conta le risposte `halt`, e `answered = confirmed + revised + halted`.

**Brief**: cinque sezioni, nell'ordine indicato. "Stop" viene prima perché è l'istruzione più urgente per l'agente.

```md
## Stop

- <instruction della scelta halt> Nota del developer: "<note>"
Task fermi: t3 (<titolo>), t4 (<titolo>)

## Regole confermate
## Regole da cambiare
## Decisioni aperte
## Task da rivalutare
```

- Nella sezione Stop, una riga per ogni carta fermata, nell'ordine delle carte. Ometti "Nota del developer" se non c'è una nota. "Task fermi" elenca tutti i task `blocked` nell'ordine originale. Senza stop la sezione contiene solo "Nessuno".
- "Task da rivalutare" elenca solo i task `needs_review`. I `blocked` compaiono solo in Stop.
- Lo stop chiede di non proseguire. Non autorizza rollback, cancellazioni o esecuzioni.

**Test richiesti** (vitest). Aggiornare quelli esistenti, che oggi si aspettano 2 scelte e 4 sezioni.

- Fixture: ogni carta ha 3 scelte (confirm, revise, halt) e 2 esempi. Gli outcome coprono esattamente le scelte confirm e revise. `a*-e2` hanno `specGap: true`, `a*-e1` hanno `false`.
- Validazione rifiutata per: due scelte `halt`; nessuna `revise`; un outcome mancante, duplicato, per una scelta `halt` o con id sconosciuto; id di esempio duplicati; più di 3 esempi; `note` su una scelta non halt; `note` oltre 280 caratteri.
- Halt su a3: t1 e t2 `proposed`; t3 `blocked` con direct `["a3"]`; t4 `blocked` con upstream `["a3"]`. `progress.halted` vale 1. Il brief inizia con `## Stop` e contiene l'istruzione di a3, t3 e t4.
- Halt su a1 e revise su a3: tutti i task `blocked`. t3 ha direct `["a3"]` e upstream `["a1"]`.
- Halt su a3 e poi confirm su a3: nessun task `blocked` e nessuno stato residuo.
- Halt con `note` presente e con `note` assente: il brief riporta la nota solo quando c'è.

Aggiornare `core/README.md` con i campi nuovi e un esempio di resolve con halt.

## §4 — Il tempo: la sessione è in corso (P0, frontend)

Una simulazione deterministica, scritta nel frontend e dichiarata in UI con la dicitura: "SIMULAZIONE — nessun codice viene scritto o eseguito". Il core non cambia per questa sezione.

**Avanzamento dell'agente simulato.**

- Costante `SIM_TASK_SECONDS = 20`. Controlli: Avvia, Pausa, velocità ×2, Ricomincia.
- Stato di avanzamento di ogni task, gestito solo dal frontend e distinto da `TaskResolution`: `todo`, `building`, `built`, `stopped`.
- Un task alla volta. Il prossimo è il primo `todo` nell'ordine dei task che rispetta tre condizioni: tutte le sue dipendenze sono `built`, non è `blocked` e nessuna sua dipendenza è `blocked`.
- Se non esiste un prossimo task e restano task `todo`, la sessione è "Ferma: in attesa della spec". Se tutti sono `built`, è "Completata".

**Arrivo delle carte.**

- Una carta compare quando l'agente inizia il primo dei suoi `affectedTaskIds`, con l'etichetta "L'agente ha appena deciso · mm:ss". Prima di quel momento non esiste per il developer. Nelle tab e nei segmenti di progresso è mostrata come "in arrivo" e non si può aprire.
- L'agente **non aspetta** una risposta: prosegue con la propria assunzione. "Decidi dopo" diventa "Lascia fare all'agente, per ora".

**Costo del ritardo, sempre visibile sulla carta.**

- Calcolo: chiamare `resolve()` del core aggiungendo alle risposte correnti la scelta selezionata (o la prima `revise` se non ne è selezionata nessuna). Dividere i task toccati in:
  - "da rifare": `built` o `building`;
  - "da adattare": `todo`.
- Testo: "Se cambi ora: 1 da rifare · 2 da adattare". Si aggiorna mentre l'orologio avanza. Per la scelta halt: "Se fermi ora: N task fermi".
- È un numero derivato da grafo e avanzamento, non una stima inventata.

**Effetti delle risposte sulla simulazione.**

- `revise` su task già `built`: il task resta `built` ma viene segnato "da rifare". Il rifacimento non viene simulato.
- `halt`: un task `blocked` in `building` passa a `stopped`. I task `blocked` non partono più.
- Cambiando la risposta da `halt` a un'altra scelta, i task tornano disponibili e l'agente riprende.

**Pulsante globale "Ferma tutto".** Sempre visibile. Mette in pausa la simulazione con lo stato "Fermata dal developer" e si riprende con Avvia. Non genera istruzioni: lo stop che produce regole per l'agente è quello sulla carta (§6).

**Schermata finale.** Contatori derivati:

- decisioni prese **in tempo**: al momento della conferma nessun loro `affectedTaskId` era ancora `built`;
- decisioni prese in ritardo;
- decisioni lasciate all'agente;
- task da rifare, da adattare, fermi.

Poi il brief del core.

**Persistenza.** Togliere il ripristino delle risposte da `localStorage`: con il tempo, ogni sessione riparte da zero. Una sessione ricaricata a metà produrrebbe stati incoerenti, per esempio risposte a carte non ancora arrivate.

## §5 — Esempi realistici nella UI (P0, frontend)

- Sulla carta, sotto la domanda, un blocco "Mentre l'agente lavora, prova questi casi" con gli `examples` scorribili.
- Per l'esempio visibile, mostrare fianco a fianco l'outcome di ogni scelta confirm/revise, evidenziando quello della scelta selezionata. Il developer deve poter confrontare i casi senza aver ancora scelto.
- Un esempio con `specGap: true` ha il badge "La spec non lo dice" e un'azione secondaria "La spec va corretta", che seleziona la scelta `halt` della carta.
- Zero esempi è un caso valido: il blocco non compare. Non generare esempi nel frontend.

## §6 — Stop sulla carta (P0, frontend)

- La scelta `halt` non è un terzo bottone uguale agli altri. Va separata visivamente dalle alternative, con uno stile da "leva di stop". Resta nello stesso flusso di selezione e conferma.
- Quando è selezionata compare un campo facoltativo: "Cosa manca o è sbagliato nella spec?", massimo 280 caratteri. Il testo va in `Answer.note`.
- I task `blocked` hanno un proprio colore e l'etichetta "Fermo: spec da correggere", sia nella scena sia nel task deck. Aggiornare la legenda.
- Rimuovere gli hardcode:
  - le etichette delle tab `['Accesso', 'Durata', 'Cancellazione']`: usare `assumption.title`;
  - il contatore fisso `2` del Briefing;
  - `impactOnly`, che considera solo la prima `revise`: il costo si calcola come descritto in §4.

## §7 — Finale "SpecOps su sé stesso" (P1, frontend)

Un pannello finale, raggiungibile dalla schermata di fine sessione, con il titolo "Decisioni prese dagli agenti che hanno costruito SpecOps". È una istantanea dichiarata come tale ("Istantanea del ledger del 25/09, 20:55"), in sola lettura, senza resolver:

- I tre `Ruling:` di `.superpowers/sdd/2026-09-25-specops-core/progress.md`, citati alla lettera: no commits, live non implementato, `SPECOPS_HOST`/`SPECOPS_PORT`.
- Una voce "Decisione non dichiarata": "Prima della v2, core e frontend avevano due fixture diverse per la stessa demo. Nessun agente l'ha registrata." È il ponte verso il livello AI futuro, che dovrà scovare le decisioni non dichiarate.

Agenti: continuate a registrare i vostri `Ruling:` nel ledger. Sono il materiale di questo finale.

## §8 — Fuori da questa consegna (P2)

Da non implementare ora. Documentare nel README come passi successivi:

- Parser generico delle righe `Ruling:` di superpowers come fonte live di carte, senza LLM.
- Stop reale: un file `.specops/HALT` più un hook `PreToolUse` di Claude Code che, finché il file esiste, blocca le modifiche dell'agente e gli mostra il motivo.
- `DECISIONS.md` in sola aggiunta, come registro permanente delle decisioni ratificate.
- Adapter live con LLM, compresa la generazione degli esempi secondo le regole di §2.

## Coordinamento

1. Core: §2, cioè contratto e fixture. Comunicare al frontend quando è pronto.
2. In parallelo:
   - core: §3 con i test e il README;
   - frontend: §1, poi §4, §5, §6.
3. Hand-off finale di ciascun agente:
   - file toccati;
   - comandi verificati con il loro esito (`npm test` e `npm run build` in `core/`, `npm run build` nella root);
   - quali priorità sono complete e cosa manca;
   - i `Ruling:` nuovi nel ledger.
