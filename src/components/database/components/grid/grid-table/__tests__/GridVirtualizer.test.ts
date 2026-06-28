import { getGridScrollerOverflow } from '@/components/database/components/grid/grid-table/gridScrollerOverflow';

describe('getGridScrollerOverflow', () => {
  it('prevents mobile standalone grids from owning vertical scrolling', () => {
    expect(
      getGridScrollerOverflow({
        isDocumentBlock: false,
        isMobile: true,
      })
    ).toEqual({
      overflowY: 'hidden',
      overflowX: 'auto',
    });
  });

  it('keeps embedded grids in their own vertical viewport', () => {
    expect(
      getGridScrollerOverflow({
        isDocumentBlock: true,
        isMobile: true,
      })
    ).toEqual({
      overflowY: 'auto',
      overflowX: 'auto',
    });
  });

  it('keeps desktop standalone grid overflow behavior unchanged', () => {
    expect(
      getGridScrollerOverflow({
        isDocumentBlock: false,
        isMobile: false,
      })
    ).toEqual({
      overflowY: 'auto',
      overflowX: 'auto',
    });
  });
});
