import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, CheckCircle, Fingerprint, GitBranch, ShieldCheck, Timer, ArrowUUpLeft, Sparkle } from '@phosphor-icons/react';
import type { Assumption, Choice } from './contracts';

interface Props {
  assumption: Assumption;
  index: number;
  total: number;
  selected: Choice | undefined;
  savedChoiceId: string | undefined;
  affectedCount: number;
  busy: boolean;
  error: string;
  onSelect: (id: string) => void;
  onCommit: () => void;
  onSkip: () => void;
}
const symbols = [Fingerprint, Timer, ArrowUUpLeft];
export default function DecisionCard(props: Props) {
  const { assumption: a, selected, index } = props;
  const Symbol = symbols[index % symbols.length];
  const isChanged = selected?.effect === 'revise';
  return <AnimatePresence mode="wait">
    <motion.section key={a.id} className="decision-card" aria-labelledby="decision-title"
      initial={{ opacity: 0, x: 22, filter: 'blur(4px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: -16, filter: 'blur(4px)' }} transition={{ duration: .26, ease: [.22, 1, .36, 1] }}>
      <div className="decision-meta"><span><span className="signal-dot" /> DECISIONE {String(index + 1).padStart(2, '0')}<span className="dim"> / {String(props.total).padStart(2, '0')}</span></span><Sparkle size={17} /></div>
      <div className="decision-symbol"><Symbol size={29} weight="light" /><span>{a.title}</span></div>
      <h2 id="decision-title">{a.question}</h2>
      <div className="assumption-quote"><span>L’AGENTE HA ASSUNTO</span><p>“{a.statement}”</p></div>
      <p className="decision-context">{a.whyItMatters}</p>
      <div className="choices" role="group" aria-label="Scegli la regola">
        {a.choices.map((choice, i) => <button key={choice.id} className={`choice ${selected?.id === choice.id ? 'choice-selected' : ''}`}
          aria-pressed={selected?.id === choice.id} disabled={props.busy} onClick={() => props.onSelect(choice.id)}>
          <span className="choice-key">{i + 1}</span><span className="choice-copy">{choice.label}<small>{choice.effect === 'confirm' ? 'Conferma l’assunzione' : 'Cambia la regola'}</small></span>
          <span className="choice-indicator">{selected?.id === choice.id && <Check size={12} weight="bold" />}</span>
        </button>)}
      </div>
      <div className={`impact-preview ${isChanged ? 'impact-warning' : ''}`} aria-live="polite">
        {selected ? <>{isChanged ? <GitBranch size={16} /> : <ShieldCheck size={16} />}<span>{isChanged ? `${props.affectedCount} task da rivalutare` : 'Il piano mantiene questa regola'}</span><span className="preview-label">ANTEPRIMA</span></> : <><GitBranch size={16} /><span>Scegli e osserva le conseguenze</span></>}
      </div>
      {props.error && <p className="inline-error" role="alert">{props.error}</p>}
      <button className="primary-button decision-commit" disabled={!selected || props.busy} onClick={props.onCommit}>
        <span>{props.busy ? 'Trasmissione in corso…' : props.savedChoiceId ? 'Aggiorna decisione' : 'Conferma decisione'}</span>{props.savedChoiceId ? <CheckCircle size={20} /> : <ArrowRight size={20} />}
      </button>
      <button className="defer-button" onClick={props.onSkip} disabled={props.busy}>Decidi dopo <ArrowRight size={13} /></button>
    </motion.section>
  </AnimatePresence>;
}
