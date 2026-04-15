export function hasRenderablePosition(node) {
  return node?.x != null && node?.y != null;
}

export function resolveCanvasDimensions({ width, height, dpr, entry }) {
  const cssWidth = Math.max(1, Math.round(width));
  const cssHeight = Math.max(1, Math.round(height));
  const fallbackDpr = Math.max(dpr || 1, 1);
  const fallbackPixelWidth = Math.max(1, Math.round(cssWidth * fallbackDpr));
  const fallbackPixelHeight = Math.max(1, Math.round(cssHeight * fallbackDpr));

  const devicePixelSize = entry?.devicePixelContentBoxSize?.[0];
  if (devicePixelSize?.inlineSize && devicePixelSize?.blockSize) {
    const pixelWidth = Math.max(
      1,
      Math.round(devicePixelSize.inlineSize),
      fallbackPixelWidth,
    );
    const pixelHeight = Math.max(
      1,
      Math.round(devicePixelSize.blockSize),
      fallbackPixelHeight,
    );

    return {
      cssWidth,
      cssHeight,
      pixelWidth,
      pixelHeight,
      effectiveDpr: Math.max(pixelWidth / cssWidth, fallbackDpr),
    };
  }

  return {
    cssWidth,
    cssHeight,
    pixelWidth: fallbackPixelWidth,
    pixelHeight: fallbackPixelHeight,
    effectiveDpr: fallbackDpr,
  };
}

export function getEdgeRenderStyle(edgeType, scale) {
  const safeScale = Math.max(scale || 1, 0.0001);
  const baseLineWidth = edgeType === 'directory' ? 0.5 : 0.6;

  return {
    lineWidth: baseLineWidth / safeScale,
    lineDash: edgeType === 'ref' ? [3 / safeScale, 3 / safeScale] : [],
  };
}

export function prepareCanvasFrame(ctx, canvas, dpr) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
