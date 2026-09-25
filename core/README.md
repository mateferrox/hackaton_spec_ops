# SpecOps core

Motore HTTP di SpecOps: contratto legacy (`/api/analyze`, `/api/resolve`) e prodotto v2 (`/api/v2/*`) con SQLite, missioni, DemoAdapter, HttpRunnerAdapter e reference runner.

## Avvio

```bash
cd core
npm install
cp .env.example .env   # opzionale
npm run dev            # http://127.0.0.1:3001
npm test
npm run build
npm start
```

Variabili: vedere `.env.example`.

| Variabile | Default | Descrizione |
| --- | --- | --- |
| `SPECOPS_HOST` | `127.0.0.1` | Loopback |
| `SPECOPS_PORT` | `3001` | Porta HTTP |
| `SPECOPS_DATA_DIR` | `./data` | Directory SQLite (esclusa da Git) |
| `SPECOPS_AI_BASE_URL` / `SPECOPS_AI_API_KEY` | — | Provider OpenAI-compatible per mode `connected` |
| `SPECOPS_REFERENCE_RUNNER_URL` | `http://127.0.0.1:3002` | URL del reference runner per `runnerId=reference` |
| `SPECOPS_RUNNERS_JSON` | — | Mappa id→URL runner (solo server) |

## Modalità

| Mode | Stato |
| --- | --- |
| legacy `mock` | disponibile (fixture sale) |
| legacy `live` | `LIVE_NOT_CONFIGURED` |
| v2 `demo` | offline, analisi deterministica, DemoAdapter |
| v2 `connected` | richiede provider; altrimenti `PROVIDER_NOT_CONFIGURED` |

## API v2 (sintesi)

- `GET /api/v2/specs` — libreria spec
- `POST /api/v2/specs/import` — importa testo
- `POST /api/v2/missions` — crea missione + avvia analisi
- `GET /api/v2/missions/:id` — snapshot
- `GET /api/v2/missions/:id/events` — SSE
- `POST .../confirm-rules` · `start` · `answers` · `control`
- `PUT .../spec` · `POST .../reanalyze` · `GET .../brief`

## Reference runner

```bash
npx tsx -e "import { createReferenceRunner } from './src/v2/reference-runner.ts'; const s=createReferenceRunner(); s.listen(3002,'127.0.0.1');"
```

Contratto: `GET /snapshot`, `GET /events`, `POST /commands`, `POST /start`.

## Integrazione agente reale

1. Esporre lo stesso contratto HTTP del reference runner.
2. Registrare l’URL in `SPECOPS_RUNNERS_JSON` (mai dal browser).
3. Creare la missione con `mode: "connected"` e `runnerId` noto al server.
4. Verificare pause: `pause_requested` → ack → nessun nuovo lavoro; resume una sola volta per commandId.

Cosa è verificato in questa consegna: DemoAdapter e reference runner in test automatici. Un agente commerciale (Grok/Codex/…) non è dichiarato integrato finché non viene collegato un runner compatibile.
