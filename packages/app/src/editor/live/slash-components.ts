import { builtInComponents } from '@nedian0brien/synapsenote-core';

// Custom creation flows own File, DatabaseView and compound-only Tab. Native
// math/Mermaid items already insert the canonical fenced source forms.
const custom = new Set(['File', 'DatabaseView', 'Tab', 'Math', 'MermaidFence']);
export const liveSlashComponents = builtInComponents.filter(
  (descriptor) => descriptor.surface === 'canonical' && !custom.has(descriptor.name),
);

function attribute(name: string, value: unknown): string {
  if (typeof value === 'string') {
    const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return `${name}="${escaped}"`;
  }
  return `${name}={${JSON.stringify(value)}}`;
}

/** Explicit registry defaults only: absent optional properties stay absent. */
export function liveComponentSource(name: string, overrides: Record<string, unknown> = {}): string {
  const descriptor = builtInComponents.find((item) => item.name === name);
  if (!descriptor) throw new Error(`Unknown slash component: ${name}`);
  const props: Record<string, unknown> = {};
  for (const prop of descriptor.props) {
    if (prop.type !== 'reactnode' && 'defaultValue' in prop && prop.defaultValue !== undefined) {
      props[prop.name] = prop.defaultValue;
    }
  }
  Object.assign(props, overrides);
  const attrs = Object.entries(props)
    .map(([key, value]) => ` ${attribute(key, value)}`)
    .join('');
  if (name === 'Tabs') {
    return `<Tabs${attrs}>\n\n<Tab label="Tab 1">\n\n</Tab>\n\n<Tab label="Tab 2">\n\n</Tab>\n\n</Tabs>\n\n`;
  }
  return descriptor.hasChildren ? `<${name}${attrs}>\n\n</${name}>\n\n` : `<${name}${attrs} />\n\n`;
}
