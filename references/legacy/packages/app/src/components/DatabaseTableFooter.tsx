import type {
  DatabaseCalculationFunction,
  DatabaseProperty,
  DatabaseQueryResult,
} from '@nedian0brien/synapsenote-core';
import { formatDatabaseNumber } from '@nedian0brien/synapsenote-core';
import { TableCell, TableFooter, TableRow } from '@/components/ui/table';
import type { DatabaseTableGeometry } from '@/lib/database-table-geometry';
import { cn } from '@/lib/utils';

export function DatabaseTableFooter({
  calculations,
  properties,
  result,
  notionSurface,
  geometry,
}: {
  calculations: Readonly<Record<string, DatabaseCalculationFunction>>;
  properties: readonly DatabaseProperty[];
  result: DatabaseQueryResult;
  notionSurface: boolean;
  geometry: DatabaseTableGeometry;
}) {
  if (Object.keys(calculations).length === 0) return null;
  return (
    <TableFooter className="sticky bottom-0 z-20 bg-background">
      <TableRow noHover data-testid="database-calculation-row">
        {!notionSurface ? <TableCell className="sticky left-0 z-20 bg-background" /> : null}
        {properties.map((property, index) => {
          const calculation = calculations[property.id];
          const resultValue = result.aggregation?.calculations.find(
            (candidate) =>
              candidate.propertyId === property.id && candidate.function === calculation,
          );
          let shown = '—';
          if (resultValue?.value !== null && resultValue?.value !== undefined) {
            shown =
              resultValue.unit === 'percentage'
                ? `${String(resultValue.value)}%`
                : property.type === 'number' && typeof resultValue.value === 'number'
                  ? formatDatabaseNumber(resultValue.value, property)
                  : String(resultValue.value);
          }
          return (
            <TableCell
              key={property.id}
              className={cn(
                'bg-background text-muted-foreground text-xs',
                index === 0 && 'sticky left-0 z-10',
              )}
              style={index === 0 ? { left: `${geometry.titleStickyInset}px` } : undefined}
            >
              {calculation ? (
                <span title={`${calculation.replaceAll('_', ' ')} over all matched records`}>
                  {calculation.replaceAll('_', ' ')}: {shown}
                </span>
              ) : null}
            </TableCell>
          );
        })}
        {notionSurface ? (
          <>
            <TableCell className="bg-background" data-database-actions-column />
            <TableCell
              role="presentation"
              aria-hidden="true"
              className="pointer-events-none p-0"
              data-database-table-filler
            />
          </>
        ) : (
          <>
            <TableCell
              role="presentation"
              aria-hidden="true"
              className="pointer-events-none p-0"
              data-database-table-filler
            />
            <TableCell className="sticky right-0 bg-background" data-database-actions-column />
          </>
        )}
      </TableRow>
    </TableFooter>
  );
}
