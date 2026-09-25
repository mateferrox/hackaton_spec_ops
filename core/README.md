# SpecOps core

Motore HTTP della demo SpecOps: confronta una spec e un piano, espone assunzioni come carte e risolve le risposte in modo deterministico.

Implementato esclusivamente sotto `core/`. Nessun database, autenticazione o esecuzione di task.

## Avvio

```bash
cd core
npm install
npm run dev          # http://127.0.0.1:3001
npm test
npm run build
npm start            # serve dist/ dopo build
```

Variabili opzionali:

| Variabile | Default | Descrizione |
| --- | --- | --- |
| `SPECOPS_HOST` | `127.0.0.1` | Interfaccia di ascolto (loopback) |
| `SPECOPS_PORT` | `3001` | Porta HTTP |

## Modalità

| Mode | Stato | Note |
| --- | --- | --- |
| `mock` | disponibile | Accetta solo i testi della missione demo (dopo normalizzazione degli spazi). Altri input → `MOCK_INPUT_MISMATCH`. |
| `live` | non implementata | `POST /api/analyze` con `mode: "live"` risponde `503 LIVE_NOT_CONFIGURED`. `GET /api/health` riporta `modes.live: false`. |

Non sono richieste chiavi API. Eventuali variabili provider per un adapter live futuro andrebbero solo lato server (mai nel browser); in questa consegna non sono usate.

## Endpoint

### `GET /api/health`

```json
{ "ok": true, "modes": { "mock": true, "live": false } }
```

### `GET /api/demo`

Restituisce un `AnalyzeRequest` con i testi della fixture e `mode: "mock"`.

### `POST /api/analyze`

Body: `{ "spec": string, "plan": string, "mode": "mock" | "live" }`  
Risposta 200: `Analysis` (senza wrapper).

### `POST /api/resolve`

Body: `{ "analysis": Analysis, "answers": Answer[] }`  
Risposta 200: `Resolution` (senza wrapper). Stateless: il client invia l’analisi e l’insieme corrente di risposte.

## Esempi

Caricare la missione e analizzarla:

```bash
curl -s http://127.0.0.1:3001/api/demo > /tmp/demo.json
curl -s -X POST http://127.0.0.1:3001/api/analyze \
  -H 'Content-Type: application/json' \
  -d @/tmp/demo.json
```

Risolvere cambiando la policy di cancellazione (`a3` → `until_start`):

```bash
curl -s -X POST http://127.0.0.1:3001/api/resolve \
  -H 'Content-Type: application/json' \
  -d '{
    "analysis": '"$(curl -s -X POST http://127.0.0.1:3001/api/analyze -H "Content-Type: application/json" -d @/tmp/demo.json)"',
    "answers": [{ "assumptionId": "a3", "choiceId": "until_start" }]
  }'
```

## Contratto TypeScript

I tipi condivisi sono in `src/contracts.ts` (nessuna dipendenza runtime). Il frontend può importarli senza trascinare il server.

## CORS

Consentito solo per:

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:3000`
- `http://127.0.0.1:3000`

Le richieste `OPTIONS` valide rispondono `204`.

## Errori

Forma `ApiError`: `{ "error": { "code", "message", "retryable" } }`.

Codici usati dal mock: `INVALID_INPUT`, `MOCK_INPUT_MISMATCH`, `PAYLOAD_TOO_LARGE`, `INVALID_ANALYSIS`, `INVALID_ANSWER`, `LIVE_NOT_CONFIGURED`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`. Solo errori provider/timeout (non implementati qui) sarebbero `retryable: true`.
