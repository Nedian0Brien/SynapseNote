import { useState, useRef, useEffect } from 'react';

export function ChatPanel({ open = false, peerOpen = false, docked = false, onToggle, onTogglePin }) {
  const [messages, setMessages] = useState([
    { role: 'agent', content: 'AI Research Notes 관련 5개 노드를 불러왔습니다. 무엇이 궁금하신가요?', cites: ['Transformer', 'Attention'] },
    { role: 'user', content: 'Multi-head Attention이 왜 중요해?' },
    { role: 'agent', content: '각 헤드가 독립적인 Q·K·V를 학습하므로, 문법·의미 등 다양한 관계를 동시에 포착합니다.', cites: ['Attention Mechanism'] },
  ]);
  const [input, setInput] = useState('');
  const [ctxOpen, setCtxOpen] = useState(false);
  const msgsRef = useRef(null);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'agent', content: '컨텍스트를 기반으로 분석 중입니다. 더 궁금한 점이 있으신가요?', cites: ['Transformer'] }]);
    }, 500);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTogglePin = (event) => {
    event.stopPropagation();
    onTogglePin?.();
  };

  const handleToggleCtx = (event) => {
    event.stopPropagation();
    setCtxOpen(prev => !prev);
  };

  return (
    <div className={`fp fp-chat${open ? ' open' : ''}${peerOpen ? ' peer-open' : ''}${docked ? ' docked' : ''}`}>
      <div className="fp-handle" onClick={onToggle}>
        <span className="icon fp-icon">chat</span>
        <span className="fp-label">SynapseNote AI</span>
        <button className="fp-pin" type="button" onClick={handleTogglePin}>
          <span className="icon">{docked ? 'push_pin' : 'keep'}</span>
        </button>
        <button className="fp-handle-btn" type="button" aria-label="채팅 패널 토글">
          <span className="icon fp-chevron">expand_less</span>
        </button>
      </div>
      <div className="chat-body chat-body--preview">
        <div className="chat-msgs" ref={msgsRef}>
          {messages.map((msg, i) => (
            <div key={i} className={`msg ${msg.role === 'user' ? 'user' : 'agent'}`}>
              <div className="msg-av">
                {msg.role === 'user' ? 'M' : <span className="icon">psychology</span>}
              </div>
              <div className="msg-body">
                <div className="bubble">
                  {msg.content}
                  {msg.cites?.length ? (
                    <div className="cites">
                      {msg.cites.map((cite) => (
                        <div className="cite" key={cite}>
                          <span className="icon">article</span>{cite}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="msg-time">오후 2:15</div>
              </div>
            </div>
          ))}
        </div>
        <div className={`chat-ctx-drawer${ctxOpen ? ' open' : ''}`}>
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
        <div className="chat-input-area">
          <div className="chat-input-box">
            <textarea
              placeholder="메시지를 입력하세요..."
              rows="1"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className="chat-send" onClick={handleSend}>
              <span className="icon">send</span>
            </button>
          </div>
          <div className="chat-input-meta">
            <button className="im-btn"><span className="icon">attach_file</span>첨부</button>
            <div className="im-sep" />
            <button className={`im-ctx${ctxOpen ? ' active' : ''}`} onClick={handleToggleCtx}>
              <span className="icon">layers</span>5개 · 6.2k
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}