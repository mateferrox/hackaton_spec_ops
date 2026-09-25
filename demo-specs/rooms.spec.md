# Sale riunioni

Versione: 1.0

Un’app per vedere la disponibilità delle sale, prenotare e gestire le proprie riunioni.

## Regole esplicite

1. Solo gli utenti registrati possono prenotare.
2. Le prenotazioni avvengono in slot di 30 minuti, anche consecutivi.
3. È possibile cancellare fino a 24 ore prima dell’inizio.
4. Una sala non può avere due prenotazioni sovrapposte.
5. I nomi dei partecipanti sono visibili solo a chi ha prenotato e agli amministratori.

## Step proposti

- 1a: Access policy
- 1b: Slot model
- 2a: Cancellation guard
- 2b: Atomic booking
- 3a: Attendee ACL
- 3b: Reminder policy

## Decisioni aperte

- La spec non stabilisce se inviare promemoria, né quando.

Questa spec è una fixture per la demo. Le decisioni aperte non costituiscono regole già approvate.
