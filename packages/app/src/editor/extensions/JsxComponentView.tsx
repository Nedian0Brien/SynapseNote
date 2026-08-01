/**
 * JsxComponentView — overlay-based descriptor-dispatch NodeView.
 *
 * **Design principle:** Zero permanent chrome in document flow. Components
 * render exactly like production. All editor affordances are hover-revealed
 * overlays at top-right (move up/down, delete, settings gear) plus an
 * "add child" pill at the bottom edge of container descriptors.
 *
 * A persistent component-name chip was proposed but dropped — the
 * "zero permanent chrome" principle won. The
 * descriptor identity is surfaced through: (a) the rendered fumadocs
 * component's own visual style (every built-in has a distinct shape), (b)
 * the `SelectionAnnouncer` aria-live region announcing the block name on
 * selection change, (c) the `aria-label` group summary announced to AT on
 * focus.
 *
 * Three render branches:
 *   Branch 1 (Wildcard `'*'`): does NOT render a persistent chip — the
 *     NodeView immediately schedules a rAF-auto-convert into an editable
 *     `rawMdxFallback` (nested CodeMirror source editor, Precedent #28
 *     direct PM dispatch + #30 all user content visible). A transient
 *     "Unknown component: X — source editable below"
 *     placeholder flashes for at most one frame while the conversion
 *     dispatch lands.
 *   Branch 2 (Registered healthy): live React component + hover chrome
 *     (move/delete/gear→Popover PropPanel, add-child pill) + NodeViewContent.
 *   Branch 3 (Invalid-state / render error): same rAF-auto-convert into
 *     `rawMdxFallback` — the error boundary catches, logs a structured
 *     `jsx-render-failure` event, and the NodeView replaces itself with
 *     the source editor. Identical UX shape to Branch 1 by design
 *     (Precedent #28: parse failures AND render failures surface the same
 *     embedded source editor).
 *
 * Per Precedent #30: NodeViewContent is ALWAYS rendered, never display:none.
 */

import { Trans, useLingui } from '@lingui/react/macro';
import {
  incrementJsxKeyboardDeleteFailed,
  incrementJsxMoveFailed,
  incrementJsxRenderFailure,
  incrementJsxStuckCopyFailed,
  incrementJsxStuckDeleteFailed,
} from '@nedian0brien/synapsenote-core';
import type { NodeViewProps } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Settings2, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { Button } from '@/components/ui/button';
import { hashFromDocName } from '@/lib/doc-hash';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/popover.tsx';
import { OPT_OUT_ATTR } from '../clipboard/index.ts';
import { CodePreviewEditModal } from '../components/CodePreviewEditModal';
import { DescriptorPlaceholder } from '../components/DescriptorPlaceholder.tsx';
import { JsxComponentHostProvider } from '../components/jsx-host-context.tsx';
import { PropPanel } from '../components/PropPanel.tsx';
import { getEditorDocName } from '../extensions/doc-context.ts';
import { normalizeDocRelativeMediaRenderProps } from '../extensions/media-render-props.ts';
import { getDescriptor } from '../registry/index.ts';
import {
  resolveDescriptorPlaceholder,
  shouldRenderPlaceholder,
} from '../registry/resolve-descriptor-placeholder.ts';
import { createChildNode, focusInsertedComponent } from '../slash-command/component-items.tsx';
import { ALIGNABLE_DESCRIPTOR_NAMES } from '../utils/alignable-descriptors.ts';
import { formatContainerAriaLabel } from '../utils/editor-strings.ts';
import { reconstructSource } from '../utils/reconstruct-source.ts';
import { deriveJsxAttributePolicy } from './jsx-component-view/jsx-component-view-attribute-policy.ts';
import {
  extractPrimitiveProps,
  stableHash,
} from './jsx-component-view/jsx-component-view-utils.ts';
import { useJsxComponentViewInteractions } from './jsx-component-view/use-jsx-component-view-interactions.ts';
import { useJsxComponentViewLifecycle } from './jsx-component-view/use-jsx-component-view-lifecycle.ts';

// Compatibility exports keep existing extension tests and downstream local
// integrations stable while the NodeView implementation uses the narrower
// pure-utils boundary internally.
export {
  extractPrimitiveProps,
  getElementJsxAttrs,
  isJsxInteractiveTarget,
  stableHash,
} from './jsx-component-view/jsx-component-view-utils.ts';

// ── Error Boundary ──────────────────────────────────────────────────────
//
// Thin wrapper around `react-error-boundary`'s `<ErrorBoundary>` — same
// pattern as `packages/app/src/components/DocumentErrorBoundary.tsx`. The
// prior hand-rolled `class ComponentErrorBoundary` carried its own
// `getDerivedStateFromError` / `componentDidCatch` / `componentDidUpdate`
// trio that duplicated library semantics for no behavioral gain. This
// refactor collapses both error boundaries onto the same contract:
//
//   <ErrorBoundary fallbackRender resetKeys={[resetKey]} onError> …
//
// Fallback: renders the original children wrapped in
// `.jsx-component-error-fallback` (preserves the "surface the source so
// users can edit out of error state" UX from Precedent #30). When
// `resetKey` flips (prop change, node-name change, auto-convert reset —
// see the orchestrating effect at `resetKey` computation), the library
// auto-remounts the subtree.

interface ComponentErrorBoundaryProps {
  children: ReactNode;
  /** Flips when we want to force a retry (prop change, node-name change,
   *  post-auto-convert reset). Threaded into `resetKeys`. */
  resetKey: string;
  /** Escalates errored state out to the NodeView so the chrome can react
   *  (show "failed to render" hint, offer copy-source / delete affordances
   *  via the stuck-state UI). */
  onError: (error: Error) => void;
  /** Registered descriptor name ('Callout', 'img', 'video', 'audio',
   *  'Accordion', or 'wildcard'). Low-cardinality label — safe for
   *  telemetry aggregation. */
  descriptorName: string;
  /** Raw user-authored component name; may be arbitrary MDX text. Kept in
   *  a separate field (not a label) so telemetry aggregation does not
   *  explode cardinality across tenants. Capped at 200 chars inside the
   *  onError handler before emission (MDX permits arbitrarily-long
   *  dotted-namespace tags that would otherwise produce multi-KB log
   *  entries per error). */
  rawComponentName: string;
}

