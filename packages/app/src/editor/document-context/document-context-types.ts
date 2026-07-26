/**
 * Public type boundary for document-context consumers.
 *
 * The provider remains the compatibility facade for now, but downstream
 * modules import these contracts from this file so a future provider split
 * does not require touching every navigation, tab, panel, or collaboration
 * consumer.
 */
export type {
  CloseTabsOptions,
  DocumentContextValue,
  OpenTargetOptions,
  PoolEntrySnapshot,
} from '../DocumentContext';
