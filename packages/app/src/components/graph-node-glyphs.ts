/**
 * The marks the original SynapseNote graph drew inside its nodes.
 *
 * It used a font — `Material Symbols Outlined`, rendering the ligatures
 * `folder` and `article` — which this app does not load and should not start
 * loading for two icons on a canvas. They are drawn as paths instead: the same
 * two shapes, sized in world units the same way, and immune to the failure
 * mode a missing icon font has, which is to render the literal word "folder"
 * inside every directory.
 *
 * Both are drawn centred on (x, y) in a box `size` across, in the current
 * `fillStyle` / `strokeStyle`.
 */

/** A folder: the tab, then the body. Filled, as the original's glyph was. */
export function drawGraphFolderGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const half = size / 2;
  const top = y - half * 0.62;
  const bottom = y + half * 0.66;
  const left = x - half;
  const right = x + half;
  const tabRight = x - half * 0.12;

  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(left, top);
  ctx.lineTo(tabRight, top);
  // The notch that makes it read as a folder rather than as a rectangle.
  ctx.lineTo(tabRight + half * 0.2, top + half * 0.28);
  ctx.lineTo(right, top + half * 0.28);
  ctx.lineTo(right, bottom);
  ctx.closePath();
  ctx.fill();
}

/**
 * A document: an outlined page with its top-right corner turned down, and
 * three lines of text. Stroked rather than filled — at eight world units a
 * solid rectangle is just a darker dot.
 */
export function drawGraphArticleGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  lineWidth: number,
): void {
  const halfWidth = size * 0.36;
  const halfHeight = size / 2;
  const left = x - halfWidth;
  const right = x + halfWidth;
  const top = y - halfHeight;
  const bottom = y + halfHeight;
  const fold = size * 0.28;

  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right - fold, top);
  ctx.lineTo(right, top + fold);
  ctx.lineTo(right, bottom);
  ctx.lineTo(left, bottom);
  ctx.closePath();
  ctx.stroke();

  // Three ruled lines, inset from the edges and skipping the folded corner.
  ctx.beginPath();
  for (let index = 0; index < 3; index += 1) {
    const lineY = top + fold + ((bottom - top - fold) * (index + 1)) / 4;
    ctx.moveTo(left + size * 0.12, lineY);
    ctx.lineTo(right - size * 0.12, lineY);
  }
  ctx.stroke();
}
