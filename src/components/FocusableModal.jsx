import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export default function FocusableModal({
  isOpen,
  onClose,
  children,
  ariaLabelledBy,
  ariaLabel,
  overlayClassName = 'bg-black/50 backdrop-blur-sm',
  initialFocusRef,
}) {
  const overlayRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedRef.current = document.activeElement;

    const findFocusables = () => {
      const root = overlayRef.current;
      if (!root) return [];
      return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 || rect.height > 0;
      });
    };

    // Defer initial focus to next tick so children have mounted.
    const focusTimerId = window.setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }
      const [first] = findFocusables();
      first?.focus();
    }, 0);

    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = findFocusables();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => {
      window.clearTimeout(focusTimerId);
      window.removeEventListener('keydown', handleKey);
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        try { prev.focus(); } catch { /* element may have been unmounted */ }
      }
    };
  }, [isOpen, onClose, initialFocusRef]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
      aria-label={ariaLabelledBy ? undefined : ariaLabel}
      onClick={handleOverlayClick}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn ${overlayClassName}`}
    >
      {children}
    </div>
  );
}
