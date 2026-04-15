import { describe, expect, it } from 'vitest';
import {
  closeTabState,
  deleteTabState,
  normalizeLayout,
  openTabState,
  replaceActiveTabState,
  renameTabState,
} from './shellState';

describe('shellState', () => {
  it('새 경로를 열면 탭을 추가하고 활성 탭으로 만든다', () => {
    expect(openTabState([], null, 'notes/a.md')).toEqual({
      tabs: [{ id: 'notes/a.md', path: 'notes/a.md' }],
      activeTabId: 'notes/a.md',
    });
  });

  it('이미 열린 경로를 열면 중복 없이 해당 탭으로 포커스한다', () => {
    expect(
      openTabState(
        [{ id: 'notes/a.md', path: 'notes/a.md' }],
        null,
        'notes/a.md',
      ),
    ).toEqual({
      tabs: [{ id: 'notes/a.md', path: 'notes/a.md' }],
      activeTabId: 'notes/a.md',
    });
  });

  it('탭을 닫으면 인접 탭을 활성화한다', () => {
    expect(
      closeTabState(
        [
          { id: 'a.md', path: 'a.md' },
          { id: 'b.md', path: 'b.md' },
          { id: 'c.md', path: 'c.md' },
        ],
        'b.md',
        'b.md',
      ),
    ).toEqual({
      tabs: [
        { id: 'a.md', path: 'a.md' },
        { id: 'c.md', path: 'c.md' },
      ],
      activeTabId: 'c.md',
    });
  });

  it('탭 이름이 바뀌면 활성 탭과 목록을 같이 갱신한다', () => {
    expect(
      renameTabState(
        [
          { id: 'a.md', path: 'a.md' },
          { id: 'b.md', path: 'b.md' },
        ],
        'b.md',
        'renamed.md',
        'b.md',
      ),
    ).toEqual({
      tabs: [
        { id: 'a.md', path: 'a.md' },
        { id: 'renamed.md', path: 'renamed.md' },
      ],
      activeTabId: 'renamed.md',
    });
  });

  it('열린 문서를 삭제하면 탭을 제거하고 다음 활성 탭을 고른다', () => {
    expect(
      deleteTabState(
        [
          { id: 'a.md', path: 'a.md' },
          { id: 'b.md', path: 'b.md' },
        ],
        'b.md',
        'b.md',
      ),
    ).toEqual({
      tabs: [{ id: 'a.md', path: 'a.md' }],
      activeTabId: 'a.md',
    });
  });

  it('현재 탭 교체는 활성 탭 경로만 바꾸고 전체 탭 수는 유지한다', () => {
    expect(
      replaceActiveTabState(
        [
          { id: 'a.md', path: 'a.md' },
          { id: 'b.md', path: 'b.md' },
        ],
        'a.md',
        'c.md',
      ),
    ).toEqual({
      tabs: [
        { id: 'c.md', path: 'c.md' },
        { id: 'b.md', path: 'b.md' },
      ],
      activeTabId: 'c.md',
    });
  });

  it('모바일에서는 split 레이아웃을 단일 뷰로 강등한다', () => {
    expect(normalizeLayout('split', true, 'editor')).toBe('editor');
    expect(normalizeLayout('split', true, 'graph')).toBe('graph');
    expect(normalizeLayout('split', false, 'editor')).toBe('split');
  });
});
