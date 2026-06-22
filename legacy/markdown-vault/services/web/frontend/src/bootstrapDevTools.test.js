import { describe, expect, it, vi } from 'vitest';
import { bootstrapDevTools } from './bootstrapDevTools.js';

describe('bootstrapDevTools', () => {
  it('개발 모드에서 react-grab 로더를 호출한다', async () => {
    const loadReactGrab = vi.fn().mockResolvedValue(undefined);

    await bootstrapDevTools({ isDev: true, loadReactGrab });

    expect(loadReactGrab).toHaveBeenCalledTimes(1);
  });

  it('react-grab API를 활성화해서 오버레이를 띄운다', async () => {
    const activate = vi.fn();
    const setEnabled = vi.fn();
    const init = vi.fn(() => ({ activate, setEnabled }));
    const loadReactGrab = vi.fn().mockResolvedValue({ init });

    await bootstrapDevTools({ isDev: true, loadReactGrab });

    expect(init).toHaveBeenCalledTimes(1);
    expect(setEnabled).toHaveBeenCalledWith(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('프로덕션 모드에서는 react-grab 로더를 호출하지 않는다', async () => {
    const loadReactGrab = vi.fn().mockResolvedValue(undefined);

    await bootstrapDevTools({ isDev: false, loadReactGrab });

    expect(loadReactGrab).not.toHaveBeenCalled();
  });

  it('iframe 안에서는 react-grab 로더를 호출하지 않는다', async () => {
    const loadReactGrab = vi.fn().mockResolvedValue(undefined);

    await bootstrapDevTools({ isDev: true, isTopLevelWindow: false, loadReactGrab });

    expect(loadReactGrab).not.toHaveBeenCalled();
  });
});
