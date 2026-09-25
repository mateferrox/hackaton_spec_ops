# SpecOps

Giardino zen per accompagnare l’esecuzione di una spec: selezione, analisi, conferma regole, domande contestuali, conflitti motivati e pausa del runner con ack.

## Avvio locale

Terminal 1 — core:

```sh
cd core && npm install && npm run dev
```

Terminal 2 — UI:

```sh
npm install && npm run dev
```

Apri http://127.0.0.1:5173/ (Vite proxy `/api` → `127.0.0.1:3101`). Gli script dalla root usano la porta 3101 per evitare conflitti con altri servizi locali. Per una porta diversa, imposta `SPECOPS_PORT` per il core e `SPECOPS_CORE_URL` per Vite.

```sh
npm run build && npm run preview   # UI da dist/
cd core && npm test && npm run build
```

## Modalità operative

| Dichiarazione | Come |
| --- | --- |
| **Demo completa** | `mode: demo`, nessuna chiave, libreria spec + DemoAdapter |
| **Analisi live completa** | `mode: connected` + `SPECOPS_AI_*` autorizzati |
| **Controllo agente verificato** | DemoAdapter / reference runner in test; agente reale solo con runner HTTP compatibile registrato server-side |

## File attivi

- `index.html` + `src/zen/*` — home approvata collegata a `/api/v2`
- `core/` — legacy + v2 (SQLite in `core/data/`)
- `.env.example` / `core/.env.example` — senza segreti
- Spec: `docs/superpowers/specs/2026-09-25-specops-full-product-grok.md`

## Flusso

1. Scegli o importa una spec → demo o connected  
2. Conferma regole estratte (nessun working prima dell’avvio)  
3. Avvia → rispondi ai casi → in conflitto: pausa / resta nella spec / rivedi  
4. Pausa: `pause_requested` finché il runner non conferma `paused`

La vecchia UI React/Three.js non è l’entrypoint.
