import { UIVariant } from '@/application/types';
import { shouldUseFixedDatabaseViewport } from '@/components/database/layout';

describe('shouldUseFixedDatabaseViewport', () => {
  it('keeps app standalone databases in a fixed viewport', () => {
    expect(shouldUseFixedDatabaseViewport({ isMobile: false, variant: UIVariant.App })).toBe(true);
    expect(shouldUseFixedDatabaseViewport({ isMobile: false })).toBe(true);
  });

  it('lets mobile app standalone databases flow with the page', () => {
    expect(
      shouldUseFixedDatabaseViewport({
        isMobile: true,
        variant: UIVariant.App,
      })
    ).toBe(false);
  });

  it('lets published standalone databases flow with the page', () => {
    expect(shouldUseFixedDatabaseViewport({ isMobile: false, variant: UIVariant.Publish })).toBe(false);
  });

  it('lets document block databases flow with the document', () => {
    expect(
      shouldUseFixedDatabaseViewport({
        isMobile: false,
        isDocumentBlock: true,
        variant: UIVariant.Publish,
      })
    ).toBe(false);
  });

  it('uses a fixed viewport when an embedded height is provided', () => {
    expect(
      shouldUseFixedDatabaseViewport({
        embeddedHeight: 420,
        isMobile: true,
        isDocumentBlock: true,
        variant: UIVariant.Publish,
      })
    ).toBe(true);
  });
});
