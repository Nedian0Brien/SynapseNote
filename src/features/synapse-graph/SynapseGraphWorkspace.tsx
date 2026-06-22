import { useMemo } from 'react';

import { View, YDoc } from '@/application/types';

import { GraphView } from './GraphView.jsx';
import { currentDocumentLinks } from './currentDocumentLinks';
import { outlineToGraph } from './outlineToGraph';

type SynapseGraphWorkspaceProps = {
  outline?: View[];
  currentDoc?: YDoc;
  currentViewId?: string;
  open: boolean;
  refreshKey?: string | number;
  onClose: () => void;
  onOpenView: (viewId: string) => void;
};

export function SynapseGraphWorkspace({
  outline,
  currentDoc,
  currentViewId,
  open,
  refreshKey,
  onClose,
  onOpenView,
}: SynapseGraphWorkspaceProps) {
  const knownViewIds = useMemo(() => collectViewIds(outline), [outline]);
  const graphData = useMemo(() => {
    const documentEdges = currentDocumentLinks({
      doc: currentDoc,
      sourceViewId: currentViewId,
      knownViewIds,
    });

    return outlineToGraph(outline, documentEdges);
  }, [currentDoc, currentViewId, knownViewIds, open, outline]);

  if (!open) return null;

  return (
    <div className="synapse-graph-overlay" role="dialog" aria-modal="true" aria-label="SynapseNote Graph">
      <button className="synapse-graph-close" type="button" onClick={onClose} aria-label="그래프 닫기">
        <span className="icon">close</span>
      </button>
      <GraphView graphData={graphData} refreshKey={refreshKey} onOpenNode={onOpenView} />
    </div>
  );
}

function collectViewIds(outline?: View[]) {
  const ids = new Set<string>();
  const visit = (view: View) => {
    if (view.view_id) {
      ids.add(view.view_id);
    }

    view.children?.forEach(visit);
  };

  outline?.forEach(visit);
  return ids;
}
