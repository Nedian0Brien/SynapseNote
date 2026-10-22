import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  type DataPoint,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  __resetServerMemoryGaugeForTests,
  installServerMemoryGauge,
} from './server-memory-telemetry.ts';

const METRIC = 'ok.server.memory.usage_megabytes';

describe('installServerMemoryGauge — no-op meter (OTel disabled)', () => {
  test('does not throw and is idempotent with the default no-op meter', () => {
    metrics.disable();
    __resetServerMemoryGaugeForTests();
    expect(() => {
      installServerMemoryGauge();
      installServerMemoryGauge();
    }).not.toThrow();
    __resetServerMemoryGaugeForTests();
  });
});

describe('installServerMemoryGauge — registered meter', () => {
  let exporter: InMemoryMetricExporter;
  let reader: PeriodicExportingMetricReader;
  let provider: MeterProvider;

  beforeAll(() => {
    exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
    provider = new MeterProvider({ readers: [reader] });
    metrics.setGlobalMeterProvider(provider);
    __resetServerMemoryGaugeForTests();
  });

  afterAll(async () => {
    await provider.shutdown();
    metrics.disable();
    __resetServerMemoryGaugeForTests();
  });

  async function collectSections(): Promise<Array<{ value: number; section: unknown }>> {
    exporter.reset();
    await reader.forceFlush();
    const out: Array<{ value: number; section: unknown }> = [];
    for (const rm of exporter.getMetrics()) {
      for (const sm of rm.scopeMetrics) {
        for (const metric of sm.metrics) {
          if (metric.descriptor.name !== METRIC) continue;
          for (const dp of metric.dataPoints as Array<DataPoint<number>>) {
            out.push({ value: dp.value, section: dp.attributes.section });
          }
        }
      }
    }
    return out;
  }

  test('records exactly the three bounded sections with positive values', async () => {
    installServerMemoryGauge();
    const points = await collectSections();
    expect(points.map((p) => p.section).sort()).toEqual(['heap_total', 'heap_used', 'rss']);
    for (const p of points) {
      expect(p.value).toBeGreaterThan(0);
    }
  });

  test('is idempotent — a second install does not duplicate the series', async () => {
    installServerMemoryGauge();
    const points = await collectSections();
    expect(points).toHaveLength(3);
  });
});
