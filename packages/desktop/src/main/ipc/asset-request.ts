/** Runtime guards for renderer-controlled asset registrar payloads. */

import type { RequestChannels } from '../../shared/ipc-channels.ts';

type AssetMenuParams = RequestChannels['ok:shell:show-asset-menu']['args'][0];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isAssetMenuParams(value: unknown): value is AssetMenuParams {
  return (
    isRecord(value) &&
    typeof value.relPath === 'string' &&
    typeof value.title === 'string' &&
    (value.kind === 'asset' || value.kind === 'wiki-link' || value.kind === 'image')
  );
}

export function isHandoffStatsLine(
  value: unknown,
): value is RequestChannels['ok:shell:record-handoff']['args'][0] {
  return (
    isRecord(value) &&
    typeof value.target === 'string' &&
    typeof value.host === 'string' &&
    typeof value.outcome === 'string' &&
    typeof value.ts === 'string'
  );
}

export function isWebPreviewRequest(value: unknown): value is { kind: 'web-preview'; url: string } {
  return isRecord(value) && value.kind === 'web-preview' && typeof value.url === 'string';
}

export function isExportPdfRequest(value: unknown): value is { kind: 'export-pdf'; suggestedName: string } {
  return isRecord(value) && value.kind === 'export-pdf' && typeof value.suggestedName === 'string';
}
