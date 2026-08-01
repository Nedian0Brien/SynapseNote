import { createContext } from 'react';
import type { DocumentContextValue } from './document-context-types';

/**
 * State owner: document-context runtime. Render owner: DocumentProvider facade.
 * Consumers read this contract without importing the provider implementation.
 */
export const DocumentContext = createContext<DocumentContextValue | null>(null);
