import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ open, onClose, labelledBy, children, className = '', title, message, primaryText = 'OK', onPrimary, variant = 'notice' }) {
  // Create a stable container element for the portal. Creating it here ensures the
  // same element is used across renders which prevents the modal DOM from being
  // recreated and losing focus on inner inputs during re-renders.
  const rootRef = useRef(typeof document !== 'undefined' ? document.createElement('div') : null);
  const previouslyFocused = useRef(null);
  // Keep a ref to the latest onClose so the effect below doesn't need to re-run when
  // the parent provides a new inline callback on every render (which would cause
  // the portal to be torn down and recreated and inputs to lose focus).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current = document.activeElement;
    const el = rootRef.current;
    if (el && !document.body.contains(el)) document.body.appendChild(el);

    const handleKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current && onCloseRef.current();
      if (e.key === 'Tab') {
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
    setTimeout(() => {
      const first = el.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (first) first.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', handleKey);
      try { if (el && document.body.contains(el)) document.body.removeChild(el); } catch { /* ignore */ }
      if (previouslyFocused.current && previouslyFocused.current.focus) previouslyFocused.current.focus();
    };
  }, [open]);

  if (!open) return null;

  const handlePrimary = () => {
    try {
      if (typeof onPrimary === 'function') onPrimary();
    } finally {
      if (typeof onCloseRef.current === 'function') onCloseRef.current();
    }
  };

  // Render content based on variant - hardcoded for Tailwind to scan
  const renderDefaultContent = () => {
    if (React.Children.count(children) > 0) return null;

    const commonClasses = "rounded-xl p-4 shadow-lg";
    const iconClasses = "mt-1 flex h-9 w-9 items-center justify-center rounded-full";
    const svgClasses = "h-5 w-5";

    const content = (
      <div className={`relative z-10 w-full max-w-md transform overflow-hidden rounded-lg p-4 ${className}`} role="document">
        {variant === 'success' ? (
          <div className={`${commonClasses} bg-gradient-to-br from-emerald-50/80 to-white border border-emerald-100`}>
            <div className="flex items-start gap-3">
              <div className={`${iconClasses} bg-emerald-100`}>
                <svg className={`${svgClasses} text-emerald-600`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                {title && <h3 id={labelledBy} className="text-base font-semibold text-emerald-700">{title}</h3>}
                {message && <p className="mt-2 text-sm text-slate-700 leading-relaxed">{message}</p>}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={handlePrimary} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white shadow focus:outline-none focus:ring-2 focus:ring-emerald-200">
                {primaryText}
              </button>
            </div>
          </div>
        ) : variant === 'warning' ? (
          <div className={`${commonClasses} bg-gradient-to-br from-amber-50/80 to-white border border-amber-100`}>
            <div className="flex items-start gap-3">
              <div className={`${iconClasses} bg-amber-100`}>
                <svg className={`${svgClasses} text-amber-600`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                {title && <h3 id={labelledBy} className="text-base font-semibold text-amber-700">{title}</h3>}
                {message && <p className="mt-2 text-sm text-slate-700 leading-relaxed">{message}</p>}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={handlePrimary} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white shadow focus:outline-none focus:ring-2 focus:ring-amber-200">
                {primaryText}
              </button>
            </div>
          </div>
        ) : variant === 'error' ? (
          <div className={`${commonClasses} bg-gradient-to-br from-red-50/80 to-white border border-red-100`}>
            <div className="flex items-start gap-3">
              <div className={`${iconClasses} bg-red-100`}>
                <svg className={`${svgClasses} text-red-600`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                {title && <h3 id={labelledBy} className="text-base font-semibold text-red-700">{title}</h3>}
                {message && <p className="mt-2 text-sm text-slate-700 leading-relaxed">{message}</p>}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={handlePrimary} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-400 text-white shadow focus:outline-none focus:ring-2 focus:ring-red-200">
                {primaryText}
              </button>
            </div>
          </div>
        ) : (
          // Default notice variant (rose)
          <div className={`${commonClasses} bg-gradient-to-br from-rose-50/80 to-white border border-rose-100`}>
            <div className="flex items-start gap-3">
              <div className={`${iconClasses} bg-rose-100`}>
                <svg className={`${svgClasses} text-rose-600`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11.414V10a1 1 0 11-2 0V6.586L7.293 8.293a1 1 0 01-1.414-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 6.586z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                {title && <h3 id={labelledBy} className="text-base font-semibold text-rose-700">{title}</h3>}
                {message && <p className="mt-2 text-sm text-slate-700 leading-relaxed">{message}</p>}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={handlePrimary} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white shadow focus:outline-none focus:ring-2 focus:ring-rose-200">
                {primaryText}
              </button>
            </div>
          </div>
        )}
      </div>
    );

    return content;
  };

  const defaultContent = renderDefaultContent();

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
  <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => onCloseRef.current && onCloseRef.current()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative z-10 w-full flex items-center justify-center"
      >
        {React.Children.count(children) > 0 ? children : defaultContent}
      </div>
    </div>
  );

  // Use our stable container element as the portal target so the DOM for the
  // modal doesn't get recreated across renders which can cause inputs to lose focus.
  return createPortal(modal, rootRef.current || document.body);
}
