export const BLANK_HTML_BODY = `<div style="padding:20px;font-family:system-ui,sans-serif;color:var(--foreground)">
  <h1 style="margin:0 0 8px;font-size:20px;font-weight:600">Hello, world!</h1>
  <p style="margin:0;color:var(--muted-foreground)">Edit this HTML — the preview updates live.</p>
</div>`;

export const EMBED_STARTER_ALIASES: Record<string, string[]> = {
  chart: ['chart', 'bar', 'graph', 'plot', 'viz', 'data', 'embed', 'preview'],
  'stat-cards': ['stat', 'stats', 'metric', 'metrics', 'cards', 'kpi', 'embed', 'preview'],
  'custom-svg': ['svg', 'vector', 'graphic', 'illustration', 'ring', 'embed', 'preview'],
  'interactive-control': [
    'interactive',
    'slider',
    'control',
    'widget',
    'input',
    'embed',
    'preview',
  ],
};
