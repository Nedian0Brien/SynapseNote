import { describe, expect, mock, test } from 'bun:test';
import {
  type AppCommandWindowLike,
  attachDesktopNavigationCommands,
} from './navigation-commands.ts';

function makeWindow() {
  let listener: ((event: { preventDefault(): void }, command: string) => void) | null = null;
  const sent: Array<{ channel: string; payload: unknown }> = [];
  const window: AppCommandWindowLike = {
    on(_event, nextListener) {
      listener = nextListener;
    },
    webContents: {
      send(channel, payload) {
        sent.push({ channel, payload });
      },
    },
  };
  return {
    window,
    sent,
    fire(command: string) {
      const preventDefault = mock(() => {});
      listener?.({ preventDefault }, command);
      return preventDefault;
    },
  };
}

describe('attachDesktopNavigationCommands', () => {
  test('forwards browser backward and forward commands to renderer history', () => {
    const fake = makeWindow();
    attachDesktopNavigationCommands(fake.window);

    const backwardDefault = fake.fire('browser-backward');
    const forwardDefault = fake.fire('browser-forward');

    expect(backwardDefault).toHaveBeenCalledTimes(1);
    expect(forwardDefault).toHaveBeenCalledTimes(1);
    expect(fake.sent).toEqual([
      { channel: 'ok:menu-action', payload: 'navigate-back' },
      { channel: 'ok:menu-action', payload: 'navigate-forward' },
    ]);
  });

  test('leaves unrelated app commands untouched', () => {
    const fake = makeWindow();
    attachDesktopNavigationCommands(fake.window);

    const preventDefault = fake.fire('media-play-pause');

    expect(preventDefault).not.toHaveBeenCalled();
    expect(fake.sent).toEqual([]);
  });
});
