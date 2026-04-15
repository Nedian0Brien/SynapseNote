export function ContextPanel({ open = false, peerOpen = false, onToggle }) {
  return (
    <div className={`fp fp-ctx${open ? ' open' : ''}${peerOpen ? ' peer-open' : ''}`}>
      <div className="fp-handle" onClick={onToggle}>
        <span className="icon fp-icon">layers</span>
        <span className="fp-label">Context</span>
        <span className="ctx-badge">5</span>
        <button className="fp-handle-btn" type="button" aria-label="컨텍스트 패널 토글">
          <span className="icon fp-chevron">expand_less</span>
        </button>
      </div>
      <div className="ctx-body">
        <div className="tok-mini">
          <div className="tok-row"><span>Context Window</span><span>6.2k / 32k</span></div>
          <div className="tok-track"><div className="tok-fill" /></div>
        </div>
        <div className="ctx-sec-hd"><div className="ctx-sec-dot pin" /><span className="ctx-sec-label">고정됨</span><span className="ctx-sec-count">2</span></div>
        <div className="ctx-card pinned"><span className="icon">folder</span><span className="ctx-card-t">AI Research Notes</span><span className="ctx-card-tok">1,840</span></div>
        <div className="ctx-card pinned"><span className="icon">article</span><span className="ctx-card-t">Transformer Architecture</span><span className="ctx-card-tok">960</span></div>
        <div className="ctx-sec-hd"><div className="ctx-sec-dot inc" /><span className="ctx-sec-label">포함됨</span><span className="ctx-sec-count">3</span></div>
        <div className="ctx-card"><span className="icon">article</span><span className="ctx-card-t">Attention Mechanism</span><span className="ctx-card-tok">780</span></div>
        <div className="ctx-card"><span className="icon">folder</span><span className="ctx-card-t">Embeddings</span><span className="ctx-card-tok">540</span></div>
        <div className="ctx-card"><span className="icon">article</span><span className="ctx-card-t">RAG Pipeline</span><span className="ctx-card-tok">620</span></div>
        <div className="ctx-sec-hd"><div className="ctx-sec-dot sug" /><span className="ctx-sec-label">추천됨</span><span className="ctx-sec-count">2</span></div>
        <div className="ctx-card sug"><span className="icon">article</span><span className="ctx-card-t">GPT vs BERT</span><span className="ctx-card-tok">~890</span></div>
        <div className="ctx-card sug"><span className="icon">article</span><span className="ctx-card-t">Vector DB</span><span className="ctx-card-tok">~540</span></div>
      </div>
    </div>
  );
}