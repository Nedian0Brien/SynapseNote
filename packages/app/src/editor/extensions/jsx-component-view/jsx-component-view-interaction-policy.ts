/** Decides whether a wrapper key belongs to NodeView interaction or its focused control. */
export function shouldHandleJsxNodeViewKey({
  hasEditableProps = false,
  inTextInput = false,
  isInnermostSelected = false,
  isSelected = false,
  key,
}: {
  hasEditableProps?: boolean;
  inTextInput?: boolean;
  isInnermostSelected?: boolean;
  isSelected?: boolean;
  key: string;
}): 'delete' | 'ignore' | 'popover' {
  if ((key === 'Backspace' || key === 'Delete') && isInnermostSelected && !inTextInput) {
    return 'delete';
  }
  if ((key === 'Enter' || key === ' ') && isSelected && hasEditableProps) return 'popover';
  return 'ignore';
}

/** Keeps leaf-body selection from stealing focus from portals or native controls. */
export function shouldSelectJsxLeafFromBodyClick({
  isInteractiveTarget,
  isSelfClosingLeaf,
  selectOnBodyClick,
  selectionIsInsideNode,
  targetIsActionPill,
  targetIsChrome,
  targetIsInsideWrapper,
}: {
  isInteractiveTarget: boolean;
  isSelfClosingLeaf: boolean;
  selectOnBodyClick: boolean;
  selectionIsInsideNode: boolean;
  targetIsActionPill: boolean;
  targetIsChrome: boolean;
  targetIsInsideWrapper: boolean;
}): boolean {
  return (
    isSelfClosingLeaf &&
    selectOnBodyClick &&
    targetIsInsideWrapper &&
    !targetIsChrome &&
    !targetIsActionPill &&
    !isInteractiveTarget &&
    selectionIsInsideNode
  );
}
