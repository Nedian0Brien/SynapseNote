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
          // The read-back is the moment the app HAS the row. Checked on the
          // response body rather than the DOM because the grid virtualizes:
          // past a screenful of rows a freshly created one may never be
          // rendered, and a measurement that depends on scroll position
          // reports a timeout as if it were a regression.
          if (probe.readyAt === null && probe.watching && path.includes('/api/databases/query')) {
            const watching = probe.watching;
            response
              .clone()
              .text()
              .then((body) => {
                if (probe.readyAt === null && body.includes(watching)) {
                  probe.readyAt = performance.now();
                }
              })
              .catch(() => undefined);
          }
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

    // Pick a target: the explicit override, else the first catalog source.
    const override = process.env.OK_PERF_DATABASE;
    const target = override
      ? { databaseId: override.split('/')[0] ?? '', sourceId: override.split('/')[1] ?? '' }
      : await page.evaluate(async () => {
          const response = await fetch('/api/databases/catalog');
          const catalog = (await response.json()) as {
            candidates?: { id: string; sources?: { id: string }[] }[];
          };
          for (const candidate of catalog.candidates ?? []) {
            const source = candidate.sources?.[0];
            if (source) return { databaseId: candidate.id, sourceId: source.id };
          }
          return { databaseId: '', sourceId: '' };
        });

    if (!target.databaseId || !target.sourceId) {
      ctx.note('No database in the catalog — nothing to measure.');
      ctx.recordMetric('rowInsertMedianMs', -1);
      return;
    }
    ctx.note(`target ${target.databaseId}/${target.sourceId}`);

    await page.goto(
      `${opts.target}/#database/${encodeURIComponent(target.databaseId)}/${encodeURIComponent(target.sourceId)}`,
      { waitUntil: 'domcontentloaded', timeout: 60_000 },
    );
    await page.waitForSelector('[role="grid"]', { state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(SETTLE_MS);

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
