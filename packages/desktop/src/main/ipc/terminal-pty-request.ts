/** Runtime validation for the PTY registrar's renderer-controlled payloads. */

import { TERMINAL_CLIS } from '@nedian0brien/synapsenote-core';
import type { RequestChannels } from '../../shared/ipc-channels.ts';

type TerminalPtyChannel =
  | 'ok:pty:create'
  | 'ok:pty:input'
  | 'ok:pty:resize'
  | 'ok:pty:kill'
  | 'ok:pty:drain'
  | 'ok:pty:adopt'
  | 'ok:pty:set-meta'
  | 'ok:pty:set-order'
  | 'ok:terminal:claude-assist'
  | 'ok:terminal:cli-preflight';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string';
}

function optionalStringField(value: Record<string, unknown>, key: string): boolean {
  return value[key] === undefined || typeof value[key] === 'string';
}

function isCliChat(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.cli !== 'codex' && value.cli !== 'claude') return false;
  if (!stringField(value, 'prompt') || (value.sessionId !== null && typeof value.sessionId !== 'string')) {
    return false;
  }
  if (!['read-only', 'workspace-write', 'full-access'].includes(String(value.permissionMode))) {
    return false;
  }
  if (!isRecord(value.modelSettings)) return false;
  return (
    typeof value.modelSettings.model === 'string' &&
    ['low', 'medium', 'high', 'xhigh', 'ultra', 'max'].includes(String(value.modelSettings.effort)) &&
    ['default', 'fast'].includes(String(value.modelSettings.speed))
  );
}

function isPtyRequest(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && stringField(value, 'ptyId');
}

function oneRecord(rawArgs: readonly unknown[]): Record<string, unknown> | undefined {
  const value = rawArgs.length === 1 ? rawArgs[0] : undefined;
  return isRecord(value) ? value : undefined;
}

/** Returns a typed tuple only after the named PTY payload has been checked. */
export function parseTerminalPtyArgs<K extends TerminalPtyChannel>(
  channel: K,
  rawArgs: readonly unknown[],
): RequestChannels[K]['args'] | undefined {
  const value = oneRecord(rawArgs);
  if (!value) return undefined;

  switch (channel) {
    case 'ok:pty:create':
      return typeof value.cols === 'number' && typeof value.rows === 'number' &&
          optionalStringField(value, 'launchCommand') &&
          (value.privateHistory === undefined || typeof value.privateHistory === 'boolean')
        ? ([value] as RequestChannels[K]['args'])
        : undefined;
    case 'ok:pty:input':
      return isPtyRequest(value) &&
          optionalStringField(value, 'data') &&
          (value.chat === undefined || isCliChat(value.chat))
        ? ([value] as RequestChannels[K]['args'])
        : undefined;
    case 'ok:pty:resize':
      return isPtyRequest(value) && typeof value.cols === 'number' && typeof value.rows === 'number'
        ? ([value] as RequestChannels[K]['args'])
        : undefined;
    case 'ok:pty:kill':
    case 'ok:pty:adopt':
      return isPtyRequest(value) ? ([value] as RequestChannels[K]['args']) : undefined;
    case 'ok:pty:drain':
      return isPtyRequest(value) && typeof value.bytes === 'number'
        ? ([value] as RequestChannels[K]['args'])
        : undefined;
    case 'ok:pty:set-meta':
      return isPtyRequest(value) &&
          (value.customLabel === undefined || value.customLabel === null || typeof value.customLabel === 'string') &&
          (value.ordinal === undefined || typeof value.ordinal === 'number') &&
          (value.chatCli === undefined || value.chatCli === null || value.chatCli === 'codex' || value.chatCli === 'claude') &&
          (value.chatSessionId === undefined || value.chatSessionId === null || typeof value.chatSessionId === 'string')
        ? ([value] as RequestChannels[K]['args'])
        : undefined;
    case 'ok:pty:set-order':
      return Array.isArray(value.orderedPtyIds) && value.orderedPtyIds.every((id) => typeof id === 'string')
        ? ([value] as RequestChannels[K]['args'])
        : undefined;
    case 'ok:terminal:claude-assist':
      return value.action === 'preflight' || value.action === 'rewire'
        ? ([value] as RequestChannels[K]['args'])
        : undefined;
    case 'ok:terminal:cli-preflight':
      return typeof value.cli === 'string' && value.cli in TERMINAL_CLIS
        ? ([value] as RequestChannels[K]['args'])
        : undefined;
  }
}
