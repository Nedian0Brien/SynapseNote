// morrow's canvas drawing helpers, strokePath and inkColor from src/app/components/CanvasView.tsx, run on fixed
// inputs; the swift canvas compares with App/Tests/Fixtures/core/expected/canvas.json. The component itself
// pulls in the editor's modules, so the two functions and the colour table are taken from its source as they
// are and compiled on their own.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const out = process.argv[2] ?? '../App/Tests/Fixtures/core';
const source = readFileSync(join(process.cwd(), 'vendor/morrow/src/app/components/CanvasView.tsx'), 'utf8');

function take(pattern: RegExp, name: string): string {
  const match = pattern.exec(source);
  if (!match) throw new Error(`${name} is no longer in CanvasView.tsx`);
  return match[0];
}

const pieces = [
  take(/const INK_COLORS[\s\S]*?\n\};\n/, 'INK_COLORS'),
  take(/export function inkColor[\s\S]*?\n\}\n/, 'inkColor'),
  take(/export function strokePath[\s\S]*?\n\}\n/, 'strokePath'),
].map((piece) => piece.replace(/^export /, ''));
const compiled = ts.transpileModule(`${pieces.join('\n')}\nreturn { inkColor, strokePath };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const { inkColor, strokePath } = new Function(compiled)() as {
  inkColor: (color: string | undefined) => string;
  strokePath: (points: number[]) => string;
};

const strokes: number[][] = [
  [],
  [5],
  [1, 2],
  [1, 2, 3.5, 4],
  [0, 0, 10, 5, 20, -3.25],
  [0, 0, 10, 5, 20, -3.25, 30, 7],
  [12.3, 45.6, 13.1, 46.2, 15.75, 48.1, 19.9, 52.4, 25.05, 58.8, 31.4, 63.3],
  [0.1, 0.2, 0.3, 0.4, 1e-7, 2e21, -0, 3],
];
const colors = [null, '1', '2', '3', '4', '5', '6', '7', '#abc', '#AABBCC80'];

writeFileSync(
  join(out, 'expected', 'canvas.json'),
  `${JSON.stringify(
    {
      strokePath: strokes.map((points) => ({ points, path: strokePath(points) })),
      inkColor: colors.map((color) => ({ color, ink: inkColor(color ?? undefined) })),
    },
    null,
    2,
  )}\n`,
);
console.log(`canvas: ${strokes.length} strokes, ${colors.length} colours`);
