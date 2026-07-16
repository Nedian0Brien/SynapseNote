import pdfiumWasmUrl from '@embedpdf/pdfium/pdfium.wasm?url';
import { useEffect, useState } from 'react';

type SharedPdfiumEngine = ReturnType<
  typeof import('@embedpdf/engines/pdfium-worker-engine')['createPdfiumEngine']
>;

interface PdfiumEngineState {
  engine: SharedPdfiumEngine | null;
  loading: boolean;
  error: Error | null;
}

const listeners = new Set<(state: PdfiumEngineState) => void>();
let state: PdfiumEngineState = { engine: null, loading: false, error: null };
let enginePromise: Promise<SharedPdfiumEngine> | null = null;

function publish(next: PdfiumEngineState): void {
  state = next;
  for (const listener of listeners) listener(next);
}

/**
 * PDFium is a 4+ MB WASM runtime. Keep one worker-backed engine for the app
 * session so reopening a PDF or keeping several PDF tabs warm does not compile
 * another WASM module for every mounted viewer. Individual EmbedPDF registries
 * still own and close their documents when their viewer unmounts.
 */
function ensureSharedEngine(): Promise<SharedPdfiumEngine> {
  if (state.engine) return Promise.resolve(state.engine);
  if (enginePromise) return enginePromise;

  publish({ engine: null, loading: true, error: null });
  enginePromise = import('@embedpdf/engines/pdfium-worker-engine')
    .then(({ createPdfiumEngine }) => {
      const engine = createPdfiumEngine(pdfiumWasmUrl, {
        encoderPoolSize: 2,
        // OpenKnowledge is local-first. Embedded PDF fonts are sufficient for
        // normal documents; disabling fallback prevents silent CDN requests.
        fontFallback: null,
      });
      publish({ engine, loading: false, error: null });
      return engine;
    })
    .catch((cause: unknown) => {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      enginePromise = null;
      publish({ engine: null, loading: false, error });
      throw error;
    });
  return enginePromise;
}

export function useSharedPdfiumEngine(): PdfiumEngineState {
  const [snapshot, setSnapshot] = useState<PdfiumEngineState>(state);

  useEffect(() => {
    listeners.add(setSnapshot);
    void ensureSharedEngine().catch(() => {
      // The shared snapshot already carries the surfaced error. Avoid an
      // unhandled rejection while allowing a later mount to retry.
    });
    return () => {
      listeners.delete(setSnapshot);
    };
  }, []);

  return snapshot;
}
