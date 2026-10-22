const FENCE_OPEN_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const BARE_DISPLAY_MATH_RE = /^([ \t]*)\[\s*(.*?)\s*\]([ \t]*)$/;

function hasLatexSignal(value: string): boolean {
  return /\\[A-Za-z]+/.test(value) || /[{}][_^]|[_^]\{/.test(value);
}

function normalizeLatexDelimiters(value: string): string {
  let output = '';
  let cursor = 0;

  while (cursor < value.length) {
    if (value[cursor] === '`') {
      let runLength = 1;
      while (value[cursor + runLength] === '`') runLength++;
      const delimiter = '`'.repeat(runLength);
      const close = value.indexOf(delimiter, cursor + runLength);
      if (close === -1) {
        output += value.slice(cursor);
        break;
      }
      output += value.slice(cursor, close + runLength);
      cursor = close + runLength;
      continue;
    }

    if (value.startsWith('\\(', cursor)) {
      const close = value.indexOf('\\)', cursor + 2);
      if (close !== -1) {
        output += `$${value.slice(cursor + 2, close)}$`;
        cursor = close + 2;
        continue;
      }
    }

    if (value.startsWith('\\[', cursor)) {
      const close = value.indexOf('\\]', cursor + 2);
      if (close !== -1) {
        const formula = value.slice(cursor + 2, close).trim();
        output += `\n\n$$\n${formula}\n$$\n\n`;
        cursor = close + 2;
        continue;
      }
    }

    output += value[cursor];
    cursor++;
  }

  return output;
}

function normalizeProseSegment(value: string): string {
  const delimited = normalizeLatexDelimiters(value);
  return delimited
    .split('\n')
    .flatMap((line) => {
      const match = BARE_DISPLAY_MATH_RE.exec(line);
      const formula = match?.[2] ?? '';
      if (!match || !hasLatexSignal(formula)) return [line];
      return [`${match[1]}$$`, formula, `$$${match[3]}`];
    })
    .join('\n');
}

/**
 * Normalize the math delimiters commonly emitted by chat models to the dollar
 * delimiters understood by remark-math. Fenced and inline code stays byte-for-
 * byte unchanged, and a bare `[ ... ]` line is promoted only with a strong
 * LaTeX signal such as a command or braced sub/superscript.
 */
export function normalizeChatMath(markdown: string): string {
  const lines = markdown.split('\n');
  const output: string[] = [];
  let prose: string[] = [];
  let fence: { char: string; length: number } | null = null;

  const flushProse = () => {
    if (prose.length === 0) return;
    output.push(normalizeProseSegment(prose.join('\n')));
    prose = [];
  };

  for (const line of lines) {
    const marker = FENCE_OPEN_RE.exec(line)?.[1];
    if (fence) {
      output.push(line);
      if (marker?.[0] === fence.char && marker.length >= fence.length) fence = null;
      continue;
    }
    if (marker) {
      flushProse();
      fence = { char: marker[0] ?? '`', length: marker.length };
      output.push(line);
      continue;
    }
    prose.push(line);
  }
  flushProse();

  return output.join('\n');
}
