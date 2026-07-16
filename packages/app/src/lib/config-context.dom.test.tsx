import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Config } from '@nedian0brien/synapsenote-core';
import { cleanup, render, screen } from '@testing-library/react';
import { ConfigContext, type ConfigContextValue, useConfigContext } from './config-context';

function makeContextValue(): ConfigContextValue {
  return {
    userBinding: null,
    userSynced: false,
    projectBinding: null,
    projectLocalBinding: null,
    okignoreBinding: null,
    okignoreSynced: false,
    userConfig: null,
    projectConfig: null,
    projectLocalConfig: null,
    projectSynced: false,
    projectLocalSynced: false,
    merged: { editor: { wordWrap: false } } as Config,
  };
}

function Consumer() {
  const ctx = useConfigContext();
  return <div data-testid="word-wrap">{String(ctx.merged?.editor?.wordWrap)}</div>;
}

describe('useConfigContext runtime guard', () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
  });

  test('throws the documented message outside <ConfigProvider />', () => {
    expect(() => {
      render(<Consumer />);
    }).toThrow('useConfigContext must be used within <ConfigProvider />');
  });

  test('returns the provided ConfigContext value', () => {
    render(
      <ConfigContext value={makeContextValue()}>
        <Consumer />
      </ConfigContext>,
    );

    expect(screen.getByTestId('word-wrap').textContent).toBe('false');
  });
});
