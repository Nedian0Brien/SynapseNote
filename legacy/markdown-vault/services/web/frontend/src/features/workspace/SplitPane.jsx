import { useEffect, useMemo, useRef, useState } from 'react';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function SplitPane({
  left,
  right,
  initialRatio = 0.4,
  minLeft = 280,
  minRight = 360,
  storageKey,
}) {
  const containerRef = useRef(null);
  const [ratio, setRatio] = useState(() => {
    const stored = storageKey ? Number(localStorage.getItem(storageKey)) : Number.NaN;
    return Number.isFinite(stored) ? stored : initialRatio;
  });

  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, String(ratio));
  }, [ratio, storageKey]);

  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [ratio]);

  const gridTemplateColumns = useMemo(() => (
    `${Math.round(ratio * 1000)}fr 10px ${Math.round((1 - ratio) * 1000)}fr`
  ), [ratio]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const totalWidth = rect.width;
      if (!totalWidth) return;

      const nextRatio = clamp(
        (event.clientX - rect.left) / totalWidth,
        minLeft / totalWidth,
        1 - (minRight / totalWidth),
      );
      setRatio(nextRatio);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    const handlePointerDown = () => {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    };

    const divider = containerRef.current?.querySelector('.split-divider');
    divider?.addEventListener('pointerdown', handlePointerDown);

    return () => {
      divider?.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [minLeft, minRight]);

  return (
    <div
      ref={containerRef}
      className="split-pane"
      style={{ gridTemplateColumns }}
    >
      <div className="split-panel split-panel-left">{left}</div>
      <div className="split-divider" role="separator" aria-orientation="vertical">
        <span className="split-grip" />
      </div>
      <div className="split-panel split-panel-right">{right}</div>
    </div>
  );
}
