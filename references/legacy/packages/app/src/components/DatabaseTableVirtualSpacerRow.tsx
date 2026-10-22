import { TableCell, TableRow } from '@/components/ui/table';

export function DatabaseTableVirtualSpacerRow({
  colSpan,
  height,
}: {
  colSpan: number;
  height: number;
}) {
  return (
    <TableRow aria-hidden="true" noHover data-database-table-virtual-spacer>
      <TableCell colSpan={colSpan} className="p-0" style={{ height }} />
    </TableRow>
  );
}
