# SpecOps

La home è la demo zen approvata: giardino animato, ramo di sakura, petali, step della spec e tre casi di prova con conflitto e pausa.

## Avvio

```sh
npm install
npm run dev
```

Home: http://localhost:5173/

```sh
npm run build
npm run preview
```

La build distribuibile è `dist/`; non richiede un backend per questa demo. Tutti gli asset sono locali.

## File attivi

- `index.html`: home e struttura accessibile.
- `src/zen/main.js`: domande, stati della simulazione e animazione Canvas.
- `src/zen/style.css`: layout responsive e stile zen.
- `public/demo-assets/`: font e ramo di ciliegio.
- `output/demo/index.html`: prototipo autonomo precedente, conservato come riferimento.
- `core/`: servizio HTTP separato; vedere il suo README.

La home attuale usa scenari preparati. Non analizza spec arbitrarie, non esegue task e non controlla agenti reali. La pausa arresta la simulazione e le animazioni. Il core esistente supporta il mock; l'analisi live non è implementata.

La prima UI React/Three.js in `src/App.tsx` e gli altri file collegati non sono più l'entrypoint della home. Non estenderli per il nuovo prodotto.

Spec di implementazione completa per l'agente successivo: `docs/superpowers/specs/2026-09-25-specops-full-product-grok.md`.
