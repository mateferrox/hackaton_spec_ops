// Frontend fixtures only. Grok can replace this catalog with generated questions
// without changing the zen renderer. These are not presented as live LLM output.
const choice = (label, assessment, instruction = label) => ({ label, assessment, instruction });

export const DEMO_SPECS = [
  {
    id: 'meeting-rooms', filename: 'rooms.spec.md', title: 'Sale riunioni', version: '1.0',
    description: 'Accessi, prenotazioni e piccoli imprevisti quotidiani.',
    summary: 'Un’app per vedere la disponibilità delle sale, prenotare e gestire le proprie riunioni.',
    rules: [
      'Solo gli utenti registrati possono prenotare.',
      'Le prenotazioni avvengono in slot di 30 minuti, anche consecutivi.',
      'È possibile cancellare fino a 24 ore prima dell’inizio.',
      'Una sala non può avere due prenotazioni sovrapposte.',
      'I nomi dei partecipanti sono visibili solo a chi ha prenotato e agli amministratori.',
    ],
    questions: [
      { id: 'rooms-access', task: 'Access policy', title: ['Giulia è arrivata.', 'Ma non ha un account.'], question: 'La lasci prenotare lo stesso?', ruleIndex: 0,
        reason: 'Consentire gli ospiti cambierebbe il controllo accessi e tutto il percorso di prenotazione.',
        choices: [choice('Sì, falla entrare', 'conflict'), choice('Prima deve accedere', 'aligned')] },
      { id: 'rooms-duration', task: 'Slot model', title: ['Marco ha bisogno', 'di un’ora, tutta sua.'], question: 'Come gli prenoti la sala?', ruleIndex: 1,
        reason: 'Creare un nuovo formato da un’ora cambierebbe la granularità del calendario.',
        choices: [choice('Due slot da 30 minuti', 'aligned'), choice('Crea uno slot da un’ora', 'conflict')] },
      { id: 'rooms-cancellation', task: 'Cancellation guard', title: ['Sara ha un imprevisto.', 'La riunione è tra 10 minuti.'], question: 'Può ancora cancellare?', ruleIndex: 2,
        reason: 'La risposta cambia la policy di cancellazione e le condizioni comunicate agli utenti.',
        choices: [choice('Sì, annulla la prenotazione', 'conflict'), choice('Mantieni il limite di 24 ore', 'aligned')] },
      { id: 'rooms-overlap', task: 'Atomic booking', title: ['Due colleghi. Una sala.', 'Lo stesso istante.'], question: 'Luca e Anna prenotano le 15:00 insieme. Cosa succede?', ruleIndex: 3,
        reason: 'Accettare entrambe le richieste produrrebbe una doppia prenotazione. Il controllo deve essere atomico.',
        choices: [choice('Conferma solo la prima', 'aligned'), choice('Conferma entrambe', 'conflict')] },
      { id: 'rooms-privacy', task: 'Attendee ACL', title: ['Una riunione riservata.', 'Un calendario condiviso.'], question: 'Paolo vede la sala occupata. Può leggere chi partecipa?', ruleIndex: 4,
        reason: 'Mostrare i nomi a tutti gli utenti allargherebbe i permessi sui dati della prenotazione.',
        choices: [choice('Sì, mostra tutti i nomi', 'conflict'), choice('Mostra solo “Occupata”', 'aligned')] },
      { id: 'rooms-reminder', task: 'Reminder policy', title: ['La sala è pronta.', 'Elena si è dimenticata.'], question: 'Vuoi inviarle un promemoria prima della riunione?', ruleIndex: null,
        gap: 'La spec non stabilisce se inviare promemoria, né quando.',
        reason: 'È una nuova decisione di prodotto. Va formalizzata prima di aggiungere notifiche.',
        choices: [choice('Invia un’email 15 minuti prima', 'unspecified', 'Inviare un promemoria email 15 minuti prima della riunione.'), choice('Nessun promemoria automatico', 'unspecified', 'Non inviare promemoria automatici per le riunioni.')] },
    ],
  },
  {
    id: 'shop-checkout', filename: 'checkout.spec.md', title: 'Checkout e-commerce', version: '1.0',
    description: 'Ordini, pagamenti e gli errori che costano davvero.',
    summary: 'Il checkout di un piccolo negozio online: acquisto, disponibilità, sconti e conferma dell’ordine.',
    rules: [
      'È possibile acquistare senza creare un account, fornendo un indirizzo email.',
      'Richieste ripetute con lo stesso identificativo di pagamento devono produrre un solo addebito e un solo ordine.',
      'È possibile applicare un solo codice sconto per ordine.',
      'Un ordine può essere confermato solo se tutti gli articoli risultano disponibili.',
      'L’email di conferma dell’ordine viene inviata solo dopo la conferma del pagamento.',
    ],
    questions: [
      { id: 'shop-guest', task: 'Guest checkout', title: ['Arianna ha scelto.', 'Vuole solo pagare.'], question: 'Non vuole registrarsi. La lasci completare l’acquisto?', ruleIndex: 0,
        reason: 'Imporre la registrazione bloccherebbe un percorso di acquisto espressamente consentito.',
        choices: [choice('Sì, basta la sua email', 'aligned'), choice('Prima deve creare un account', 'conflict')] },
      { id: 'shop-retry', task: 'Idempotency guard', title: ['La rete si interrompe.', 'Davide preme di nuovo.'], question: 'La richiesta ha lo stesso ID. Crei un altro ordine?', ruleIndex: 1,
        reason: 'Un secondo ordine o addebito violerebbe l’idempotenza richiesta dal checkout.',
        choices: [choice('Sì, è un nuovo tentativo', 'conflict'), choice('Recupera il primo risultato', 'aligned')] },
      { id: 'shop-discount', task: 'Discount rules', title: ['Un codice di benvenuto.', 'E uno per il compleanno.'], question: 'Noemi vuole usarli entrambi nello stesso ordine.', ruleIndex: 2,
        reason: 'Sommare i due codici introdurrebbe una regola di cumulabilità vietata dalla spec.',
        choices: [choice('Falle scegliere un codice', 'aligned'), choice('Applica entrambi gli sconti', 'conflict')] },
      { id: 'shop-stock', task: 'Inventory check', title: ['L’ultima tazza è sparita.', 'Era ancora nel carrello.'], question: 'Il magazzino ora segna zero. Confermi comunque l’ordine?', ruleIndex: 3,
        reason: 'Confermare un articolo esaurito aprirebbe un percorso di arretrati che la spec non autorizza.',
        choices: [choice('Conferma e spediscila più avanti', 'conflict'), choice('Chiedi di aggiornare il carrello', 'aligned')] },
      { id: 'shop-email', task: 'Payment webhook', title: ['La banca sta rispondendo.', 'L’email è già pronta.'], question: 'Invii la conferma mentre il pagamento è ancora in attesa?', ruleIndex: 4,
        reason: 'L’email comunicherebbe un ordine confermato prima della condizione richiesta dalla spec.',
        choices: [choice('Aspetta il pagamento confermato', 'aligned'), choice('Invia subito la conferma', 'conflict')] },
      { id: 'shop-abandoned', task: 'Recovery policy', title: ['Una scelta rimasta a metà.', 'Il carrello aspetta ancora.'], question: 'Dopo un giorno, vuoi inviare un’email per ricordarlo?', ruleIndex: null,
        gap: 'La spec non definisce una politica per le email sui carrelli abbandonati.',
        reason: 'Frequenza, contenuto e condizioni di invio richiedono una nuova regola approvata.',
        choices: [choice('Non inviare email automatiche', 'unspecified', 'Non inviare email automatiche per i carrelli abbandonati.'), choice('Proponi un promemoria dopo 24 ore', 'unspecified', 'Valutare un promemoria dopo 24 ore, definendo prima le condizioni di invio.')] },
    ],
  },
];

for (const spec of DEMO_SPECS) {
  spec.questions.forEach((question, index) => { question.stepId = ['1a', '1b', '2a', '2b', '3a', '3b'][index]; });
}
