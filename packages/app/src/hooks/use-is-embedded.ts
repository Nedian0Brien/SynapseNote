import { detectEmbeddedHostFromBrowser } from '@nedian0brien/synapsenote-core';
import { useState } from 'react';

export function useIsEmbedded(): boolean {
  const [embedded] = useState(() => detectEmbeddedHostFromBrowser() != null);
  return embedded;
}
