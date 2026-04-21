/**
 * HelpTip — a small ? circle that shows a plain-English tooltip on click.
 *
 * Renders the popup via a React portal (into document.body) so it is never
 * clipped by parent overflow or panel boundaries. Uses position:fixed so it
 * is always within the viewport, auto-flipping between above and below the
 * icon based on available space.
 *
 * Usage:
 *   <HelpTip text="What this control does in plain language." />
 */

import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const POPUP_WIDTH = 260;
const POPUP_GAP   = 8;   // gap between icon and popup edge

interface HelpTipProps {
  text: string;
  /** legacy prop — ignored; positioning is now fully automatic */
  align?: string;
}

export const HelpTip: React.FC<HelpTipProps> = ({ text }) => {
  const [open, setOpen]         = useState(false);
  const [style, setStyle]       = useState<React.CSSProperties>({
    position: 'fixed', visibility: 'hidden', top: 0, left: 0, width: POPUP_WIDTH,
  });
  const iconRef  = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // ─── Position popup after it renders ──────────────────────────────────────
  useLayoutEffect(() => {
    if (!open || !iconRef.current || !popupRef.current) return;

    const icon  = iconRef.current.getBoundingClientRect();
    const popup = popupRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const H  = popup.height || 80; // fallback estimate

    // Vertical: prefer above, fall back to below
    const spaceAbove = icon.top  - POPUP_GAP;
    const spaceBelow = vh - icon.bottom - POPUP_GAP;
    let top: number;
    if (spaceAbove >= H || spaceAbove >= spaceBelow) {
      top = icon.top - H - POPUP_GAP;
    } else {
      top = icon.bottom + POPUP_GAP;
    }
    top = Math.max(8, Math.min(top, vh - H - 8));

    // Horizontal: centre on icon, clamp within viewport
    let left = icon.left + icon.width / 2 - POPUP_WIDTH / 2;
    left = Math.max(8, Math.min(left, vw - POPUP_WIDTH - 8));

    setStyle({ position: 'fixed', top, left, width: POPUP_WIDTH, visibility: 'visible' });
  }, [open]);

  // ─── Close on outside click or Escape ─────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (
        !iconRef.current?.contains(e.target as Node) &&
        !popupRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Reset to hidden so useLayoutEffect re-runs and re-positions
    setStyle({ position: 'fixed', visibility: 'hidden', top: 0, left: 0, width: POPUP_WIDTH });
    setOpen((v) => !v);
  }, []);

  return (
    <span className="helptip-wrap" ref={iconRef}>
      <span
        className={`helptip-icon${open ? ' open' : ''}`}
        onClick={toggle}
        tabIndex={0}
        role="button"
        aria-label="help"
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(e as unknown as React.MouseEvent); }}
      >?</span>

      {open && createPortal(
        <div ref={popupRef} className="helptip-popup" style={style}>
          <button className="helptip-close" onClick={() => setOpen(false)} aria-label="close">×</button>
          {text}
        </div>,
        document.body,
      )}
    </span>
  );
};
