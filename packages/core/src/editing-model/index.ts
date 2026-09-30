export {
  type CommentWidgetSource,
  commentWidgetSource,
  type FootnoteWidgetSource,
  footnoteWidgetSource,
  updateCommentWidget,
  updateFootnoteWidget,
} from './auxiliary-widget.ts';
export {
  type BlockWidgetEdit,
  type CodeWidgetSource,
  type ContainerWidgetSource,
  codeWidgetSource,
  containerWidgetSource,
  type DiagramWidgetSource,
  diagramWidgetSource,
  type IndentedCodeWidgetSource,
  indentedCodeWidgetSource,
  type MediaWidgetSource,
  mediaWidgetSource,
  type TableCellSource,
  type TableWidgetSource,
  tableWidgetSource,
  updateBlockWidget,
} from './block-widget.ts';
export { type SourceChange, sourceChanges } from './changes.ts';
export {
  applyAction,
  applyActions,
  type EditResult,
  type EditState,
  initialState,
  type SourceUndo,
  type ToggleMark,
} from './edit.ts';
export {
  type BlockKind,
  type EditAction,
  type EditFixture,
  editFixtures,
  type HideFixture,
  hideFixtures,
  parseCursor,
  parseMarked,
  type WidgetFixture,
  widgetFixtures,
} from './fixtures.ts';
export { canInsertSourceFootnote, insertSourceFootnote } from './footnote.ts';
export { IncrementalLayout, type IncrementalLayoutStats } from './incremental-layout.ts';
export {
  type BlockLayout,
  computeBlockLayouts,
  computeLayout,
  type HiddenKind,
  type HiddenRange,
  type Layout,
  type MarkSpan,
  type MarkType,
  type StyledSpan,
  type WidgetKind,
  type WidgetRange,
} from './layout.ts';
export { type SourceLink, sourceLinkAt, updateSourceLink } from './link.ts';
export {
  type MdxWidgetAttribute,
  type MdxWidgetEdit,
  type MdxWidgetSource,
  mdxWidgetSource,
  updateMdxWidget,
} from './mdx-widget.ts';
export {
  type ReferenceDefinitionSource,
  referenceDefinitionSource,
  referenceDefinitionsFromBlocks,
  referenceDefinitionsFromSource,
  updateReferenceDefinition,
} from './reference-definition.ts';
export {
  type TabsWidgetEdit,
  type TabsWidgetPanel,
  type TabsWidgetSource,
  tabsWidgetSource,
  updateTabsWidget,
} from './tabs-widget.ts';
export { applyActionsInWindow, editWindow, type WindowRange } from './window.ts';
