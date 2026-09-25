import { useEffect, useRef, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';

export default function Dialog({ open, title, onClose, children, wide = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog?.close();
  }, [open]);
  return <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} aria-labelledby="dialog-title" onCancel={onClose} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-content"><header className="dialog-header"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="Chiudi finestra" onClick={onClose}><X size={20} /></button></header>{children}</div>
  </dialog>;
}