function ComponentErrorFallback({ children }: FallbackProps & { children?: ReactNode }) {
  // react-error-boundary's FallbackProps (error, resetErrorBoundary) are
  // intentionally ignored here — Precedent #30 says errored blocks render
  // their children (source text) in place, not an error card. The CSS
  // class + the resetKeys-driven remount handle the visual recovery
  // story; the children passed through are the original subtree, which
  // renders as nested rawMdxFallback source under the wildcard path.
  return <div className="jsx-component-error-fallback">{children}</div>;
}

function ComponentErrorBoundary(props: ComponentErrorBoundaryProps) {
  const { children, resetKey, onError, descriptorName, rawComponentName } = props;
  return (
    <ErrorBoundary
      resetKeys={[resetKey]}
      onError={(error, info) => {
        // react-error-boundary types `error` as `unknown` because React can
        // capture arbitrary thrown values (strings, null, etc.). Normalize
        // to Error for both telemetry + the upstream onError contract.
        const err = error instanceof Error ? error : new Error(String(error));
        console.warn(
          JSON.stringify({
            event: 'jsx-render-failure',
            component: descriptorName,
            rawComponentName: String(rawComponentName ?? '').slice(0, 200),
            error: String(err),
            stack: info.componentStack,
          }),
        );
        incrementJsxRenderFailure(descriptorName);
        onError(err);
      }}
      fallbackRender={(fbProps) => (
        <ComponentErrorFallback {...fbProps}>{children}</ComponentErrorFallback>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

// ── Main NodeView ───────────────────────────────────────────────────────

export function JsxComponentView({ node, editor, extension, getPos, selected }: NodeViewProps) {
  const { t } = useLingui();
  const descriptor = getDescriptor(node.attrs.componentName as string);
  const lifecycle = useJsxComponentViewLifecycle({ descriptor, editor, getPos, node, selected });
  const {
    canMoveDown,
    canMoveUp,
    hasChildSelected,
    isChildOfComponent,
    isDraggingSelf,
    isInnermostSelected,
    isRangeEncompassed,
    needsConversion,
    pos,
    selectionOrigin,
    setRenderError,
    stuck,
  } = lifecycle;

  const hasEditableProps = descriptor.props.some(
    (p) => !('hidden' in p && p.hidden) && p.type !== 'reactnode',
  );

  // needsConfig = at least one required STRING prop has no decision yet
  // (key absent from props). Used as a passive visual hint: the chrome bar
  // surfaces the gear without hover (via `data-needs-config` CSS rule in
  // `styles/editor/component-chrome.css`). Clears as soon as every required
  // string prop has a key —
  // even an explicit empty string counts as a decision (e.g. `alt=""` is
  // WCAG-canonical decorative-image opt-in).
  //
  // Tri-state for required string props:
  //   - missing key → "author hasn't decided" → fires the nudge
  //   - `''`        → "explicit opt-out / decorative" → does NOT fire
  //   - non-empty   → satisfied → does NOT fire
  //
  // Scoping rationale:
  //   - boolean / number / enum props have sensible defaults from
  //     `getDefaultProps` (false / 0 / first enum value) — defaulting is
  //     intentional, not "unconfigured."
  //   - Optional string props (no `required: true`) opt out of the nudge
  //     entirely — `<Callout type="info">` legitimately omits title and
  //     should not nag.
  //   - Required string props without an explicit `defaultValue` are
  //     genuine "must decide" surfaces; `getDefaultProps` leaves the key
  //     absent on slash-insert, which is what trips the nudge here.
  const currentProps = (node.attrs.props as Record<string, unknown>) ?? {};
  const isAlignable = ALIGNABLE_DESCRIPTOR_NAMES.has(descriptor.name);
  const attributePolicy = deriveJsxAttributePolicy({
    currentProps,
    isAlignable,
    props: descriptor.props,
  });
  const needsConfig = hasEditableProps && attributePolicy.needsConfig;

  // STRICTER than `needsConfig`: only fires when the descriptor's autoFocus
  // string prop is empty/absent. `needsConfig` flags any required string
  // with a missing-key decision (e.g. alt absent on an `<img>`) and drives
  // the chrome-bar gear nudge — conflating the two would regress images
  // with valid src but unset alt into placeholder mode.
  const showPlaceholder = shouldRenderPlaceholder(descriptor, currentProps);
  const resolvedPlaceholder = showPlaceholder ? resolveDescriptorPlaceholder(descriptor) : null;

  // Single source of truth for the three sites (handleBodyClick / handleOpenChange /
  // onCloseAutoFocus) that gate behavior on "this descriptor renders as a leaf with
  // no editable content hole" (img / video / audio). Drift between sites silently
  // breaks focus + selection for one descriptor class.
  const isSelfClosingLeaf = !descriptor.hasChildren || !!descriptor.isSelfClosing;
  const selectOnBodyClick = descriptor.interaction?.selectOnBodyClick ?? true;
  const usesExplicitDragHandle = descriptor.interaction?.drag === 'handle';

  /**
   * Per-descriptor "source-bearing prop" mapping for the edit
   * modal. Each entry names the prop that carries the rendered source
   * (`MermaidFence.chart`, `Math.formula`) and the CodeMirror language
   * to surface. Descriptors not in the table don't render the edit
   * button. Mermaid + LaTeX grammars resolve via
   * `resolveLanguageExtension` in `CodePreviewEditModal`
   * (`codemirror-lang-mermaid` + `@codemirror/legacy-modes/mode/stex`),
   * so both surfaces get real token highlighting.
   */
  const editableSource: { propName: string; language: 'mermaid' | 'latex' } | null =
    descriptor.name === 'MermaidFence'
      ? { propName: 'chart', language: 'mermaid' }
      : descriptor.name === 'Math' ||
          descriptor.name === 'DollarMath' ||
          descriptor.name === 'MathFence'
        ? { propName: 'formula', language: 'latex' }
        : null;
  const {
    editModalOpen,
    handleBodyClick,
    handleCloseAutoFocus,
    handleKeyDown,
    handleModalSave,
    handlePopoverOpenChange,
    handlePropChange,
    openPanel,
    popoverOpen,
    setEditModalOpen,
    setPopoverOpen,
  } = useJsxComponentViewInteractions({
    descriptor,
    editor,
    getPos,
    hasEditableProps,
    isInnermostSelected,
    isSelfClosingLeaf,
    node,
    pos,
    selectOnBodyClick,
    selected,
    showPlaceholder,
  });

  const primitiveProps = extractPrimitiveProps(node.attrs, descriptor.reactNodePropNames);
  // Compat descriptors render through their canonical's React component via
  // a render-time prop translation. `translateProps` is identity for v1's
  // three compat descriptors (their prop names already match canonical) but
  // the seam exists for future compats whose source spelling differs from
  // canonical (e.g., a hypothetical Mintlify Note → Callout mapping that
  // renames `title` to `heading` without changing storage).
  const translatedProps =
    descriptor.surface === 'compat' ? descriptor.translateProps(primitiveProps) : primitiveProps;
  const configuredDocName = (extension.options as { docName?: unknown }).docName;
  const sourceDocName =
    typeof configuredDocName === 'string' && configuredDocName
      ? configuredDocName
      : getEditorDocName(editor);
  const renderProps = normalizeDocRelativeMediaRenderProps(
    descriptor.name,
    translatedProps,
    sourceDocName,
  );
  // Stable reset key for the ErrorBoundary. `JSON.stringify` on an arbitrary
  // props object produced a string whose content was key-order-sensitive
  // across engines — combined with the post-edit re-serialization that
  // mutates `primitiveProps`'s property insertion order (spread + overwrite),
  // the key changed between renders even when the prop values didn't, and
  // the ErrorBoundary (and therefore PropPanel) remounted mid-typing,
  // stealing focus from the active input. Sort keys so two objects with the
  // same (key, value) pairs hash to the same string regardless of insertion
  // order.
  const resetKey = `${descriptor.name}::${stableHash(primitiveProps)}`;

  // Shared: compute child insertion position (inside container, after last child)
  const insertChildAt = () => {
    const p = typeof getPos === 'function' ? (getPos() ?? 0) : 0;
    return p + 1 + node.content.size;
  };

  // Stuck-state UX: retries exhausted. The user sees a durable placeholder
  // with "Delete" and "Copy source" affordances so they can recover without
  // being trapped on a dead placeholder. Precedent #28 is preserved — the
  // source bytes are available via Copy source even when the auto-convert
  // can't land.
  if (stuck) {
    // Use action-oriented copy instead of internal jargon ("could not open
    // source editor"). The stuck state is the highest-friction UX moment
    // in the feature — the label should explain the recovery bridge (copy
    // → close → paste elsewhere), not name an internal subsystem the user
    // has never encountered.
    const componentName = node.attrs.componentName as string;
    const descriptorLabel = descriptor.displayName ?? descriptor.name;
    const label =
      descriptor.name === '*'
        ? t`<${componentName}> isn't a known component. Copy the source to use it elsewhere, or delete the block.`
        : t`<${descriptorLabel}> failed to render (likely a bad prop). Copy the source to see what went wrong, or delete the block.`;
    const copySource = () => {
      try {
        const src = reconstructSource(node);
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(src);
        }
      } catch (err) {
        // Clipboard API may be unavailable (permissions, test env). The
        // Delete affordance still works, and the source bytes are safe in
        // the underlying node regardless of clipboard access — log at
        // debug for operator visibility so the stuck-state UX leaves a
        // support trail. The structured warn lets ops compute a
        // recovery-success rate against the existing jsxAutoConvertFailed
        // denominator.
        incrementJsxStuckCopyFailed(descriptor.name);
        console.warn(
          JSON.stringify({
            event: 'jsx-component-stuck-copy-failed',
            component: descriptor.name,
            rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
            reason: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
          }),
        );
      }
    };
    const deleteNode = () => {
      const p = typeof getPos === 'function' ? getPos() : undefined;
      if (typeof p !== 'number') return;
      try {
        editor.chain().focus().setNodeSelection(p).deleteSelection().run();
      } catch (err) {
        // Position races (concurrent remote peer edit, Observer B re-parse
        // shift) are the expected failure shape — classify + log so the
        // stuck-state last-line-of-defense leaves a correlatable trail.
        // Matches the Move Up/Down handler telemetry in the chrome bar so
        // ops can aggregate against a consistent denominator.
        if (!(err instanceof RangeError)) throw err;
        incrementJsxStuckDeleteFailed(descriptor.name);
        console.warn(
          JSON.stringify({
            event: 'jsx-component-stuck-delete-failed',
            component: descriptor.name,
            rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
            reason: err.message.slice(0, 500),
          }),
        );
      }
    };
    return (
      <NodeViewWrapper className="jsx-component-wrapper my-2">
        <div
          className="text-xs font-mono text-muted-foreground px-2 py-2 border border-destructive/40 rounded bg-destructive/5 flex items-center gap-2"
          contentEditable={false}
          {...{ [OPT_OUT_ATTR]: 'true' }}
        >
          <span className="flex-1">{label}</span>
          <button
            type="button"
            className="text-xs underline hover:no-underline"
            onClick={copySource}
          >
            {t`Copy source`}
          </button>
          <button
            type="button"
            className="text-xs underline hover:no-underline"
            onClick={deleteNode}
          >
            {t`Delete`}
          </button>
        </div>
        <NodeViewContent className="component-children" />
      </NodeViewWrapper>
    );
  }

  // Show placeholder while the auto-convert rAF (above) dispatches. This
  // usually flashes for < 1 frame and is invisible; a slow hot-reload on
  // a large doc can surface it. Copy is action-oriented ("source editable
  // below") so even when it does surface, the user reads a meaningful
  // next step rather than implementation jargon.
  if (needsConversion) {
    const componentName = node.attrs.componentName as string;
    const descriptorLabel = descriptor.displayName ?? descriptor.name;
    const label =
      descriptor.name === '*'
        ? t`Unknown component: ${componentName} — source editable below`
        : t`${descriptorLabel} — render error, source editable below`;
    return (
      <NodeViewWrapper className="jsx-component-wrapper my-2">
        <div className="text-xs font-mono text-muted-foreground px-2 py-1" contentEditable={false}>
          {label}
        </div>
        <NodeViewContent className="component-children" />
      </NodeViewWrapper>
    );
  }

  // ── BRANCH 2: Registered healthy render ───────────────────────────────
  const Comp = descriptor.Component;
  const deleteDescriptorLabel = descriptor.displayName ?? descriptor.name;
  const settingsDescriptorLabel = descriptor.displayName ?? descriptor.name;
  const propPanelDescriptorLabel = descriptor.displayName ?? descriptor.name;

  // For components with no editable children (self-closing like Image, …), a
  // click on the rendered body would otherwise land the caret in the node's
  // empty content hole — the user then sees "stuck caret" chrome with no
  // visible cursor and no productive keystrokes. Instead: NodeSelect the
  // component so the chrome highlights and the user can act via arrows /
  // Delete / the gear popover. Uses `onClick` (runs after PM's mousedown
  // has committed) rather than `onMouseDown` (would clobber HTML5 drag).
  // Placeholder-mode click is owned by `<DescriptorPlaceholder onClick>` —
  // skip the wrapper-level handler so setNodeSelection does not double-fire
  // alongside `openPanel`'s own selection + popover-open.
  // Body, keyboard, popover, and prop-edit event ownership lives in
  // `useJsxComponentViewInteractions`; this render owner only wires them.

  // Click-on-placeholder: NodeSelect this block (so chrome / halo reflect
  // it) and open the controlled popover. No rAF-defer needed (unlike the
  // slash-insert auto-open path) — the click is user-event-time and the
  // NodeView is already mounted, so `setNodeSelection` + `setPopoverOpen` can
  // dispatch synchronously.

  // ARIA: role="group" for typed-children containers, with a descriptive
  // aria-label summarizing content. Screen readers announce on focus/select.
  // See precedent "A11y codified in the selection plugin, not retrofitted
  // per-block" and its consumers (SelectionAnnouncer).
  //
  // Descriptor display text is English (all descriptors ship with
  // English labels). Pluralization uses locale-neutral "with N items"
  // shapes that avoid inflecting the descriptor's child name — every
  // string change goes through the `editor-strings.ts` helpers so a
  // future i18n pass has a single place to swap.
  const componentLabel = descriptor.displayName ?? descriptor.name;
  const isGroupContainer = Boolean(descriptor.emptyChildName);
  const groupAriaLabel = isGroupContainer
    ? formatContainerAriaLabel(componentLabel, descriptor.emptyChildName, node.childCount)
    : undefined;

  // Keyboard surface for the NodeView wrapper:
  //  - Backspace/Delete: remove the NodeSelected wrapper. Works from any
  //    focus inside the wrapper subtree, including focusable cE=false
  //    descendants (Accordion `<summary>`, chrome `<button>`) where PM's
  //    keymap doesn't dispatch because DOM focus is outside `view.dom`.
  //  - Enter/Space: open the PropPanel (WCAG 2.1.1 keyboard-equivalent to
  //    clicking the gear) when the descriptor has editable props. For
  //    container components with editable children, the default
  //    NodeSelection → Enter PM behavior (enter the content hole) is
  //    preserved by only handling the key when editable props exist.

  // PropPanel close-handler. Two paths share the same "selection still inside
  // the node" guard (respect user intent when a click-outside has moved PM's
  // selection to a different position):
  //  - Self-closing leaves (Image / Video / Audio): advance the caret past
  //    the node via `TextSelection.near` so typing doesn't land in the empty
  //    content hole. `near` is load-bearing — `setTextSelection(pos+nodeSize)`
  //    can land on a block boundary (parent is a block container, not a
  //    textblock) so typing wraps in a new paragraph.
  //  - Composites (Callout / Accordion / future Tabs+Cards+Steps): restore
  //    NodeSelection on the wrapper. After a popover round-trip, PM's
  //    selection has drifted to TextSelection inside the body (focus on a
  //    focusable cE=false descendant breaks the halo↔selection invariant);
  //    re-anchoring NodeSelection re-paints the halo and lets Backspace
  //    (handled above) delete the block from any subsequent focus state.
  //
  // Defer to rAF so PM's click handler settles first. No `.focus()` call —
  // DOM focus is owned by Radix's `onCloseAutoFocus` on `<PopoverContent>`
  // (returns focus to the trigger button).
  return (
    <Popover open={popoverOpen} onOpenChange={handlePopoverOpenChange}>
      <NodeViewWrapper
        className="jsx-component-wrapper my-2"
        // Stable test-selector contract, decoupled from `className` (which can
        // change for visual reasons). Tests that target "every component
        // wrapper" use `[data-jsx-component]` — do not remove without
        // updating `packages/app/tests/a11y/component-blocks.e2e.ts` etc.
        data-jsx-component=""
        data-component-type={descriptor.name.toLowerCase()}
        // Alignment — driven by the `align` prop on the alignable
        // descriptors (`img` + `CommonMarkImage` + `Embed` + `video` —
        // see `ALIGNABLE_DESCRIPTOR_NAMES`). The wrapper-level
        // `data-align` lets CSS (`styles/editor/component-chrome.css`,
        // `.jsx-component-wrapper[data-component-type="<name>"]
        // [data-align]` selectors) apply a `text-align` rule for
        // centering / left / right placement. When the user sets a
        // non-default alignment on a `CommonMarkImage`, the chrome-bar
        // click handler upgrades the descriptor to `img` (commonmark
        // syntax has no alignment surface); this default-`center`
        // mirroring keeps the pre-click visual consistent with where
        // it'll land.
        //
        // The value is clamped to the `'left' | 'center' | 'right'`
        // enum — an HTML4-era paste like `<img align="middle" />` would
        // otherwise pass through to `[data-align]`, with no matching
        // text-align rule, leaving the wrapper visually unaligned with
        // no diagnostic. Treat anything outside the canonical enum as
        // `'center'`.
        data-align={attributePolicy.dataAlign}
        data-selected={isInnermostSelected ? 'true' : undefined}
        data-has-child-selected={hasChildSelected ? 'true' : undefined}
        data-range-selected={isRangeEncompassed ? 'true' : undefined}
        data-selection-origin={selectionOrigin}
        data-dragging={isDraggingSelf ? 'true' : undefined}
        data-needs-config={needsConfig ? 'true' : undefined}
        // `aria-selected` is intentionally omitted — per WAI-ARIA 1.2, it's
        // only valid on `role` values that support selection semantics
        // (option, tab, row, gridcell, treeitem, columnheader, rowheader).
        // Our wrappers carry `role="group"` (for emptyChildName containers)
        // or no role (for generic block components). Emitting `aria-selected`
        // on those roles is an ARIA conformance violation caught by axe-core.
        // Selection announcement to AT is handled via the `<SelectionAnnouncer>`
        // aria-live region which works regardless of wrapper role.
        role={isGroupContainer ? 'group' : undefined}
        aria-label={groupAriaLabel}
        // Roving tabindex (W3C ARIA Authoring Practices, "Composite Widgets"):
        // exactly one wrapper per editor is in the document tab order at a
        // time — the currently-selected one. Without this, every top-level
        // jsxComponent created an O(N) Tab cost before the user could reach
        // anything outside the editor (presence bar, chrome controls). The
        // wrappers remain reachable via PM's NodeSelection arrow-nav; Tab
        // stays a "leave the editor" affordance, not "step through every
        // block." Matches Gutenberg / Lexical block-editor conventions.
        tabIndex={isInnermostSelected ? 0 : -1}
        {...(!isChildOfComponent && !usesExplicitDragHandle
          ? { 'data-drag-handle': '', draggable: 'true' }
          : { draggable: 'false', onDragStart: (e: React.DragEvent) => e.preventDefault() })}
        data-component-name={descriptor.name}
        data-jsx-interaction={descriptor.interaction?.mode ?? 'atomic'}
        data-pdf-math-formula={
          editableSource?.language === 'latex' &&
          typeof currentProps[editableSource.propName] === 'string'
            ? currentProps[editableSource.propName]
            : undefined
        }
        onClick={handleBodyClick}
        onKeyDown={handleKeyDown}
      >
        {/* Hover-revealed action icons: [↑] [↓] [⚙️] [🗑] — rendered for every
          configured component AND placeholder mode. Placeholder mode keeps the
          chrome (gear, move arrows, delete) visible because the same data-needs-config
          gear-hint UX should apply to fresh slash-inserted blocks the same way it
          does to any other unconfigured-prop block. The placeholder pill provides
          an additional click-to-open affordance via PopoverAnchor; the gear remains
          the canonical PopoverTrigger. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation required inside PM NodeView */}
        <div
          className="jsx-component-chrome"
          contentEditable={false}
          onMouseDown={(e) => e.stopPropagation()}
          {...(usesExplicitDragHandle
            ? {
                'data-jsx-drag-handle': '',
                'data-drag-handle': '',
                draggable: 'true',
              }
            : {})}
          {...{ [OPT_OUT_ATTR]: 'true' }}
        >
          {/* Alignment intentionally absent here — the bubble menu's
            `ImageAlignButtons` is the single alignment surface for every
            descriptor in `ALIGNABLE_DESCRIPTOR_NAMES` (`img` /
            `CommonMarkImage` / `Embed` / `video`). NodeSelection fires
            on the image click and the floating bubble bar lands centered
            above the block, so the old chrome-bar trio + PropPanel
            `Align` Select were redundant duplicates. CommonMarkImage's
            descriptor-upgrade path on first non-default alignment lives
            in `ImageAlignButtons` itself; removing it here doesn't lose
            the conversion. */}

          {/* Open in new tab — `Embed` only. Lets the reader hop to the
            embedded URL when they want the full browser surface.
            `primitiveProps.src` is the sanitize-url.ts-filtered value
            (raw `currentProps.src` would bypass the URL_PROP_NAMES
            scheme allowlist on `<a href>`); we also re-test for
            http(s):// here so the anchor refuses to render for
            data:/blob:/file: schemes even if the sanitizer changes its
            default allowlist in the future. Mirrors the iframe-render
            gate inside `Embed.tsx`. */}
          {descriptor.name === 'Embed' &&
            typeof primitiveProps.src === 'string' &&
            /^https?:\/\//i.test(primitiveProps.src) && (
              <a
                href={primitiveProps.src as string}
                target="_blank"
                rel="noopener noreferrer"
                className="jsx-chrome-btn"
                aria-label={t`Open embedded URL in new tab`}
                // Prevent PM from interpreting the click as a node-selection
                // (the chrome wrapper already stopPropagation's mousedown,
                // but the anchor needs its native click-to-navigate path).
                onMouseDown={(e) => e.stopPropagation()}
              >
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}

          {/* Mirror — "Open source" deep link to the source doc. Mirrors the
            Embed `<a>` pattern but builds a same-origin hash href via
            `hashFromDocName(src, anchor)` instead of an external URL. The
            DocumentProvider's hashchange listener picks up the navigation. */}
          {descriptor.name === 'Mirror' &&
            typeof primitiveProps.src === 'string' &&
            primitiveProps.src.length > 0 &&
            (() => {
              const mirrorSrc = primitiveProps.src as string;
              return (
                <a
                  href={hashFromDocName(
                    mirrorSrc,
                    typeof primitiveProps.anchor === 'string' && primitiveProps.anchor.length > 0
                      ? primitiveProps.anchor
                      : null,
                  )}
                  className="jsx-chrome-btn"
                  aria-label={t`Open source doc: ${mirrorSrc}`}
                  title={t`Open source: ${mirrorSrc}`}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              );
            })()}

          {/* Move up/down — only for children inside containers; hidden at boundaries.
            `doc.resolve(pos)` / `doc.slice(...)` can throw `RangeError` when the
            node's position is out-of-bounds because a concurrent remote peer edit
            (or an in-flight Observer B re-parse) shifted it between render and
            click. We classify that as a user-observable move failure (logged +
            counter-bumped) rather than letting it re-throw into the
            `ComponentErrorBoundary`, which would mis-attribute the click-time
            race as a `jsx-render-failure` and auto-convert this component to
            rawMdxFallback. Pattern mirrors the `isChildOfComponent` probe. */}
          {canMoveUp && (
            <button
              type="button"
              className="jsx-chrome-btn"
              aria-label={t`Move up`}
              onClick={() => {
                try {
                  if (typeof pos !== 'number') return;
                  const $p = editor.state.doc.resolve(pos);
                  const idx = $p.index($p.depth);
                  if (idx === 0) return;
                  const parent = $p.node($p.depth);
                  const prev = parent.child(idx - 1);
                  const from = pos - prev.nodeSize;
                  const to = pos + node.nodeSize;
                  const tr = editor.state.tr;
                  const cur = editor.state.doc.slice(pos, pos + node.nodeSize);
                  const pre = editor.state.doc.slice(from, pos);
                  tr.replaceWith(from, to, cur.content.append(pre.content));
                  editor.view.dispatch(tr.scrollIntoView());
                } catch (err) {
                  if (!(err instanceof RangeError)) throw err;
                  incrementJsxMoveFailed('up');
                  console.warn(
                    JSON.stringify({
                      event: 'jsx-component-move-failed',
                      direction: 'up',
                      component: descriptor.name,
                      rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
                      reason: err.message.slice(0, 500),
                    }),
                  );
                }
              }}
            >
              <ArrowUp size={12} aria-hidden="true" />
            </button>
          )}

          {canMoveDown && (
            <button
              type="button"
              className="jsx-chrome-btn"
              aria-label={t`Move down`}
              onClick={() => {
                try {
                  if (typeof pos !== 'number') return;
                  const $p = editor.state.doc.resolve(pos);
                  const idx = $p.index($p.depth);
                  const parent = $p.node($p.depth);
                  if (idx >= parent.childCount - 1) return;
                  const next = parent.child(idx + 1);
                  const from = pos;
                  const to = pos + node.nodeSize + next.nodeSize;
                  const tr = editor.state.tr;
                  const cur = editor.state.doc.slice(pos, pos + node.nodeSize);
                  const nxt = editor.state.doc.slice(pos + node.nodeSize, to);
                  tr.replaceWith(from, to, nxt.content.append(cur.content));
                  editor.view.dispatch(tr.scrollIntoView());
                } catch (err) {
                  if (!(err instanceof RangeError)) throw err;
                  incrementJsxMoveFailed('down');
                  console.warn(
                    JSON.stringify({
                      event: 'jsx-component-move-failed',
                      direction: 'down',
                      component: descriptor.name,
                      rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
                      reason: err.message.slice(0, 500),
                    }),
                  );
                }
              }}
            >
              <ArrowDown size={12} aria-hidden="true" />
            </button>
          )}

          {/* Edit source — Mermaid + Math. Opens the
              `CodePreviewEditModal` seeded with the source-bearing prop
              (`chart` / `formula`). Modal mount lives at the bottom of
              this component beside the PopoverContent (Dialog uses its
              own Portal). */}
          {editableSource && typeof pos === 'number' ? (
            <button
              type="button"
              className="jsx-chrome-btn"
              aria-label={t`Edit ${descriptor.displayName ?? descriptor.name} source`}
              data-testid="jsx-component-edit-btn"
              onClick={() => setEditModalOpen(true)}
            >
              <Pencil size={12} aria-hidden="true" />
            </button>
          ) : null}

          {/* Delete — positioned between move arrows and settings so the
            settings gear stays anchored at the right edge of the chrome bar
            (consistent "destructive action mid, config action far-right"
            pattern regardless of whether the component has editable props). */}
          <button
            type="button"
            className="jsx-chrome-btn jsx-chrome-btn--delete"
            aria-label={t`Delete ${deleteDescriptorLabel}`}
            onClick={() => {
              if (typeof pos !== 'number') return;
              // Same defensive pattern as the seven other dispatch sites in
              // this file + drag-handle's grip click — narrow on RangeError,
              // bump the keyboard-delete counter (same failure-mode shape),
              // and log a structured warning so ops can aggregate against a
              // consistent denominator. Otherwise an uncaught RangeError
              // from a concurrent CRDT edit propagates to
              // `ComponentErrorBoundary` and auto-converts to
              // `rawMdxFallback`, which presents to the user as the block
              // silently turning into stuck-state placeholder.
              try {
                const dispatched = editor
                  .chain()
                  .focus()
                  .setNodeSelection(pos)
                  .deleteSelection()
                  .run();
                if (!dispatched) {
                  incrementJsxKeyboardDeleteFailed(descriptor.name);
                  console.warn(
                    JSON.stringify({
                      event: 'jsx-component-chrome-delete-failed',
                      component: descriptor.name,
                      rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
                      reason: 'chain-dispatch-returned-false',
                    }),
                  );
                }
              } catch (err) {
                if (!(err instanceof RangeError)) throw err;
                incrementJsxKeyboardDeleteFailed(descriptor.name);
                console.warn(
                  JSON.stringify({
                    event: 'jsx-component-chrome-delete-failed',
                    component: descriptor.name,
                    rawComponentName: String(node.attrs.componentName ?? '').slice(0, 200),
                    reason: err.message.slice(0, 500),
                  }),
                );
              }
            }}
          >
            <Trash2 size={12} aria-hidden="true" />
          </button>

          {/* Settings — opens the controlled PropPanel popover hoisted above
            NodeViewWrapper. `<PopoverTrigger asChild>` is the canonical click-to-
            open path. In placeholder mode the popover is positioned via the
            `<PopoverAnchor>` wrapping the placeholder pill (Anchor takes precedence
            over Trigger for placement); both paths flip the same popoverOpen state. */}
          {hasEditableProps && (
            <PopoverTrigger asChild>
              <button
                type="button"
                className="jsx-chrome-btn"
                data-jsx-gear=""
                aria-label={t`${settingsDescriptorLabel} properties`}
              >
                <Settings2 size={12} aria-hidden="true" />
              </button>
            </PopoverTrigger>
          )}
        </div>

        {/* Live React component — renders exactly like production.
          Self-closing / no-children components get contentEditable={false} so
          native behaviors work (links navigate, etc.). ALL other components
          stay contentEditable (PM manages the content hole).
          NOTE: typed-children containers do NOT use contentEditable={false} —
          PM's hasFocus() walks the ancestor chain and returns false if ANY
          ancestor has contentEditable='false', which breaks selection tracking,
          BubbleMenu, and all PM features for descendants. Instead, a
          filterTransaction plugin (TypedChildrenGuard) rejects unwanted
          insertions at the PM transaction level. */}
        {/*
        Reset mechanism: rely on `componentDidUpdate`'s resetKey-comparison
        branch to clear `errored` state when primitive props change.
        Setting `key={resetKey}` here would force a full remount of the
        live fumadocs subtree on every prop edit — losing component-local
        state (ImageZoom's zoom level, in-flight Radix animations) and
        making `componentDidUpdate` unreachable (key-remount always
        produces a fresh instance where prevProps === props). Keeping
        only the prop-comparison reset preserves component state on
        healthy renders and still clears the error path when the user
        fixes a prop that was causing the render to throw.
      */}
        {showPlaceholder && resolvedPlaceholder ? (
          // No NodeViewContent here for the same reason the healthy branch's
          // Image / Video / Audio components silently drop children: the
          // descriptors that surface the placeholder are self-closing leaves
          // (`hasChildren: false`), so PM never has block children to map.
          // The slot's absence here matches Branch 2 for self-closing leaves;
          // Precedent #30's "always rendered" obligation lives downstream in
          // the renderer that does have children to host (Callout / Accordion).
          <PopoverAnchor asChild>
            <DescriptorPlaceholder
              label={resolvedPlaceholder.label}
              Icon={resolvedPlaceholder.Icon}
              onClick={openPanel}
              selected={isInnermostSelected}
            />
          </PopoverAnchor>
        ) : (
          <ComponentErrorBoundary
            resetKey={resetKey}
            onError={setRenderError}
            descriptorName={descriptor.name === '*' ? 'wildcard' : descriptor.name}
            rawComponentName={(node.attrs.componentName as string) ?? ''}
          >
            <JsxComponentHostProvider
              value={
                typeof getPos === 'function'
                  ? {
                      editor,
                      // Pass the live `getPos` rather than a snapshot — host writes
                      // can fire seconds after render (e.g. ResizeHandles pointerup
                      // for Embed) and snapshot pos drifts under concurrent edits.
                      // Matches the fresh-getPos pattern at every other dispatch
                      // site in this file.
                      getPos: () => {
                        const p = getPos();
                        return typeof p === 'number' ? p : undefined;
                      },
                      // Compound containers (descriptor.emptyChildName is set,
                      // e.g. Tabs) can render their own inline "add child"
                      // affordance by calling this. Mirrors the floating-pill
                      // onClick below; takes the same insert + focus path.
                      addChild: descriptor.emptyChildName
                        ? () => {
                            const childName = descriptor.emptyChildName as string;
                            const childJSON = createChildNode(childName);
                            const insertPos = insertChildAt();
                            editor.chain().focus().insertContentAt(insertPos, childJSON).run();
                            focusInsertedComponent(editor, insertPos, getDescriptor(childName));
                          }
                        : null,
                    }
                  : null
              }
            >
              <Comp {...renderProps}>
                <NodeViewContent
                  className={`component-children ${
                    !descriptor.hasChildren && node.childCount === 0 ? 'min-h-0 m-0 p-0' : ''
                  }`}
                  {...(!descriptor.hasChildren || descriptor.isSelfClosing
                    ? { contentEditable: false }
                    : {})}
                />
              </Comp>
            </JsxComponentHostProvider>
          </ComponentErrorBoundary>
        )}

        {/*
         * "Add child" pill — absolute overlay at bottom edge (containers only).
         *
         * Tabs is the lone exception: when it has ≥1 child, the strip
         * itself owns the inline "Add tab" affordance via `host.addChild()`
         * (see Tabs.tsx), so the floating-bottom pill would be redundant.
         * Tabs' empty-state placeholder (childCount === 0) still renders
         * here — the strip has nothing to anchor an inline button to yet,
         * and the full-width placeholder is the clearer empty-state CTA.
         */}
        {descriptor.emptyChildName &&
          !(descriptor.name === 'Tabs' && node.childCount > 0) &&
          (() => {
            const addChildName = descriptor.emptyChildName;
            return (
              <button
                type="button"
                contentEditable={false}
                className={
                  node.childCount === 0 ? 'jsx-empty-child-placeholder' : 'jsx-add-child-pill'
                }
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  const childName = descriptor.emptyChildName as string;
                  const childJSON = createChildNode(childName);
                  const insertPos = insertChildAt();
                  editor.chain().focus().insertContentAt(insertPos, childJSON).run();
                  focusInsertedComponent(editor, insertPos, getDescriptor(childName));
                }}
                {...{ [OPT_OUT_ATTR]: 'true' }}
              >
                <span>
                  <Trans>+ Add {addChildName}</Trans>
                </span>
              </button>
            );
          })()}
      </NodeViewWrapper>
      {editableSource && typeof pos === 'number' ? (
        <CodePreviewEditModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          initialValue={
            typeof currentProps[editableSource.propName] === 'string'
              ? (currentProps[editableSource.propName] as string)
              : ''
          }
          language={editableSource.language}
          title={t`Edit ${descriptor.displayName ?? descriptor.name} source`}
          renderPreview={(value) => {
            const Component = descriptor.Component;
            // Spread the *sanitized* `renderProps` (post
            // `extractPrimitiveProps` → `sanitizeComponentProps` →
            // `normalizeDocRelativeMediaRenderProps`) rather than raw
            // `currentProps`, matching the production render branch.
            // Today's `editableSource` descriptors (Math /
            // DollarMath / MathFence / MermaidFence) carry no URL-typed
            // props so the practical attack surface is zero, but the
            // sanitization contract documented on `extractPrimitiveProps` ("Every
            // returned object flows through `sanitizeComponentProps`")
            // is structural — keeping the preview on the same path
            // means a future descriptor with URL props can't open an
            // XSS hole by joining the table.
            const previewProps = {
              ...renderProps,
              [editableSource.propName]: value,
              ...(descriptor.name === 'MermaidFence' && {
                className: 'border-0 bg-transparent rounded-none',
              }),
            };

            return (
              <div className="flex h-full w-full items-center justify-center p-4">
                <Component {...previewProps} />
              </div>
            );
          }}
          onSave={(value) => handleModalSave(editableSource.propName, value)}
        />
      ) : null}
      {/* z-60 overrides the shadcn popover base (z-50) so the PropPanel
          reliably sits above other z-50 surfaces (wiki-link Dialog overlays,
          sonner toasts, internal-link Dialogs). The chrome bar in
          `styles/editor/component-chrome.css` also uses z-50; a PopoverContent at the same level is ordered by
          render-order, which isn't a stable guarantee — explicit bump makes
          it deterministic. */}
      {hasEditableProps && (
        // Placeholder mode anchors the popover via PopoverAnchor on the full-
        // width pill, so the right-of-the-gear placement that suits a
        // configured component reads as off-center and disconnected. Drop the
        // popover under the pill, centered horizontally, with a small negative
        // sideOffset so the top of the popover overlaps the bottom of the
        // pill — Notion-style continuation between affordance and form.
        <PopoverContent
          side={showPlaceholder ? 'bottom' : 'right'}
          align={showPlaceholder ? 'center' : 'start'}
          sideOffset={showPlaceholder ? -4 : 8}
          className="w-64 p-3 z-60 overflow-y-auto subtle-scrollbar max-h-(--radix-popper-available-height) overscroll-contain"
          // Self-closing leaves (img/video/audio) want the caret back in the
          // editor body so the user can keep typing — the Notion-style
          // "fill prop → Escape → continue" loop. Radix's default close-time
          // focus restore points at `previouslyFocusedElement` captured when
          // the popover mounted, which is typically the gear button or a
          // now-detached slash-menu element; keystrokes after Escape land
          // there and silently vanish until the user clicks back into the
          // editor. Container components (Callout/Accordion) keep Radix's
          // default — their content hole already pulls focus naturally.
          //
          // Runs inside Radix's setTimeout(0) close-tick, which beats the
          // rAF-deferred caret-advance in handleOpenChange and any other
          // racing focus calls. preventDefault on the unmount-auto-focus
          // event tells FocusScope to skip its own focus() restore.
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <div className="text-xs font-medium text-muted-foreground mb-2">
            <Trans>{propPanelDescriptorLabel} Properties</Trans>
          </div>
          <PropPanel
            descriptor={descriptor}
            values={primitiveProps}
            onDismiss={() => setPopoverOpen(false)}
            onChange={handlePropChange}
          />
          {/* Explicit confirmation affordance. PropPanel auto-saves on
              every keystroke / select change (`onChange` above runs the
              `setNodeMarkup` dispatch) — the button doesn't gate the
              save, it gives users the psychological closure UX research
              flagged was missing ("I just write, and it
              just, like, disappears" — without a confirm affordance
              authors interpret the auto-dismiss-on-outside-click as
              losing their changes, even though the changes already
              landed). Click closes the popover; the
              `onCloseAutoFocus`-driven editor refocus above handles
              the focus restore. */}
          <div className="mt-3 flex justify-end border-t border-border pt-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setPopoverOpen(false)}
              className="h-7 px-3 text-xs"
            >
              <Trans>Done</Trans>
            </Button>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
