# Guida integrazione runner SpecOps

Il browser non invia URL di runner. Solo il server risolve `runnerId` tramite:

- `SPECOPS_REFERENCE_RUNNER_URL` per `runnerId=reference`
- `SPECOPS_RUNNERS_JSON` mappa JSON `{"id":"http://host:port"}`
- opzionale `SPECOPS_RUNNER_TOKEN` come Bearer

## Contratto minimo

### `GET /snapshot`

```json
{
  "executionState": "idle|running|pause_requested|paused|resume_requested|completed|failed|unknown",
  "taskStates": [{ "id": "t1", "status": "pending|working|done|paused|blocked|failed" }],
  "lastSequence": 12,
  "capabilities": {
    "observe": true,
    "pause": true,
    "resume": true,
    "dispatchControl": true,
    "start": true
  }
}
```

### `GET /events`

SSE. Ogni evento: `id` = sequence, `data` = JSON `{ sequence, type, timestamp, payload }`.

Tipi rilevanti: `command.acknowledged`, `command.failed`, `task.updated`, `runner.started`, `runner.completed`.

### `POST /commands`

Body: `{ "commandId": "…", "kind": "pause"|"resume" }` → **202**.

- Stesso `commandId` non riesegue il comando.
- Dopo l’ack di pausa non deve partire altro lavoro.
- Resume riprende una sola volta per quel commandId.
- `paused` solo quando il dispatch è fermo in un punto sicuro.

## Reference runner locale

```sh
cd core
npx tsx src/v2/run-reference-runner.ts
```

Poi missione con `runnerId: "reference"` (mode connected o demo con adapter HTTP se configurato).

## Limiti dichiarati

Se `dispatchControl` è false, SpecOps non finge di sospendere task esterni ancora `working`.
Se `pause` è false, l’UI mostra: “Controllo pausa non disponibile: ferma l’agente dal suo ambiente”.
