import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphView } from './GraphView';

vi.mock('pixi.js', () => {
  class MockContainer {
    constructor() {
      this.children = [];
      this.position = { set() {} };
      this.scale = { set() {} };
      this.filters = null;
      this.blendMode = null;
      this.eventMode = 'auto';
      this.alpha = 1;
      this.visible = true;
    }

    addChild(...children) {
      this.children.push(...children);
      return children[0] ?? null;
    }

    removeChildren() {
      this.children = [];
    }
  }

  class MockGraphics extends MockContainer {
    clear() {}
    moveTo() {}
    lineTo() {}
    stroke() {}
    circle() {}
    fill() {}
    ellipse() {}
  }

  class MockText extends MockContainer {
    constructor(options = {}) {
      super();
      this.text = options.text ?? '';
      this.anchor = options.anchor ?? 0;
      this.style = { ...(options.style ?? {}) };
      this.tint = 0xffffff;
      this.x = 0;
      this.y = 0;
    }
  }

  class MockApplication {
    constructor() {
      this.stage = new MockContainer();
      this.renderer = { resize() {} };
    }

    async init() {}
    render() {}
    destroy() {}
  }

  class MockBlurFilter {
    constructor(options = {}) {
      this.options = options;
    }
  }

  return {
    Application: MockApplication,
    BlurFilter: MockBlurFilter,
    Container: MockContainer,
    Graphics: MockGraphics,
    Text: MockText,
  };
});

const mockGraphState = {
  nodes: [
    { id: 'n1', title: 'AI Research Notes', name: 'AI Research Notes', type: 'Directory' },
    { id: 'n2', title: 'Transformer Architecture', name: 'Transformer Architecture', type: 'Document' },
  ],
  edges: [{ source: 'n1', target: 'n2', edge_type: 'directory' }],
  stats: { nodes: 2, edges: 1 },
  loading: false,
  error: null,
  refetch: vi.fn(),
};

vi.mock('../../shared/hooks/useGraph', () => ({
  useGraph: () => mockGraphState,
}));

describe('GraphView', () => {
  beforeEach(() => {
    mockGraphState.loading = false;
    mockGraphState.error = null;
    mockGraphState.refetch = vi.fn();
  });

  it('main-ui-preview 구조의 그래프 셸을 렌더링한다', async () => {
    render(<GraphView />);

    expect(screen.getByPlaceholderText('노드 검색…')).toBeInTheDocument();
    expect(document.querySelector('.stats strong')?.textContent).toBe('2');
    expect(document.querySelectorAll('.legend-row').length).toBe(3);
    expect(document.querySelector('.dock-type')?.textContent).toBe('Directory');
    expect(document.querySelector('canvas.graph-canvas')).toBeTruthy();

    await waitFor(() => {
      expect(document.querySelector('.graph-stage')?.getAttribute('data-stage-ready')).toBe('yes');
    });
  });

  it('에러 상태에서는 재시도 화면을 보여준다', () => {
    mockGraphState.error = 'graph fetch failed: 500';

    render(<GraphView />);

    expect(screen.getByText('graph fetch failed: 500')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('설정 패널 토글만으로 그래프 캔버스를 재생성하지 않는다', async () => {
    render(<GraphView />);

    await waitFor(() => {
      expect(document.querySelector('.graph-stage')?.getAttribute('data-stage-ready')).toBe('yes');
    });

    const canvasBefore = document.querySelector('canvas.graph-canvas');
    expect(canvasBefore).toBeTruthy();

    fireEvent.click(screen.getByTitle('그래프 설정'));

    await waitFor(() => {
      expect(document.querySelector('.graph-settings-card')).toBeTruthy();
      expect(document.querySelector('canvas.graph-canvas')).toBe(canvasBefore);
    });
  });
});
