import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContextPanel } from './ContextPanel';

describe('ContextPanel', () => {
  it('preview 구조의 컨텍스트 패널을 렌더링한다', () => {
    render(<ContextPanel />);

    expect(screen.getByText('Context')).toBeInTheDocument();
    expect(screen.getByText('Context Window')).toBeInTheDocument();
    expect(screen.getByText('고정됨')).toBeInTheDocument();
    expect(screen.getByText('추천됨')).toBeInTheDocument();
    expect(screen.getByText('AI Research Notes')).toBeInTheDocument();
  });
});
