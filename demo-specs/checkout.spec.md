# Checkout e-commerce

Versione: 1.0

Il checkout di un piccolo negozio online: acquisto, disponibilità, sconti e conferma dell’ordine.

## Regole esplicite

1. È possibile acquistare senza creare un account, fornendo un indirizzo email.
2. Richieste ripetute con lo stesso identificativo di pagamento devono produrre un solo addebito e un solo ordine.
3. È possibile applicare un solo codice sconto per ordine.
4. Un ordine può essere confermato solo se tutti gli articoli risultano disponibili.
5. L’email di conferma dell’ordine viene inviata solo dopo la conferma del pagamento.

## Step proposti

- 1a: Guest checkout
- 1b: Idempotency guard
- 2a: Discount rules
- 2b: Inventory check
- 3a: Payment webhook
- 3b: Recovery policy

## Decisioni aperte

- La spec non definisce una politica per le email sui carrelli abbandonati.

Questa spec è una fixture per la demo. Le decisioni aperte non costituiscono regole già approvate.
