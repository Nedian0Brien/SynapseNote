import { getPlatform } from '@/utils/platform';

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
};

const setUserAgent = (userAgent: string) => {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
};

describe('getPlatform', () => {
  const originalInnerWidth = window.innerWidth;
  const originalUserAgent = window.navigator.userAgent;

  afterEach(() => {
    setViewportWidth(originalInnerWidth);
    setUserAgent(originalUserAgent);
  });

  it('treats narrow desktop browser viewports as mobile', () => {
    setViewportWidth(375);
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36');

    expect(getPlatform().isMobile).toBe(true);
  });

  it('keeps wide desktop browser viewports as desktop', () => {
    setViewportWidth(1024);
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36');

    expect(getPlatform().isMobile).toBe(false);
  });

  it('keeps mobile user agents as mobile even on wider viewports', () => {
    setViewportWidth(1024);
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148');

    expect(getPlatform().isMobile).toBe(true);
  });
});
