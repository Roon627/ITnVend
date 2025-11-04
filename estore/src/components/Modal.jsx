import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ open, onClose, labelledBy, children, className = '' }) {
  const rootRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current = document.activeElement;
    // create a container if not present
    if (!rootRef.current) rootRef.current = document.createElement('div');
    const el = rootRef.current;
    document.body.appendChild(el);

    const handleKey = (e) => {
      if (e.key === 'Escape') onClose && onClose();
      if (e.key === 'Tab') {
        // basic focus trap - keep focus inside the modal
        const focusable = el.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKey);

    // delay setting focus to allow DOM to render
    setTimeout(() => {
      const first = el.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (first) first.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', handleKey);
      try { document.body.removeChild(el); } catch { /* ignore */ }
      if (previouslyFocused.current && previouslyFocused.current.focus) previouslyFocused.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => onClose && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative z-10 w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white shadow-xl transition-all duration-200 ease-out scale-95 opacity-0 animate-open ${className}`}
      >
        {children}
      </div>
      <style>{`@keyframes open { from { transform: translateY(6px) scale(.98); opacity: 0 } to { transform: translateY(0) scale(1); opacity: 1 } } .animate-open { animation: open 180ms cubic-bezier(.2,.9,.3,1) forwards }`}</style>
    </div>
  );

  return createPortal(modal, document.body);
}
