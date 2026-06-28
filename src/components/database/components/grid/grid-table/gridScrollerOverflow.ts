export interface GridScrollerOverflow {
  overflowX: 'auto';
  overflowY: 'auto' | 'hidden';
}

export function getGridScrollerOverflow({
  isDocumentBlock,
  isMobile,
}: {
  isDocumentBlock?: boolean;
  isMobile: boolean;
}): GridScrollerOverflow {
  const usePageVerticalScroll = !isDocumentBlock && isMobile;

  return {
    overflowY: usePageVerticalScroll ? 'hidden' : 'auto',
    overflowX: 'auto',
  };
}
