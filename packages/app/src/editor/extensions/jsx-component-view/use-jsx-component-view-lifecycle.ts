import {
  incrementJsxAutoConvertFailed,
  incrementJsxAutoConvertSucceeded,
} from '@nedian0brien/synapsenote-core';
import type { NodeViewProps } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';
import {
  createDatabaseInteractionId,
  recordDatabaseInteractionTrace,
} from '@/lib/database-interaction-trace';
import { useBlockSelection } from '../../hooks/use-block-selection';
import { reconstructSource } from '../../utils/reconstruct-source';
import { autonomousFragmentEditAllowed } from '../autonomous-fragment-edit';
import { getWrapperBridgeId } from '../selection-state-plugin';
import { deriveJsxConversionPolicy } from './jsx-component-view-conversion-policy';

const MAX_AUTO_CONVERT_RETRIES = 3;

type ResolvableDoc = {
  resolve: (position: number) => {
    depth: number;
    index: (depth: number) => number;
    parent: { childCount: number; type: { name: string } };
  };
};

/** Resolves movement state while treating a stale NodeView position as inert. */
export function resolveJsxComponentSiblingState(doc: ResolvableDoc, pos: number) {
  let isChildOfComponent = false;
  let siblingIndex = 0;
  let siblingCount = 1;
  try {
    const $pos = doc.resolve(pos);
    if ($pos.depth > 0 && $pos.parent.type.name === 'jsxComponent') {
      isChildOfComponent = true;
      siblingIndex = $pos.index($pos.depth);
      siblingCount = $pos.parent.childCount;
    }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
  }
  return {
    canMoveDown: isChildOfComponent && siblingIndex < siblingCount - 1,
    canMoveUp: isChildOfComponent && siblingIndex > 0,
    isChildOfComponent,
    siblingCount,
    siblingIndex,
  };
}

/** Owns NodeView tracing, selection synchronization, and conversion dispatch retries. */
export function useJsxComponentViewLifecycle({
  descriptor,
  editor,
  getPos,
  node,
  selected,
}: Pick<NodeViewProps, 'editor' | 'getPos' | 'node' | 'selected'> & {
  descriptor: { displayName?: string; name: string };
}) {
  const [renderError, setRenderError] = useState<Error | null>(null);
  const [stuck, setStuck] = useState(false);
  const interactionId = useRef(createDatabaseInteractionId());
  const component = useRef(String(node.attrs.componentName ?? 'unknown'));
  const convertedRef = useRef(false);
  const retryCountRef = useRef(0);
  const pos = typeof getPos === 'function' ? getPos() : undefined;
  const siblings =
    typeof pos === 'number'
      ? resolveJsxComponentSiblingState(editor.state.doc, pos)
      : {
          canMoveDown: false,
          canMoveUp: false,
          isChildOfComponent: false,
          siblingCount: 1,
          siblingIndex: 0,
        };
  const blockSelection = useBlockSelection(editor);
  const wrapperBridgeId = typeof pos === 'number' ? getWrapperBridgeId(editor.state, pos) : null;
  const isRangeEncompassed =
    wrapperBridgeId !== null &&
    (blockSelection?.rangeEncompassedBlockIds.has(wrapperBridgeId) ?? false);
  const isInnermostInChain =
    wrapperBridgeId !== null && blockSelection?.ancestorChain.at(-1)?.bridgeId === wrapperBridgeId;
  const isInnermostSelected = selected && !isRangeEncompassed && isInnermostInChain;
  const hasChildSelected =
    wrapperBridgeId !== null &&
    !isInnermostInChain &&
    (blockSelection?.ancestorChain.some((entry) => entry.bridgeId === wrapperBridgeId) ?? false);
  const selectionOrigin =
    isInnermostSelected && blockSelection ? blockSelection.selectionOrigin : undefined;
  const isDraggingSelf = isInnermostSelected && (blockSelection?.isDragging ?? false);
  const conversion = deriveJsxConversionPolicy({
    componentName: String(node.attrs.componentName ?? ''),
    descriptorDisplayName: descriptor.displayName,
    descriptorName: descriptor.name,
    renderError,
  });

  useEffect(() => {
    recordDatabaseInteractionTrace(interactionId.current, 'node_view_mounted', {
      component: component.current,
    });
    return () => {
      recordDatabaseInteractionTrace(interactionId.current, 'node_view_unmounted', {
        component: component.current,
      });
    };
  }, []);

  useEffect(() => {
    if (!conversion.needsConversion || convertedRef.current || stuck || conversion.reason === null)
      return;
    const livePos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof livePos !== 'number') return;
    const fallbackNode = node.type.schema.nodes.rawMdxFallback.create(
      { reason: conversion.reason },
      node.type.schema.text(reconstructSource(node)),
    );
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const dispatchOnce = () => {
      if (cancelled || !autonomousFragmentEditAllowed(editor)) return;
      try {
        editor.view.dispatch(
          editor.state.tr.replaceWith(livePos, livePos + node.nodeSize, fallbackNode),
        );
        convertedRef.current = true;
        incrementJsxAutoConvertSucceeded(conversion.telemetryComponent);
      } catch (error) {
        console.warn(
          JSON.stringify({
            event: 'jsx-component-auto-convert-failed',
            component: conversion.telemetryComponent,
            rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
            reason:
              error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
            retry: retryCountRef.current,
          }),
        );
        incrementJsxAutoConvertFailed(conversion.telemetryComponent);
        retryCountRef.current += 1;
        if (retryCountRef.current >= MAX_AUTO_CONVERT_RETRIES) {
          if (!cancelled) setStuck(true);
          return;
        }
        timeoutId = setTimeout(dispatchOnce, 50 * (2 ** retryCountRef.current - 1));
      }
    };
    const frameId = requestAnimationFrame(dispatchOnce);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [conversion, editor, getPos, node, stuck]);

  return {
    ...siblings,
    hasChildSelected,
    isDraggingSelf,
    isInnermostSelected,
    isRangeEncompassed,
    needsConversion: conversion.needsConversion,
    pos,
    renderError,
    selectionOrigin,
    setRenderError,
    stuck,
  };
}
