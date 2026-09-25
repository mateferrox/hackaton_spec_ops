# SpecOps

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Developer che supervisionano le decisioni di un agente durante l’implementazione di una spec.

## Product Purpose
Partire da una spec già scritta, estrarre regole e casi concreti, accompagnare l’esecuzione con domande contestuali, segnalare conflitti motivati e permettere la pausa verificabile del runner.

## Operating Context
Home zen fullscreen (giardino, sakura, una domanda alla volta). Core HTTP su loopback con SQLite. Budget iniziale superato: prodotto v2 completo in demo; AI e runner reale dipendono da configurazione.

## Capabilities and Constraints
Libreria spec + import Markdown. Mode `demo` offline (DemoAdapter). Mode `connected` con provider AI opzionale. HttpRunnerAdapter + reference runner. Legacy `/api/analyze` + `/api/resolve` invariati. Nessuna auth multiutente, nessun deploy cloud in questa consegna.

## Brand Commitments
Esperienza da giardino, non da dashboard. SpecOps è il nome del prodotto.

## Stack
Vite + HTML/CSS/JS (home zen). Core TypeScript Node 22 (`node:sqlite`). Proxy Vite `/api` → core `:3001`.

## Evidence on Hand
Spec completa `docs/superpowers/specs/2026-09-25-specops-full-product-grok.md`. Test core 39 + root. Smoke mission flow verificato via script.

## Product Principles
Scelte di prodotto, non quiz giusto/sbagliato. Stato esecuzione distinto da “da rivalutare”. Pausa solo dopo ack del runner. Demo non finge analisi AI live.
