/**
 * The masked terminal reader.
 *
 * Driven through a fake TTY: a `PassThrough` with `isTTY` and `setRawMode`
 * bolted on, which is what `process.stdin` looks like to this module.
 */

import { describe, expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import {
  NoTerminalError,
  PasswordPromptCancelled,
  readNewPassword,
  readPasswordFromTerminal,
} from './read-password.ts';

interface FakeTty extends PassThrough {
  isTTY?: boolean;
  setRawMode?(mode: boolean): unknown;
  rawModeCalls?: boolean[];
}

function fakeTty(isTTY = true): FakeTty {
  const stream = new PassThrough() as FakeTty;
  stream.isTTY = isTTY;
  stream.rawModeCalls = [];
  stream.setRawMode = (mode: boolean) => {
    stream.rawModeCalls?.push(mode);
    return stream;
  };
  return stream;
}

function capturingOutput(): NodeJS.WritableStream & { written: string } {
  const chunks: string[] = [];
  return {
    get written() {
      return chunks.join('');
    },
    write(chunk: string) {
      chunks.push(String(chunk));
      return true;
    },
  } as unknown as NodeJS.WritableStream & { written: string };
}

/** Type a string one keystroke at a time, the way a terminal delivers it. */
function type(input: FakeTty, keys: string): void {
  for (const key of keys) input.write(key);
}

describe('readPasswordFromTerminal', () => {
  test('returns what was typed, and echoes none of it', async () => {
    const input = fakeTty();
    const output = capturingOutput();
    const pending = readPasswordFromTerminal('Password: ', { input, output });
    type(input, 'hunter2hunter2\r');
    expect(await pending).toBe('hunter2hunter2');
    // The prompt and the closing newline, and nothing that resembles the
    // password. Echoing even asterisks would leak the length.
    expect(output.written).toBe('Password: \n');
  });

  test('leaves raw mode the way it found it', async () => {
    // A terminal left in raw mode is a terminal the operator has to reset by
    // hand after the command returns.
    const input = fakeTty();
    const pending = readPasswordFromTerminal('Password: ', { input, output: capturingOutput() });
    type(input, 'secret\r');
    await pending;
    expect(input.rawModeCalls).toEqual([true, false]);
  });

  test('accepts a newline as well as a carriage return', async () => {
    const input = fakeTty();
    const pending = readPasswordFromTerminal('Password: ', { input, output: capturingOutput() });
    type(input, 'secret\n');
    expect(await pending).toBe('secret');
  });

  test('backspace deletes the last character', async () => {
    const input = fakeTty();
    const pending = readPasswordFromTerminal('Password: ', { input, output: capturingOutput() });
    type(input, 'secrey\u007ft\r');
    expect(await pending).toBe('secret');
  });

  test('backspace on an empty buffer is harmless', async () => {
    const input = fakeTty();
    const pending = readPasswordFromTerminal('Password: ', { input, output: capturingOutput() });
    type(input, '\u007f\u007fsecret\r');
    expect(await pending).toBe('secret');
  });

  test('Ctrl-U clears the line', async () => {
    const input = fakeTty();
    const pending = readPasswordFromTerminal('Password: ', { input, output: capturingOutput() });
    type(input, 'wrong\u0015right\r');
    expect(await pending).toBe('right');
  });

  test('an arrow key is dropped rather than typed', async () => {
    // Raw mode delivers arrows as an escape sequence. Without the control
    // filter, a stray left-arrow becomes three characters of password that
    // the user cannot see and will never reproduce.
    const input = fakeTty();
    const pending = readPasswordFromTerminal('Password: ', { input, output: capturingOutput() });
    type(input, 'sec\u001b[Dret\r');
    expect(await pending).toBe('secret');
  });

  test('keeps non-ASCII characters', async () => {
    const input = fakeTty();
    const pending = readPasswordFromTerminal('Password: ', { input, output: capturingOutput() });
    type(input, '비밀번호123456\r');
    expect(await pending).toBe('비밀번호123456');
  });

  test('Ctrl-C cancels and restores the terminal', async () => {
    const input = fakeTty();
    const pending = readPasswordFromTerminal('Password: ', { input, output: capturingOutput() });
    type(input, 'half\u0003');
    await expect(pending).rejects.toBeInstanceOf(PasswordPromptCancelled);
    expect(input.rawModeCalls).toEqual([true, false]);
  });

  test('Ctrl-D cancels too', async () => {
    const input = fakeTty();
    const pending = readPasswordFromTerminal('Password: ', { input, output: capturingOutput() });
    type(input, '\u0004');
    await expect(pending).rejects.toBeInstanceOf(PasswordPromptCancelled);
  });

  test('refuses when there is no terminal', async () => {
    // A pipe means no echo suppression is possible, so reading a password
    // there would silently print it into a log.
    const input = fakeTty(false);
    const output = capturingOutput();
    await expect(readPasswordFromTerminal('Password: ', { input, output })).rejects.toBeInstanceOf(
      NoTerminalError,
    );
    expect(output.written).toBe('');
  });
});

describe('readNewPassword', () => {
  const accept = () => null;

  test('asks twice and returns the password when they match', async () => {
    const asked: string[] = [];
    const result = await readNewPassword(async (label) => {
      asked.push(label);
      return 'hunter2hunter2';
    }, accept);
    expect(result).toEqual({ ok: true, password: 'hunter2hunter2' });
    expect(asked).toHaveLength(2);
  });

  test('refuses a mismatch', async () => {
    const answers = ['hunter2hunter2', 'hunterZhunterZ'];
    const result = await readNewPassword(async () => answers.shift() ?? '', accept);
    expect(result).toEqual({ ok: false, message: 'Passwords did not match.' });
  });

  test('rejects an unacceptable password before asking again', async () => {
    // Making someone type a password twice only to be told it was too short
    // the first time is a needless round trip.
    let asked = 0;
    const result = await readNewPassword(
      async () => {
        asked += 1;
        return 'short';
      },
      (password) => (password.length < 12 ? 'too short' : null),
    );
    expect(result).toEqual({ ok: false, message: 'too short' });
    expect(asked).toBe(1);
  });
});
