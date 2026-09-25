# SpecOps

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Developer che supervisionano le decisioni di un agente durante l'implementazione di una spec.

## Product Purpose
Confrontare spec e piano dell'agente, rendere visibili le assunzioni e permettere di confermarle o cambiarle con un mini-quiz. Mostrare quali task vanno rivalutati e produrre un brief aggiornato.

## Operating Context
Demo desktop fullscreen, interattiva, con animazioni. Il pubblico deve poter provare il flusso in pochi minuti. Budget iniziale di sviluppo: due ore. Il core viene implementato separatamente in core/.

## Capabilities and Constraints
Tre decisioni per lo scenario sale riunioni; quattro task con dipendenze. Mock dichiarato disponibile senza backend. Collegamento HTTP al core tramite il contratto in docs/superpowers/specs/2026-09-25-specops-core-design.md. Nessuna esecuzione, cancellazione o verifica automatica di codice.

## Brand Commitments
Il prodotto deve sembrare più un gioco che un'app di lavoro. Il concept approvato è una sala di comando con carte decisionali e conseguenze visibili. SpecOps è il nome provvisorio.

## Stack
Scelta implementativa dell'agente per la demo: React, TypeScript e Vite; scena procedurale Three.js e animazioni Motion. Nessun requisito di deploy indicato dall'utente.

## Evidence on Hand
Spec del core e scenario dimostrativo sale riunioni. Nessun dato di produzione né claim di prestazioni.

## Product Principles
Le risposte esprimono scelte, non risposte giuste o sbagliate. Distinguere sempre decisioni risolte da task implementati. Le modifiche sono reversibili. Il mock non simula analisi arbitrarie.
