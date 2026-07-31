/**
 * Database row insert — click-to-visible latency in a real foreground browser.
 *
 * Why this scenario exists at all: the in-app browser pane reports
 * `document.visibilityState === 'hidden'`, so Chromium clamps its timers to
 * ~1Hz. Measured there, `setTimeout(75)` actually took 236/1000/1000ms while
 * `MessageChannel` took 0/0/0ms. Every app path gated on a short timer — the
 * 75ms `useDatabaseRefreshScheduler` coalescing window is one — therefore
 * looked like a ~1s stall that does not exist. Two separate conclusions were
 * drawn from that artifact and both had to be withdrawn.
 *
 * So this scenario reports `visibilityState` and a measured `setTimeout(75)`
 * alongside the latency itself. A run whose `timerClampMs` is an order of
 * magnitude over its nominal delay is not a slow app; it is an unusable
 * measurement, and the numbers beside it must be discarded rather than
 * compared to a baseline.
 *
 * The latency itself is anchored to an in-page capture-phase listener and a
 * MutationObserver, never to the driver's own clock: a tool round trip is
 * hundreds of milliseconds and would land inside the interval being measured.
 *
 * Usage:
 *   bun run tests/perf/profile.ts --scenario=database-row-insert
 *   OK_PERF_DATABASE=db_x/ds_y bun run tests/perf/profile.ts --scenario=database-row-insert
 */

import { installLongtaskObserver } from '../lib/longtask-observer';
import { defineScenario } from '../lib/scenario';

const ITERATIONS = Number(process.env.OK_PERF_ROW_ITERATIONS ?? 7);
const SETTLE_MS = 1_200;
const ROW_TIMEOUT_MS = 15_000;

interface RowSample {
  label: string;
  /** Submit → the read-back query returns the row. Virtualization-independent. */
  clickToReadyMs: number | null;
  /** Submit → the row's cell is in the DOM. Null when the grid virtualized it away. */
  clickToVisibleMs: number | null;
  requests: { url: string; startMs: number; durationMs: number }[];
}

