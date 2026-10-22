export function renderLinguiTemplate(
  strings: TemplateStringsArray | string,
  ...values: unknown[]
): string {
  if (typeof strings === 'string') return strings;
  return strings.reduce(
    (text, chunk, index) => `${text}${chunk}${index < values.length ? String(values[index]) : ''}`,
    '',
  );
}
