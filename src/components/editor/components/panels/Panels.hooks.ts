import { useContext } from 'react';

import { PanelContext } from '@/components/editor/components/panels/PanelsContext';

export function usePanelContext () {
  const panel = useContext(PanelContext);

  return panel;
}