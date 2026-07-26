import { createHash } from 'node:crypto';

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

export function turboGlobMatches(path: string, pattern: string): boolean {
  const normalizedPath = path.replaceAll('\\', '/').replace(/^\.\//, '');
  const normalizedPattern = pattern.replaceAll('\\', '/').replace(/^\.\//, '');
  let expression = '^';
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const character = normalizedPattern[index];
    if (character === '*' && normalizedPattern[index + 1] === '*') {
      if (normalizedPattern[index + 2] === '/') {
        expression += '(?:.*/)?';
        index += 2;
      } else {
        expression += '.*';
        index += 1;
      }
    } else if (character === '*') {
      expression += '[^/]*';
    } else {
      expression += escapeRegex(character);
    }
  }
  return new RegExp(`${expression}$`).test(normalizedPath);
}

export function turboInputMatches(path: string, inputs: string[]): boolean {
  const positiveInputs = inputs.filter((input) => !input.startsWith('!'));
  if (!positiveInputs.some((input) => turboGlobMatches(path, input))) return false;
  return !inputs
    .filter((input) => input.startsWith('!'))
    .some((input) => turboGlobMatches(path, input.slice(1)));
}

export function turboCacheKey(files: Map<string, string>, inputs: string[]): string {
  const hash = createHash('sha256');
  for (const [path, contents] of [...files.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!turboInputMatches(path, inputs)) continue;
    hash.update(path);
    hash.update('\0');
    hash.update(contents);
    hash.update('\0');
  }
  return hash.digest('hex');
}
