export function GraphSettingsPanel({
  graphSettings,
  onClose,
  onReset,
  onUpdateSetting,
}) {
  return (
    <div className="graph-settings-card">
      <div className="gs-header">
        <span className="gs-title">그래프 설정</span>
        <button className="gs-close" onClick={onClose}>
          <span className="icon" style={{ fontSize: 16 }}>close</span>
        </button>
      </div>

      <div className="gs-section">
        <div className="gs-section-title">영역 라벨 전환</div>
        <label className="gs-row">
          <span className="gs-label">Phase 1 시작</span>
          <input type="range" min="0.05" max="0.60" step="0.01" value={graphSettings.phase1Start}
            onChange={(event) => onUpdateSetting('phase1Start', +event.target.value)} />
          <span className="gs-value">{graphSettings.phase1Start.toFixed(2)}</span>
        </label>
        <label className="gs-row">
          <span className="gs-label">Phase 2 끝</span>
          <input type="range" min="0.30" max="1.00" step="0.01" value={graphSettings.phase2FadeEnd}
            onChange={(event) => onUpdateSetting('phase2FadeEnd', +event.target.value)} />
          <span className="gs-value">{graphSettings.phase2FadeEnd.toFixed(2)}</span>
        </label>
        <label className="gs-row">
          <span className="gs-label">글자 표시</span>
          <input type="range" min="0.30" max="1.50" step="0.01" value={graphSettings.labelShowStart}
            onChange={(event) => onUpdateSetting('labelShowStart', +event.target.value)} />
          <span className="gs-value">{graphSettings.labelShowStart.toFixed(2)}</span>
        </label>
      </div>

      <div className="gs-section">
        <div className="gs-section-title">영역 라벨 스타일</div>
        <label className="gs-row">
          <span className="gs-label">Phase 1 크기</span>
          <input type="range" min="20" max="120" step="2" value={graphSettings.areaFontSizeP1}
            onChange={(event) => onUpdateSetting('areaFontSizeP1', +event.target.value)} />
          <span className="gs-value">{graphSettings.areaFontSizeP1}</span>
        </label>
        <label className="gs-row">
          <span className="gs-label">Phase 2 크기</span>
          <input type="range" min="16" max="80" step="2" value={graphSettings.areaFontSizeP2}
            onChange={(event) => onUpdateSetting('areaFontSizeP2', +event.target.value)} />
          <span className="gs-value">{graphSettings.areaFontSizeP2}</span>
        </label>
        <label className="gs-row">
          <span className="gs-label">글자 투명도</span>
          <input type="range" min="0.10" max="1.00" step="0.02" value={graphSettings.areaLabelAlpha}
            onChange={(event) => onUpdateSetting('areaLabelAlpha', +event.target.value)} />
          <span className="gs-value">{graphSettings.areaLabelAlpha.toFixed(2)}</span>
        </label>
      </div>

      <div className="gs-section">
        <div className="gs-section-title">물리 시뮬레이션</div>
        <label className="gs-row">
          <span className="gs-label">반발력</span>
          <input type="range" min="-600" max="-30" step="10" value={graphSettings.chargeStrength}
            onChange={(event) => onUpdateSetting('chargeStrength', +event.target.value)} />
          <span className="gs-value">{graphSettings.chargeStrength}</span>
        </label>
        <label className="gs-row">
          <span className="gs-label">링크 길이</span>
          <input type="range" min="30" max="250" step="5" value={graphSettings.linkDistance}
            onChange={(event) => onUpdateSetting('linkDistance', +event.target.value)} />
          <span className="gs-value">{graphSettings.linkDistance}</span>
        </label>
        <label className="gs-row">
          <span className="gs-label">링크 인력</span>
          <input type="range" min="0.05" max="1.50" step="0.05" value={graphSettings.linkStrength}
            onChange={(event) => onUpdateSetting('linkStrength', +event.target.value)} />
          <span className="gs-value">{graphSettings.linkStrength.toFixed(2)}</span>
        </label>
        <label className="gs-row">
          <span className="gs-label">중력</span>
          <input type="range" min="0.00" max="0.20" step="0.005" value={graphSettings.centerStrength}
            onChange={(event) => onUpdateSetting('centerStrength', +event.target.value)} />
          <span className="gs-value">{graphSettings.centerStrength.toFixed(3)}</span>
        </label>
      </div>

      <button className="gs-reset" onClick={onReset}>
        <span className="icon" style={{ fontSize: 14 }}>restart_alt</span>
        초기화
      </button>
    </div>
  );
}

export function GraphCardView({
  cardModeNode,
  cardNodes,
  nodeMeta,
  cardViewRef,
  cardGridRef,
  onBack,
  onWheel,
  onTouchStart,
  onTouchEnd,
}) {
  return (
    <div className={`card-view${cardModeNode ? '' : ' hidden'}`} ref={cardViewRef} onWheel={onWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="card-view-header">
        <button className="card-back" onClick={onBack}>
          <span className="icon" style={{ fontSize: 17 }}>arrow_back</span>
        </button>
        <span className="card-view-title">{cardModeNode?.name ?? '—'}</span>
        <span className="card-view-hint">{cardNodes.length ? `연결된 노드 ${cardNodes.length}개` : ''}</span>
      </div>
      <div className="card-grid" ref={cardGridRef}>
        {cardNodes.map((node) => {
          const meta = nodeMeta.get(node.id);
          return (
            <div className="card-item" key={node.id} data-node-id={node.id}>
              <div className="card-item-header">
                <span className="icon card-item-icon">{meta?.icon ?? 'article'}</span>
                <span className="card-item-type">{meta?.type ?? 'Document'}</span>
              </div>
              <div className="card-item-title">{node.name}</div>
              <div className="card-item-preview">{meta?.preview}</div>
              <div className="card-item-divider" />
              <div className="card-item-meta">
                <span className="icon">link</span>{meta?.links ?? 0}
                <span className="icon" style={{ marginLeft: 6 }}>schedule</span>{meta?.age ?? '—'}
              </div>
              <div className="card-item-tags">
                {meta?.tags?.map((tag) => <span className="card-item-tag" key={tag}>{tag}</span>)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="card-exit-hint">
        <span className="icon">keyboard_arrow_down</span>스크롤 다운 또는 축소하면 그래프로 복귀
      </div>
    </div>
  );
}
