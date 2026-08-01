type LinguiDescriptor = { id?: string; message?: string };

function isLinguiDescriptor(
  value: TemplateStringsArray | LinguiDescriptor,
): value is LinguiDescriptor {
  return !Array.isArray(value);
}

export function renderLinguiTemplate(
  strings: TemplateStringsArray | string | LinguiDescriptor,
  ...values: unknown[]
): string {
  if (typeof strings === 'string') return strings;
  if (isLinguiDescriptor(strings)) return strings.message ?? strings.id ?? '';
  return strings.reduce(
    (text, chunk, index) => `${text}${chunk}${index < values.length ? String(values[index]) : ''}`,
    '',
  );
}