export default defineScenario({
  name: 'database-row-insert',
  description:
    'Click-to-visible latency for creating one database row, with the timer-clamp check that makes the number trustworthy.',

  async run(ctx) {
    const { page, opts } = ctx;

    await installLongtaskObserver(page);

    // Probe installed before any navigation so it survives the app boot.
    await page.addInitScript(() => {
      const probe = {
        clickAt: 0,
        rowAt: null as number | null,
        readyAt: null as number | null,
        mutateDoneAt: null as number | null,
        watching: null as string | null,
        requests: [] as { url: string; startMs: number; durationMs: number }[],
        observer: null as MutationObserver | null,
      };
      (globalThis as unknown as { __okRowProbe: typeof probe }).__okRowProbe = probe;

      const originalFetch = globalThis.fetch;
      globalThis.fetch = function patchedFetch(...args: Parameters<typeof fetch>) {
        const request = args[0];
        const url = typeof request === 'string' ? request : ((request as Request)?.url ?? '?');
        const path = String(url).replace(/^https?:\/\/[^/]+/, '');
        const startMs = performance.now();
        return originalFetch.apply(this, args).then((response) => {
          probe.requests.push({
            url: path,
            startMs,
            durationMs: performance.now() - startMs,
          });
          // Completion is the first read-back that STARTED after the write
          // landed — not the row appearing in the DOM, and not the row
          // appearing in the response body.
          //
          // Both of those are scale-dependent and fail as the table grows: the
          // grid virtualizes rows outside the viewport, and the query is
          // paginated, so past one page a freshly created row is in neither.
          // Each flaw reports a timeout that reads exactly like a regression —
          // the DOM check lost 4 of 7 samples at ~30 rows, the body check 24 of
          // 40 at ~250. What the user actually waits for is the read cycle, and
          // that is measurable at any size.
          if (
            probe.readyAt === null &&
            probe.mutateDoneAt !== null &&
            startMs >= probe.mutateDoneAt &&
            path.includes('/api/databases/query')
          ) {
            probe.readyAt = performance.now();
          }
          if (path.includes('/markdown-table/mutate')) probe.mutateDoneAt = performance.now();
          return response;
        });
      };
    });

    await page.goto(`${opts.target}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // The measurement is only meaningful in a tab the browser is not
    // throttling, so establish that first and record it either way.
    const environment = await page.evaluate(async () => {
      const timerLatency = async (ms: number): Promise<number> => {
        const started = performance.now();
        await new Promise((resolve) => setTimeout(resolve, ms));
        return performance.now() - started;
      };
      // Two samples: Chromium clamps from the second timer onward in a
      // backgrounded tab, so a single reading can look clean by luck.
      await timerLatency(75);
      return {
        visibilityState: document.visibilityState,
        timerClampMs: Math.round(await timerLatency(75)),
      };
    });
    ctx.recordMetric('visibilityState', environment.visibilityState);
    ctx.recordMetric('timerClampMs', environment.timerClampMs);
    const trustworthy = environment.visibilityState === 'visible' && environment.timerClampMs < 200;
    ctx.recordMetric('measurementTrustworthy', trustworthy);
    if (!trustworthy) {
      ctx.note(
        `Timers are clamped (visibilityState=${environment.visibilityState}, ` +
          `setTimeout(75) took ${environment.timerClampMs}ms). Latency below is the ` +
          'measurement environment, not the app — discard it rather than comparing to a baseline.',
      );
    }

    // A fresh database per run, unless one is named explicitly.
    //
    // Measuring against whatever the catalog happened to hold made every run
    // depend on how many rows earlier runs had left behind — the table drifted
    // from 35 rows to 358 over one session, the median moved with it, and no
    // two baselines were comparable. Creating the table here makes a run
    // reproducible and, because each insert lands in a table one row larger
    // than the last, the run measures the slope rather than a single point.
    const override = process.env.OK_PERF_DATABASE;
    const target = override
      ? { databaseId: override.split('/')[0] ?? '', sourceId: override.split('/')[1] ?? '' }
      : await page.evaluate(async (stamp: string) => {
          const post = (path: string, body: unknown) =>
            fetch(path, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            });
          const desiredState = {
            database: {
              key: `perf_row_insert_${stamp}`,
              name: `Perf row insert ${stamp}`,
              contract: {
                purpose: 'Row insert latency scenario',
                canonicality: 'canonical',
                vocabulary: ['perf'],
                freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
                sensitivity: 'internal',
              },
            },
            sources: [
              {
                key: 'rows',
                name: 'Rows',
                recordMeaning: 'One measured row',
                folder: `perf-row-insert-${stamp}`,
                // `markdown_table` is what makes this the v2 owner-table path,
                // which is the write the scenario exists to measure.
                storage: 'markdown_table',
                properties: [{ key: 'title', name: 'Title', type: 'title' }],
              },
            ],
            views: [
              {
                key: 'table',
                name: 'Table',
                sourceKey: 'rows',
                layout: { type: 'table', configuration: {} },
                projection: { propertyKeys: ['title'], body: 'hidden' },
              },
            ],
            templates: [],
            policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 1 },
            sampleRecords: [],
            recordMutations: [],
          };
          const draft = await post('/api/databases/plan', {
            action: 'create_draft',
            desiredState,
          });
          if (!draft.ok) return { databaseId: '', sourceId: '', error: `draft ${draft.status}` };
          const draftBody = (await draft.json()) as { draft: { id: string } };
          const planned = await post('/api/databases/plan', {
            action: 'create_plan',
            draftId: draftBody.draft.id,
          });
          if (!planned.ok) return { databaseId: '', sourceId: '', error: `plan ${planned.status}` };
          const { plan } = (await planned.json()) as {
            plan: {
              id: string;
              hash: string;
              snapshotRevision: string;
              targetResolutions: { kind: string; targetId: string }[];
            };
          };
          const databaseId =
            plan.targetResolutions.find((entry) => entry.kind === 'database')?.targetId ?? '';
          const sourceId =
            plan.targetResolutions.find((entry) => entry.kind === 'source')?.targetId ?? '';
          const committed = await post('/api/databases/commit', {
            planId: plan.id,
            planHash: plan.hash,
            expectedSnapshotRevision: plan.snapshotRevision,
            idempotencyKey: `perf-row-insert-${databaseId}`,
            approvalToken: `approve:${plan.hash}`,
            actor: { principalId: 'agent:perf', kind: 'agent' },
            assertions: { databaseAbsent: true },
          });
          if (!committed.ok) {
            return { databaseId: '', sourceId: '', error: `commit ${committed.status}` };
          }
          return { databaseId, sourceId, error: '' };
        }, String(Date.now()));

    if (!target.databaseId || !target.sourceId) {
      ctx.note(
        `Could not obtain a target database${'error' in target && target.error ? `: ${target.error}` : ''}.`,
      );
      ctx.recordMetric('rowInsertMedianMs', -1);
      return;
    }
    ctx.note(
      `target ${target.databaseId}/${target.sourceId}${override ? ' (override)' : ' (fresh)'}`,
    );

    await page.goto(
      `${opts.target}/#database/${encodeURIComponent(target.databaseId)}/${encodeURIComponent(target.sourceId)}`,
      { waitUntil: 'domcontentloaded', timeout: 60_000 },
    );
    await page.waitForSelector('[role="grid"]', { state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(SETTLE_MS);

    // Insert cost scales with the table: the index refresh inside the write
    // measured 32ms at 140 rows and 75ms at 212. A median is therefore only
    // comparable to a baseline captured at a similar size, so record the size.
    //
    // This saturates at the query's page size — it answers "at least this
    // many", which is enough to refuse a blind comparison, not enough to plot.
    const queryPageRowCount = await page.evaluate(async (source: string) => {
      const response = await fetch('/api/databases/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ databaseId: source.split('/')[0], sourceId: source.split('/')[1] }),
      });
      if (!response.ok) return -1;
      const body = (await response.json()) as { records?: unknown[]; totalCount?: number };
      return body.totalCount ?? body.records?.length ?? -1;
    }, `${target.databaseId}/${target.sourceId}`);
    ctx.recordMetric('queryPageRowCount', queryPageRowCount);

    const samples: RowSample[] = [];
    for (let index = 0; index < ITERATIONS; index += 1) {
      const label = `perf-row-${Date.now()}-${index}`;

      await page.evaluate((rowLabel: string) => {
        const probe = (globalThis as unknown as { __okRowProbe: Record<string, unknown> })
          .__okRowProbe as {
          clickAt: number;
          rowAt: number | null;
          watching: string | null;
          requests: unknown[];
          observer: MutationObserver | null;
        };
        probe.rowAt = null;
        probe.readyAt = null;
        probe.mutateDoneAt = null;
        probe.watching = rowLabel;
        probe.requests = [];
        probe.observer?.disconnect();
        const observer = new MutationObserver(() => {
          if (probe.rowAt !== null) return;
          const cells = document.querySelectorAll('[role="gridcell"], td');
          for (const cell of cells) {
            if ((cell.textContent ?? '').includes(rowLabel)) {
              probe.rowAt = performance.now();
              observer.disconnect();
              return;
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        probe.observer = observer;
      }, label);

      await page.getByRole('button', { name: 'New page' }).first().click();
      const titleInput = page.getByRole('textbox', { name: 'New page title' }).first();
      await titleInput.fill(label);

      // The clock starts inside the page on the real submit event, so the
      // driver's own latency cannot land inside the measured interval.
      await page.evaluate(() => {
        const probe = (globalThis as unknown as { __okRowProbe: { clickAt: number } }).__okRowProbe;
        document.addEventListener(
          'keydown',
          () => {
            probe.clickAt = performance.now();
          },
          { capture: true, once: true },
        );
      });
      await titleInput.press('Enter');

      const sample = await page
        .waitForFunction(
          () => {
            const probe = (
              globalThis as unknown as {
                __okRowProbe: {
                  clickAt: number;
                  rowAt: number | null;
                  readyAt: number | null;
                  mutateDoneAt: number | null;
                  requests: { url: string; startMs: number; durationMs: number }[];
                };
              }
            ).__okRowProbe;
            if (probe.readyAt === null) return null;
            return {
              clickToReadyMs: Math.round(probe.readyAt - probe.clickAt),
              clickToVisibleMs:
                probe.rowAt === null ? null : Math.round(probe.rowAt - probe.clickAt),
              requests: probe.requests.map((request) => ({
                url: request.url,
                startMs: Math.round(request.startMs - probe.clickAt),
                durationMs: Math.round(request.durationMs),
              })),
            };
          },
          undefined,
          { timeout: ROW_TIMEOUT_MS, polling: 50 },
        )
        .then((handle) => handle.jsonValue())
        .catch(() => null);

      samples.push({
        label,
        clickToReadyMs: sample?.clickToReadyMs ?? null,
        clickToVisibleMs: sample?.clickToVisibleMs ?? null,
        requests: sample?.requests ?? [],
      });
      await page.waitForTimeout(SETTLE_MS);
    }

    const measured = samples
      .map((sample) => sample.clickToReadyMs)
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right);
    const painted = samples.filter((sample) => sample.clickToVisibleMs !== null).length;

    ctx.recordMetric('rowInsertSamples', measured.length);
    ctx.recordMetric('rowInsertTimeouts', samples.length - measured.length);
    ctx.recordMetric('rowInsertPaintedSamples', painted);
    if (painted < samples.length) {
      ctx.note(
        `${samples.length - painted} of ${samples.length} rows never entered the DOM — the grid ` +
          'virtualizes, so `rowInsertMedianMs` is the read-back, not the paint.',
      );
    }
    if (measured.length > 0) {
      ctx.recordMetric('rowInsertMedianMs', measured[Math.floor(measured.length / 2)] ?? -1);
      ctx.recordMetric('rowInsertMinMs', measured[0] ?? -1);
      ctx.recordMetric('rowInsertMaxMs', measured.at(-1) ?? -1);
    }

    // Against a fresh table, sample i is an insert into a table of size i — so
    // the run measures the slope, not a point. Comparing the first quarter of
    // the samples with the last is what shows whether the write is O(rows) or
    // flat, which is the property the projection work is chasing.
    const inOrder = samples
      .map((sample) => sample.clickToReadyMs)
      .filter((value): value is number => value !== null);
    if (inOrder.length >= 8) {
      const slice = Math.max(2, Math.floor(inOrder.length / 4));
      const mean = (values: readonly number[]) =>
        Math.round(values.reduce((total, value) => total + value, 0) / values.length);
      const first = mean(inOrder.slice(0, slice));
      const last = mean(inOrder.slice(-slice));
      ctx.recordMetric('rowInsertFirstQuarterMeanMs', first);
      ctx.recordMetric('rowInsertLastQuarterMeanMs', last);
      ctx.recordMetric('rowInsertGrowthRatio', Math.round((last / Math.max(first, 1)) * 100) / 100);
    }

    // The request breakdown of the median run — this is what tells a slow
    // write apart from a slow read-back apart from contention.
    const median = samples.find(
      (sample) => sample.clickToReadyMs === measured[Math.floor(measured.length / 2)],
    );
    for (const request of median?.requests ?? []) {
      ctx.note(`median run: ${request.startMs}ms +${request.durationMs}ms ${request.url}`);
    }
  },
});
