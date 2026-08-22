/**
 * Image-style lightbox for rendered HTML previews.
 *
 * `react-medium-image-zoom` only accepts image-shaped children, but its
 * lightbox contract is the product precedent for expanded media. This uses
 * the same native-dialog structure and `data-rmiz-*` styling hooks so HTML
 * previews inherit the identical overlay, circular minimize control, theme
 * override, Escape behavior, and body-scroll lock without pretending an
 * iframe is an image.
 */

import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TRANSITION_MS = 300;

function imageZoomPortal(): HTMLElement {
  const existing = document.querySelector<HTMLElement>('[data-rmiz-portal]');
  if (existing) return existing;
  const portal = document.createElement('div');
  portal.setAttribute('data-rmiz-portal', '');
  document.body.appendChild(portal);
  return portal;
}

function MinimizeImageIcon() {
  return (
    <svg
      aria-hidden="true"
      data-rmiz-btn-unzoom-icon
      fill="currentColor"
      focusable="false"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M 14.144531 1.148438 L 9 6.292969 L 9 3 L 8 3 L 8 8 L 13 8 L 13 7 L 9.707031 7 L 14.855469 1.851563 Z M 8 8 L 3 8 L 3 9 L 6.292969 9 L 1.148438 14.144531 L 1.851563 14.855469 L 7 9.707031 L 7 13 L 8 13 Z" />
    </svg>
  );
}

interface HtmlPreviewLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  srcDoc: string;
  onFrameLoad?: (frame: HTMLIFrameElement) => void;
}

export function HtmlPreviewLightbox({
  open,
  onOpenChange,
  title,
  srcDoc,
  onFrameLoad,
}: HtmlPreviewLightboxProps) {
  const { t } = useLingui();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const previousBodyStyleRef = useRef({ overflow: '', width: '' });
  const [present, setPresent] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      setPresent(true);
      return;
    }
    setVisible(false);
    if (!present) return;
    closeTimerRef.current = window.setTimeout(() => setPresent(false), TRANSITION_MS);
  }, [open, present]);

  useEffect(() => {
    if (!present) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    previousBodyStyleRef.current = {
      overflow: document.body.style.overflow,
      width: document.body.style.width,
    };
    document.body.style.overflow = 'hidden';
    document.body.style.width = `${document.body.clientWidth}px`;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');

    const frame = requestAnimationFrame(() => setVisible(true));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
    };
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown, true);
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      else dialog.removeAttribute('open');
      document.body.style.overflow = previousBodyStyleRef.current.overflow;
      document.body.style.width = previousBodyStyleRef.current.width;
    };
  }, [onOpenChange, present]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  if (!present) return null;

  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: the document-level capture listener above implements the image lightbox's Escape contract
    <dialog
      aria-label={title}
      aria-modal="true"
      data-rmiz-modal
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === contentRef.current) onOpenChange(false);
      }}
      ref={dialogRef}
    >
      <div data-rmiz-modal-overlay={visible ? 'visible' : 'hidden'} />
      <div
        data-ok-html-preview-lightbox={visible ? 'visible' : 'hidden'}
        data-rmiz-modal-content
        ref={contentRef}
      >
        <iframe
          title={title}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
          className="ok-html-preview-lightbox-frame"
          onLoad={(event) => onFrameLoad?.(event.currentTarget)}
        />
        <button
          type="button"
          aria-label={t`Minimize HTML preview`}
          data-rmiz-btn-unzoom
          onClick={() => onOpenChange(false)}
        >
          <MinimizeImageIcon />
        </button>
      </div>
    </dialog>,
    imageZoomPortal(),
  );
}
