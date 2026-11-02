// Små genbrugelige UI-byggesten: ikoner, modal, forankret panel, toasts, initialmærker.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { deepen } from '../../shared/colors';
import type { Teacher } from '../../shared/schema';

const paths: Record<string, string> = {
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'm15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  plus: 'M12 5v14M5 12h14',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  x: 'M18 6 6 18M6 6l12 12',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  move: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  filter: 'M22 3H2l8 9.5V19l4 2v-8.5z',
  check: 'M20 6 9 17l-5-5',
  cloudOff: 'M2 2l20 20M5.8 5.8A7 7 0 0 0 6 20h11a4.5 4.5 0 0 0 2.4-.7M22 15.5A4.5 4.5 0 0 0 17.5 11h-1.3A7 7 0 0 0 9.4 5.2',
  loader: 'M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.2 16.2l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.2 7.8l2.8-2.8',
  panelRight: 'M3 3h18v18H3zM15 3v18',
  panelBottom: 'M3 3h18v18H3zM3 15h18',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12',
  keyboard: 'M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  chevronDown: 'm6 9 6 6 6-6',
  archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
  up: 'm18 15-6-6-6 6',
  down: 'm6 9 6 6 6-6',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
};

export function Icon({ name, size = 16, className }: { name: keyof typeof paths | string; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? ''} />
    </svg>
  );
}

export function TeacherChip({ teacher, small }: { teacher: Pick<Teacher, 'initials' | 'color' | 'archived'> | undefined; small?: boolean }) {
  if (!teacher) return <span className="chip">?</span>;
  return (
    <span
      className={`chip${small ? ' chip-sm' : ''}${teacher.archived ? ' chip-archived' : ''}`}
      style={{ background: teacher.color, borderColor: deepen(teacher.color, 0.35), color: '#1d2230' }}
      title={teacher.archived ? 'Arkiveret lærer' : undefined}
    >
      {teacher.initials}
    </span>
  );
}

// ---- Modal -------------------------------------------------------------------
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
  labelledBy,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useFocusTrap(ref);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? 'modal-title'}>
        <header className="modal-head">
          <h2 id={labelledBy ?? 'modal-title'}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Luk">
            <Icon name="x" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** Kompakt panel placeret ved et element (fx en blok). På små skærme vises det som et ark nederst. */
export function Anchored({
  anchor,
  onClose,
  children,
  label,
  width = 400,
}: {
  anchor: DOMRect | null;
  onClose: () => void;
  children: ReactNode;
  label: string;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEscape(onClose);
  useFocusTrap(ref);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw < 640) return setPos(null);
      const h = el.offsetHeight;
      const w = Math.min(width, vw - 24);
      let left: number;
      let top: number;
      if (!anchor) {
        left = (vw - w) / 2;
        top = Math.max(12, (vh - h) / 3);
      } else {
        left = anchor.right + 10;
        if (left + w > vw - 12) left = anchor.left - w - 10;
        if (left < 12) left = Math.min(Math.max(12, anchor.left), vw - w - 12);
        top = anchor.top - 8;
      }
      top = Math.max(12, Math.min(top, vh - h - 12));
      setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
    };
    place();
    // Genplacér, når indholdet vokser (fx fejlbeskeder), så panelet altid er synligt.
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [anchor, width]);
  return (
    <div className="overlay overlay-light" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className="anchored"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={pos ? { left: pos.left, top: pos.top, width: Math.min(width, window.innerWidth - 24) } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

// Kun det øverste åbne lag reagerer på Escape.
const escapeStack: React.RefObject<() => void>[] = [];
if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !escapeStack.length) return;
      e.stopPropagation();
      e.preventDefault();
      escapeStack[escapeStack.length - 1].current?.();
    },
    true,
  );
}
export const escapeLayerOpen = () => escapeStack.length > 0;

export function useEscape(fn: () => void, active = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    escapeStack.push(ref);
    return () => {
      const i = escapeStack.lastIndexOf(ref);
      if (i >= 0) escapeStack.splice(i, 1);
    };
  }, [active]);
}

function useFocusTrap(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('input,select,textarea,button:not(.icon-btn)');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>('button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(
        (x) => !x.hasAttribute('disabled') && x.offsetParent !== null,
      );
      if (!items.length) return;
      const a = items[0];
      const b = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        b.focus();
      } else if (!e.shiftKey && document.activeElement === b) {
        e.preventDefault();
        a.focus();
      }
    };
    el?.addEventListener('keydown', onKey);
    return () => {
      el?.removeEventListener('keydown', onKey);
      if (prev && document.contains(prev)) prev.focus();
    };
  }, [ref]);
}

// ---- Toasts ------------------------------------------------------------------
export interface Toast {
  id: number;
  text: string;
  kind?: 'info' | 'error' | 'success';
  action?: { label: string; run: () => void };
}

let toastSeq = 0;
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (t: Omit<Toast, 'id'>, ms = 5000) => {
    const id = ++toastSeq;
    setToasts((list) => [...list.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), ms);
  };
  const dismiss = (id: number) => setToasts((list) => list.filter((x) => x.id !== id));
  return { toasts, push, dismiss };
}

export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind ?? 'info'}`}>
          <span>{t.text}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="icon-btn icon-btn-sm" onClick={() => dismiss(t.id)} aria-label="Luk besked">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function useMediaQuery(q: string) {
  const [match, setMatch] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const h = () => setMatch(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, [q]);
  return match;
}
