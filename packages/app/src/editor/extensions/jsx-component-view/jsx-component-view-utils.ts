/**
 * Pure contracts used by the JSX NodeView.
 *
 * Keeping attribute extraction and identity hashing outside the NodeView is
 * intentional: these functions are domain/serialization rules, not React
 * lifecycle concerns.  The NodeView imports them, while tests and future
 * persistence adapters can exercise the same rules without mounting a
 * ProseMirror view.
 */

import { sanitizeComponentProps } from '../../utils/sanitize-url.ts';

/**
 * Insertion-order-independent stringification. Sorts keys recursively so
 * `{a:1, b:2}` and `{b:2, a:1}` hash to the same string.
 */
export function stableHash(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableHash).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableHash(v)}`).join(',')}}`;
}

/**
 * Extract primitive (non-ReactNode) props from PM node attrs.
 * `reactNodeNames` is precomputed by the descriptor registry so this helper
 * does not allocate descriptor metadata during a render.
 */
export function extractPrimitiveProps(
  attrs: Record<string, unknown>,
  reactNodeNames: ReadonlySet<string>,
): Record<string, unknown> {
  const propsObj = (attrs.props ?? {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(propsObj)) {
    if (reactNodeNames.has(key)) continue;
    result[key] = value;
  }
  return sanitizeComponentProps(result);
}

export interface ElementJsxAttrs extends Record<string, unknown> {
  kind: 'element';
  props: Record<string, unknown>;
}

/**
 * Narrow the write boundary to element-kind JSX nodes. Expression-kind nodes
 * are source-only and must never receive element-shaped prop mutations.
 */
export function getElementJsxAttrs(attrs: Record<string, unknown>): ElementJsxAttrs | null {
  return attrs.kind === 'element' ? (attrs as ElementJsxAttrs) : null;
}

/**
 * Elements that own their click inside a self-closing JSX NodeView. Keeping
 * this selector in the pure utility module makes the event boundary testable
 * without mounting the complete editor.
 */
const JSX_INTERACTIVE_TARGET_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="gridcell"]',
  '[contenteditable="true"]',
  '[data-jsx-interactive]',
  '[data-interactive]',
].join(',');

export function isJsxInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as { closest?: unknown }).closest !== 'function') return false;
  return Boolean((target as Element).closest(JSX_INTERACTIVE_TARGET_SELECTOR));
}
