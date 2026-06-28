import React from 'react';
import { render } from '@testing-library/react';

import { AFScroller } from '@/components/_shared/scroller';

const ScrollbarsMock = jest.fn();

jest.mock('react-custom-scrollbars-2', () => ({
  Scrollbars: React.forwardRef<HTMLDivElement, { children: React.ReactNode }>((props, ref) => (
    <div ref={ref} data-testid="custom-scrollbars">
      {props.children}
      {ScrollbarsMock(props)}
    </div>
  )),
}));

describe('AFScroller', () => {
  beforeEach(() => {
    ScrollbarsMock.mockClear();
  });

  it('uses custom scrollbars by default', () => {
    const { getByTestId } = render(<AFScroller>content</AFScroller>);

    expect(getByTestId('custom-scrollbars')).not.toBeNull();
    expect(ScrollbarsMock).toHaveBeenCalledTimes(1);
  });

  it('can use a native scroll container without rendering custom scrollbar wrappers', () => {
    const setScrollableContainer = jest.fn();
    const ref = React.createRef<HTMLDivElement>();
    const { container, queryByTestId } = render(
      <AFScroller
        nativeScrollbars
        overflowXHidden
        ref={ref}
        setScrollableContainer={setScrollableContainer}
        className="synapsenote-scroll-container h-full"
      >
        content
      </AFScroller>
    );

    const scroller = container.firstElementChild as HTMLDivElement;

    expect(queryByTestId('custom-scrollbars')).toBeNull();
    expect(ScrollbarsMock).not.toHaveBeenCalled();
    expect(scroller).toBe(ref.current);
    expect(setScrollableContainer).toHaveBeenCalledWith(scroller);
    expect(scroller.classList.contains('synapsenote-scroll-container')).toBe(true);
    expect(scroller.style.overflowX).toBe('hidden');
    expect(scroller.style.overflowY).toBe('auto');
  });
});
