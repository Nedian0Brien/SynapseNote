import '@testing-library/jest-dom/vitest';

HTMLCanvasElement.prototype.getContext = () => ({
  setTransform() {},
  clearRect() {},
  save() {},
  restore() {},
  translate() {},
  scale() {},
  beginPath() {},
  arc() {},
  fill() {},
  moveTo() {},
  lineTo() {},
  stroke() {},
  setLineDash() {},
  fillText() {},
});

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = MockResizeObserver;
window.ResizeObserver = MockResizeObserver;
