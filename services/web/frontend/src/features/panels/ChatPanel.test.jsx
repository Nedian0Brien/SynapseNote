import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatPanel } from './ChatPanel';

describe('ChatPanel', () => {
  it('preview 구조의 채팅 패널을 렌더링한다', () => {
    render(<ChatPanel />);

    expect(screen.getByText('SynapseNote AI')).toBeInTheDocument();
    expect(screen.getByText('Context Window')).toBeInTheDocument();
    expect(screen.getByText('AI Research Notes')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('메시지를 입력하세요...')).toBeInTheDocument();
  });
});
