import type { SynapseGraphData } from './outlineToGraph';

export function GraphView(props: {
  graphData: SynapseGraphData;
  refreshKey?: string | number;
  onOpenNode?: (nodeId: string) => void;
}): JSX.Element;
