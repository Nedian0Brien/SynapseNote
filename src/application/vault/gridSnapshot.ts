export type VaultGridSnapshotColumn = {
  id: string;
  name: string;
};

export type VaultGridSnapshotRow = {
  cells: Record<string, unknown>;
};

export function buildMarkdownGridSnapshot(columns: VaultGridSnapshotColumn[], rows: VaultGridSnapshotRow[]) {
  if (columns.length === 0) {
    return '';
  }

  const header = `| ${columns.map((column) => escapeCell(column.name)).join(' |')} |`;
  const divider = `| ${columns.map(() => '---').join(' |')} |`;
  const body = rows.map((row) => {
    return `| ${columns.map((column) => escapeCell(row.cells[column.id])).join(' |')} |`;
  });

  return [header, divider, ...body].join('\n');
}

function escapeCell(value: unknown) {
  if (value === null || value === undefined) return '';

  const text = Array.isArray(value)
    ? value.join(', ')
    : typeof value === 'object'
    ? JSON.stringify(value)
    : String(value);

  return text.replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|').trim();
}
