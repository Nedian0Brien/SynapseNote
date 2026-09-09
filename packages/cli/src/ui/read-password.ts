/**
 * Read a password from the terminal without echoing it.
 *
 * A password must never reach `argv`, and that is not a style preference: on
 * Linux every process on the host can read `/proc/<pid>/cmdline`, `docker
 * compose exec` records the whole command line in the daemon's logs, and the
 * shell writes it to history. Reading it from the terminal instead keeps it in
 * this process's memory and nowhere else.
 *
 * Node's readline has no masked mode, so the terminal is put into raw mode and
 * the keystrokes are assembled here. Raw mode also turns off the kernel's
 * Ctrl-C handling, which is why the interrupt is handled explicitly below —
 * without it, a user who changes their mind would be stuck.
 */

/** Thrown when there is no terminal to read from. */
export class NoTerminalError extends Error {
  constructor() {
    super('no terminal available to read a password from');
    this.name = 'NoTerminalError';
  }
}

/** Thrown when the user interrupts the prompt. */
export class PasswordPromptCancelled extends Error {
  constructor() {
    super('password entry cancelled');
    this.name = 'PasswordPromptCancelled';
  }
}

/** The seam tests inject. Real callers get {@link readPasswordFromTerminal}. */
export type PasswordReader = (label: string) => Promise<string>;

const ENTER = ['\r', '\n'];
const BACKSPACE = ['\u007f', '\b'];
const CTRL_C = '\u0003';
const CTRL_D = '\u0004';
const CTRL_U = '\u0015';
const ESC = '\u001b';

/**
 * The slice of `process.stdin` this needs. Structural rather than
 * `ReadStream`, so a test can hand in a plain `PassThrough` with `isTTY` and
 * `setRawMode` bolted on.
 */
interface RawInput extends NodeJS.ReadableStream {
  isTTY?: boolean;
  setRawMode?(mode: boolean): unknown;
}

/**
 * Prompt on stderr and read the answer with echo suppressed.
 *
 * Written to stderr so a `--json` stdout stream stays clean, matching
 * `confirmDestructive`.
 */
export function readPasswordFromTerminal(
  label: string,
  streams: { input?: RawInput; output?: NodeJS.WritableStream } = {},
): Promise<string> {
  const input = streams.input ?? (process.stdin as unknown as RawInput);
  const output = streams.output ?? process.stderr;
  if (input.isTTY !== true || typeof input.setRawMode !== 'function') {
    return Promise.reject(new NoTerminalError());
  }

  output.write(label);
  const wasPaused = input.isPaused();
  input.setRawMode(true);
  input.setEncoding('utf-8');
  input.resume();

  return new Promise<string>((resolve, reject) => {
    let value = '';
    let settled = false;

    function restore(): void {
      if (settled) return;
      settled = true;
      input.removeListener('data', onData);
      input.setRawMode?.(false);
      if (wasPaused) input.pause();
      output.write('\n');
    }

    // Escape-sequence state. An arrow key arrives as ESC [ D, and dropping
    // only the ESC would leave `[D` in the password — two characters the user
    // cannot see and will never reproduce.
    let inEscape = false;
    let sawIntroducer = false;

    function onData(chunk: string | Buffer): void {
      for (const ch of chunk.toString()) {
        if (inEscape) {
          if (!sawIntroducer) {
            // `[` (CSI) and `O` (SS3) introduce a longer sequence; anything
            // else is a two-character Alt-key and ends here.
            if (ch === '[' || ch === 'O') sawIntroducer = true;
            else inEscape = false;
            continue;
          }
          // CSI and SS3 sequences end at their first final byte, 0x40–0x7e.
          if (ch >= '@' && ch <= '~') {
            inEscape = false;
            sawIntroducer = false;
          }
          continue;
        }
        if (ch === ESC) {
          inEscape = true;
          sawIntroducer = false;
          continue;
        }
        if (ENTER.includes(ch)) {
          restore();
          resolve(value);
          return;
        }
        if (ch === CTRL_C || ch === CTRL_D) {
          restore();
          reject(new PasswordPromptCancelled());
          return;
        }
        if (BACKSPACE.includes(ch)) {
          value = value.slice(0, -1);
          continue;
        }
        if (ch === CTRL_U) {
          value = '';
          continue;
        }
        // Everything else below the space is a control character with no
        // business in a password.
        if (ch >= ' ' && ch !== '\u007f') value += ch;
      }
    }

    input.on('data', onData);
  });
}

/**
 * Ask twice and require a match, the standard defense against a typo becoming
 * a password nobody knows.
 *
 * @param validate - returns an operator-facing message when the password is
 *   unacceptable, or null when it is fine. Checked before the confirmation so
 *   a too-short password is rejected without making the user type it twice.
 */
export async function readNewPassword(
  read: PasswordReader,
  validate: (password: string) => string | null,
  labels: { first?: string; confirm?: string } = {},
): Promise<{ ok: true; password: string } | { ok: false; message: string }> {
  const password = await read(labels.first ?? 'New password: ');
  const problem = validate(password);
  if (problem !== null) return { ok: false, message: problem };
  const again = await read(labels.confirm ?? 'Confirm password: ');
  if (again !== password) return { ok: false, message: 'Passwords did not match.' };
  return { ok: true, password };
}
