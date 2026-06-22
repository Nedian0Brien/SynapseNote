import { describe, expect, it, vi } from 'vitest';
import {
  getEdgeRenderStyle,
  hasRenderablePosition,
  prepareCanvasFrame,
  resolveCanvasDimensions,
} from './graphCanvasUtils.js';

describe('graphCanvasUtils', () => {
  it('x 또는 y가 0인 노드도 렌더링 가능하다고 판단한다', () => {
    expect(hasRenderablePosition({ x: 0, y: 24 })).toBe(true);
    expect(hasRenderablePosition({ x: -12, y: 0 })).toBe(true);
    expect(hasRenderablePosition({ x: null, y: 0 })).toBe(false);
    expect(hasRenderablePosition({ x: 0, y: undefined })).toBe(false);
  });

  it('줌이 커질수록 엣지 선 두께와 dash를 화면 기준으로 유지한다', () => {
    expect(getEdgeRenderStyle('directory', 2)).toEqual({
      lineWidth: 0.25,
      lineDash: [],
    });
    expect(getEdgeRenderStyle('ref', 4)).toEqual({
      lineWidth: 0.15,
      lineDash: [0.75, 0.75],
    });
  });

  it('캔버스를 디바이스 픽셀 기준으로 클리어하고 다시 DPR transform을 건다', () => {
    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      imageSmoothingEnabled: false,
      lineCap: 'butt',
      lineJoin: 'miter',
    };
    const canvas = { width: 1280, height: 960 };

    prepareCanvasFrame(ctx, canvas, 2);

    expect(ctx.setTransform).toHaveBeenNthCalledWith(1, 1, 0, 0, 1, 0, 0);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1280, 960);
    expect(ctx.setTransform).toHaveBeenNthCalledWith(2, 2, 0, 0, 2, 0, 0);
    expect(ctx.imageSmoothingEnabled).toBe(true);
    expect(ctx.lineCap).toBe('round');
    expect(ctx.lineJoin).toBe('round');
  });

  it('devicePixelContentBoxSize가 있으면 그 값을 우선 사용해 고해상도 비트맵을 만든다', () => {
    expect(resolveCanvasDimensions({
      width: 640,
      height: 480,
      dpr: 1,
      entry: {
        devicePixelContentBoxSize: [{ inlineSize: 1280, blockSize: 960 }],
      },
    })).toEqual({
      cssWidth: 640,
      cssHeight: 480,
      pixelWidth: 1280,
      pixelHeight: 960,
      effectiveDpr: 2,
    });
  });

  it('devicePixelContentBoxSize가 없으면 DPR fallback을 사용한다', () => {
    expect(resolveCanvasDimensions({
      width: 640,
      height: 480,
      dpr: 2,
      entry: null,
    })).toEqual({
      cssWidth: 640,
      cssHeight: 480,
      pixelWidth: 1280,
      pixelHeight: 960,
      effectiveDpr: 2,
    });
  });

  it('devicePixelContentBoxSize가 CSS 크기와 같더라도 DPR fallback보다 작으면 더 큰 DPR 값을 채택한다', () => {
    expect(resolveCanvasDimensions({
      width: 640,
      height: 480,
      dpr: 2,
      entry: {
        devicePixelContentBoxSize: [{ inlineSize: 640, blockSize: 480 }],
      },
    })).toEqual({
      cssWidth: 640,
      cssHeight: 480,
      pixelWidth: 1280,
      pixelHeight: 960,
      effectiveDpr: 2,
    });
  });
});
