/** Lazily-created bounded telemetry instruments for destructive shell IPC. */
import { getMeter } from '@nedian0brien/synapsenote-server';

let durationHistogram: ReturnType<ReturnType<typeof getMeter>['createHistogram']> | null = null;
let failureCounter: ReturnType<ReturnType<typeof getMeter>['createCounter']> | null = null;

export function recordTrashItemDuration(durationMs: number, outcome: 'ok' | 'failure'): void {
  durationHistogram ||= getMeter().createHistogram('ok.shell.trash_item.duration_ms', {
    description: 'Duration of ok:shell:trash-item IPC dispatches in milliseconds',
    unit: 'ms',
  });
  durationHistogram.record(durationMs, { 'ok.shell.outcome': outcome });
}

export function recordTrashItemFailure(reason: string): void {
  failureCounter ||= getMeter().createCounter('ok.shell.trash_item.failures', {
    description: 'Count of ok:shell:trash-item handler failures, labeled by reason',
  });
  failureCounter.add(1, { 'ok.shell.reason': reason });
}
