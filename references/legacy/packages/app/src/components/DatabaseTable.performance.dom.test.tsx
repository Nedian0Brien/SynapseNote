import { afterEach, describe, expect, test } from 'bun:test';
import type {
  DatabaseQueryResult,
  DatabaseSource,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { cleanup, render } from '@testing-library/react';
import { DATABASE_UX_LATENCY_BUDGETS_MS } from '@/lib/database-ux-budgets';
import { DATABASE_TABLE_RENDERED_COLUMN_LIMIT, DatabaseTable } from './DatabaseTableDialog';

const VIEW_RENDER_BUDGET_MS = DATABASE_UX_LATENCY_BUDGETS_MS.viewSwitch;
const SAMPLE_COUNT = 5;
/**
 * Renders performed and thrown away before timing starts.
 *
 * The first render of this tree pays costs a user only pays once per process —
 * module evaluation, React/JIT warmup, the initial virtualizer measurement — and
 * they dwarf the steady-state cost this budget exists to protect. Measured cold,
 * sample 1 came in at ~370ms against ~190-220ms for samples 2-5 on an idle
 * machine, and ~669ms against ~244ms inside the full DOM tier, where the heap is
 * already loaded from hundreds of other files. Because `percentile(…, 0.95)`
 * over 5 samples resolves to the maximum, that one cold sample WAS the assertion:
 * the budget failed in-tier and passed alone while steady-state render cost never
 * moved. Discarding warmup keeps the same budget and the same tail statistic —
 * it just stops charging a one-time cost against a per-interaction budget.
 */
const WARMUP_COUNT = 2;

const source: DatabaseSource = {
  id: 'ds_benchmark_view',
  key: 'benchmark_view',
  name: 'Benchmark view',
  recordMeaning: 'One benchmark row',
  folder: 'benchmark-view',
  properties: [
    { id: 'prop_view_00', key: 'title', name: 'Title', type: 'title' },
    ...Array.from({ length: 29 }, (_, index) => ({
      id: `prop_view_${String(index + 1).padStart(2, '0')}`,
      key: `field_${String(index + 1).padStart(2, '0')}`,
      name: `Field ${index + 1}`,
      type: 'text' as const,
    })),
  ],
};

const records: ProjectedDatabaseRecord[] = Array.from({ length: 1_000 }, (_, row) => ({
  id: `rec_view_${String(row).padStart(4, '0')}`,
  path: `benchmark-view/${String(row).padStart(4, '0')}.md`,
  revision: `sha256:${String(row).padStart(64, '0')}`,
  values: Object.fromEntries(
    source.properties.map((property, column) => [property.id, `row ${row} column ${column}`]),
  ),
}));

const result: DatabaseQueryResult = {
  sourceId: source.id,
  snapshotRevision: `sha256:${'a'.repeat(64)}`,
  matched: records.length,
  returned: records.length,
  isComplete: true,
  nextCursor: null,
  truncatedBy: null,
  indexFreshness: 'snapshot',
  records,
  aggregation: null,
};

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

afterEach(cleanup);

describe('database table render performance', () => {
  test('renders a virtualized 1k-row, 30-property view within budget', () => {
    const timings: number[] = [];
    for (let sample = 0; sample < WARMUP_COUNT + SAMPLE_COUNT; sample += 1) {
      const started = performance.now();
      const view = render(<DatabaseTable source={source} result={result} />);
      const elapsedMs = performance.now() - started;
      if (sample >= WARMUP_COUNT) timings.push(elapsedMs);
      // Virtualization is asserted on every render, warmup included — a warm-up
      // pass that mounted all 1000 rows would still be a defect.
      expect(view.container.querySelectorAll('[data-record-id]').length).toBeLessThan(40);
      expect(view.container.querySelector('[data-record-id="rec_view_0999"]')).toBeNull();
      view.unmount();
    }
    const p95 = percentile(timings, 0.95);
    process.stdout.write(
      `${JSON.stringify({
        benchmark: 'database-view-render',
        records: 1_000,
        properties: 30,
        samples: SAMPLE_COUNT,
        warmup: WARMUP_COUNT,
        budgetMs: VIEW_RENDER_BUDGET_MS,
        p50Ms: Math.round(percentile(timings, 0.5) * 1_000) / 1_000,
        p95Ms: Math.round(p95 * 1_000) / 1_000,
        samplesMs: timings.map((value) => Math.round(value * 1_000) / 1_000),
        passed: p95 < VIEW_RENDER_BUDGET_MS,
      })}\n`,
    );
    expect(p95).toBeLessThan(VIEW_RENDER_BUDGET_MS);
  });

  test('bounds mounted cells when an imported schema grows very wide', () => {
    const wideSource: DatabaseSource = {
      ...source,
      id: 'ds_benchmark_wide_view',
      properties: [
        { id: 'prop_view_00', key: 'title', name: 'Title', type: 'title' },
        ...Array.from({ length: 249 }, (_, index) => ({
          id: `prop_wide_${String(index + 1).padStart(3, '0')}`,
          key: `wide_${String(index + 1).padStart(3, '0')}`,
          name: `Wide ${index + 1}`,
          type: 'text' as const,
        })),
      ],
    };
    const wideResult: DatabaseQueryResult = {
      ...result,
      sourceId: wideSource.id,
      records: result.records.map((record) => ({
        ...record,
        values: Object.fromEntries(
          wideSource.properties.map((property, index) => [property.id, `value ${index}`]),
        ),
      })),
    };
    const view = render(<DatabaseTable source={wideSource} result={wideResult} />);
    expect(
      view.container.querySelectorAll('[data-slot="table-head"][data-property-id]'),
    ).toHaveLength(DATABASE_TABLE_RENDERED_COLUMN_LIMIT);
    expect(
      view.container.querySelector('[data-testid="database-column-limit"]')?.textContent,
    ).toContain('remaining 150');
    expect(view.container.querySelectorAll('[data-record-id]').length).toBeLessThan(40);
  });
});
