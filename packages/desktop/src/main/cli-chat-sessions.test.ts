import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listNativeCliChatSessions, readNativeCliChatSession } from './cli-chat-sessions';

const temporaryDirectories: string[] = [];

function temporaryHome(): string {
  const path = mkdtempSync(join(tmpdir(), 'synapsenote-cli-sessions-'));
  temporaryDirectories.push(path);
  return path;
}

function writeJsonLines(path: string, rows: readonly unknown[]): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('listNativeCliChatSessions', () => {
  test('finds current-project Codex rollouts and uses the native index title', async () => {
    const homeDir = temporaryHome();
    const projectRoot = '/workspace/current';
    writeJsonLines(join(homeDir, '.codex', 'session_index.jsonl'), [
      {
        id: 'codex-current',
        thread_name: 'Indexed Codex title',
        updated_at: '2026-07-18T01:00:00Z',
      },
    ]);
    writeJsonLines(join(homeDir, '.codex', 'sessions', '2026', '07', '18', 'current.jsonl'), [
      {
        type: 'session_meta',
        timestamp: '2026-07-18T00:00:00Z',
        payload: { id: 'codex-current', cwd: projectRoot },
      },
      {
        type: 'event_msg',
        timestamp: '2026-07-18T00:01:00Z',
        payload: { type: 'user_message', message: 'Fallback title' },
      },
    ]);
    writeJsonLines(join(homeDir, '.codex', 'sessions', '2026', '07', '18', 'nested.jsonl'), [
      {
        type: 'session_meta',
        payload: { id: 'codex-nested', cwd: `${projectRoot}/packages/app` },
      },
      {
        type: 'event_msg',
        payload: { type: 'user_message', message: 'Nested project session' },
      },
    ]);
    writeJsonLines(join(homeDir, '.codex', 'sessions', '2026', '07', '18', 'other.jsonl'), [
      { type: 'session_meta', payload: { id: 'codex-other', cwd: '/workspace/other' } },
    ]);

    expect(
      (await listNativeCliChatSessions({ homeDir, projectRoot })).map(
        ({ cli, sessionId, title }) => ({
          cli,
          sessionId,
          title,
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        { cli: 'codex', sessionId: 'codex-current', title: 'Indexed Codex title' },
        { cli: 'codex', sessionId: 'codex-nested', title: 'Nested project session' },
      ]),
    );
  });

  test('merges Claude history and project logs into resumable sessions', async () => {
    const homeDir = temporaryHome();
    const projectRoot = '/workspace/current';
    writeJsonLines(join(homeDir, '.claude', 'history.jsonl'), [
      {
        project: projectRoot,
        sessionId: 'claude-history',
        display: 'History title',
        timestamp: 200,
      },
      {
        project: '/workspace/other',
        sessionId: 'claude-other',
        display: 'Other title',
        timestamp: 300,
      },
    ]);
    writeJsonLines(join(homeDir, '.claude', 'projects', '-workspace-current', 'claude-log.jsonl'), [
      {
        type: 'user',
        sessionId: 'claude-log',
        cwd: projectRoot,
        timestamp: '2026-07-18T02:00:00Z',
        message: { content: [{ type: 'text', text: 'First native Claude prompt' }] },
      },
      { type: 'ai-title', sessionId: 'claude-log', aiTitle: 'Claude generated title' },
    ]);

    const sessions = await listNativeCliChatSessions({ homeDir, projectRoot });
    expect(sessions.map(({ cli, sessionId, title }) => ({ cli, sessionId, title }))).toEqual([
      { cli: 'claude', sessionId: 'claude-log', title: 'Claude generated title' },
      { cli: 'claude', sessionId: 'claude-history', title: 'History title' },
    ]);
  });

  test('ignores malformed native records and shortens long fallback titles', async () => {
    const homeDir = temporaryHome();
    const projectRoot = '/workspace/current';
    const path = join(homeDir, '.codex', 'sessions', '2026', '07', '18', 'current.jsonl');
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(
      path,
      [
        '{broken',
        JSON.stringify({
          type: 'session_meta',
          payload: { id: 'codex-current', cwd: projectRoot },
        }),
        JSON.stringify({
          type: 'event_msg',
          payload: {
            type: 'user_message',
            message: 'A title that is deliberately much longer than the compact chat title limit',
          },
        }),
      ].join('\n'),
    );

    expect((await listNativeCliChatSessions({ homeDir, projectRoot }))[0]?.title).toBe(
      'A title that is deliberately much l…',
    );
  });

  test('shares one in-flight discovery result across simultaneous list consumers', async () => {
    const homeDir = temporaryHome();
    const projectRoot = '/workspace/current';
    writeJsonLines(join(homeDir, '.codex', 'sessions', 'current.jsonl'), [
      { type: 'session_meta', payload: { id: 'codex-current', cwd: projectRoot } },
    ]);

    const first = listNativeCliChatSessions({ homeDir, projectRoot });
    const second = listNativeCliChatSessions({ homeDir, projectRoot });
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe(secondResult);
  });

  test('invalidates sampled metadata when a session file changes', async () => {
    const homeDir = temporaryHome();
    const projectRoot = '/workspace/current';
    const path = join(homeDir, '.codex', 'sessions', 'current.jsonl');
    writeJsonLines(path, [
      { type: 'session_meta', payload: { id: 'codex-current', cwd: projectRoot } },
      { type: 'event_msg', payload: { type: 'user_message', message: 'First title' } },
    ]);
    expect((await listNativeCliChatSessions({ homeDir, projectRoot }))[0]?.title).toBe(
      'First title',
    );

    writeJsonLines(path, [
      { type: 'session_meta', payload: { id: 'codex-current', cwd: projectRoot } },
      { type: 'event_msg', payload: { type: 'user_message', message: 'Updated title' } },
    ]);
    expect((await listNativeCliChatSessions({ homeDir, projectRoot }))[0]?.title).toBe(
      'Updated title',
    );
  });

  test('recovers a visible fallback title from a user-message record larger than the ownership sample', async () => {
    const homeDir = temporaryHome();
    const projectRoot = '/workspace/current';
    const injectedContext = 'x'.repeat(80 * 1024);
    writeJsonLines(join(homeDir, '.codex', 'sessions', 'current.jsonl'), [
      { type: 'session_meta', payload: { id: 'codex-current', cwd: projectRoot } },
      {
        type: 'event_msg',
        payload: {
          type: 'user_message',
          message: `The following metadata identifies the document currently open.\n\n<current_document>\n${injectedContext}\n</current_document>\n\nUser request:\nKeep the useful title`,
        },
      },
    ]);

    expect((await listNativeCliChatSessions({ homeDir, projectRoot }))[0]?.title).toBe(
      'Keep the useful title',
    );
  });
});

describe('readNativeCliChatSession', () => {
  test('restores visible Codex turns without response-item duplicates or injected context', async () => {
    const homeDir = temporaryHome();
    const projectRoot = '/workspace/current';
    writeJsonLines(join(homeDir, '.codex', 'sessions', '2026', '07', '18', 'current.jsonl'), [
      {
        type: 'session_meta',
        payload: { id: 'codex-current', cwd: projectRoot },
      },
      {
        type: 'event_msg',
        payload: {
          type: 'user_message',
          message:
            'The following metadata identifies the document currently open.\n\n<current_document>\n{}\n</current_document>\n\nUser request:\nExplain the graph',
        },
      },
      {
        type: 'response_item',
        payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'dupe' }] },
      },
      {
        type: 'event_msg',
        payload: { type: 'agent_message', message: 'The graph connects related notes.' },
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'duplicate assistant response' }],
        },
      },
    ]);

    expect(
      await readNativeCliChatSession({
        homeDir,
        projectRoot,
        cli: 'codex',
        sessionId: 'codex-current',
      }),
    ).toEqual([
      { role: 'user', text: 'Explain the graph' },
      { role: 'assistant', text: 'The graph connects related notes.' },
    ]);
  });

  test('restores Claude text turns and ignores tool-only and sidechain records', async () => {
    const homeDir = temporaryHome();
    const projectRoot = '/workspace/current';
    writeJsonLines(join(homeDir, '.claude', 'projects', '-workspace-current', 'session.jsonl'), [
      {
        type: 'user',
        sessionId: 'claude-current',
        cwd: projectRoot,
        message: { role: 'user', content: 'Review this plan' },
      },
      {
        type: 'assistant',
        sessionId: 'claude-current',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'The plan is sound.' },
            { type: 'tool_use', id: 'tool-1', name: 'read' },
          ],
        },
      },
      {
        type: 'user',
        sessionId: 'claude-current',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-1' }] },
      },
      {
        type: 'assistant',
        sessionId: 'claude-current',
        isSidechain: true,
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hidden sidechain' }] },
      },
    ]);

    expect(
      await readNativeCliChatSession({
        homeDir,
        projectRoot,
        cli: 'claude',
        sessionId: 'claude-current',
      }),
    ).toEqual([
      { role: 'user', text: 'Review this plan' },
      { role: 'assistant', text: 'The plan is sound.' },
    ]);
  });

  test('hides the context envelope a CLI stored with transport line separators', async () => {
    const homeDir = temporaryHome();
    const projectRoot = '/workspace/current';
    // The PTY transport rewrites newlines as U+2028, so this is the exact shape
    // both CLIs persist for a SynapseNote turn — not the \n form.
    const separator = '\u2028';
    const stored = [
      'The following metadata identifies the document currently open in the SynapseNote editor.',
      '',
      '<current_document>',
      '{ "documentTitle": "Field notes", "documentPath": "note/field-notes.md" }',
      '</current_document>',
      '',
      'The user attached the following image files from the SynapseNote editor.',
      '',
      '<attached_images>',
      '[{ "path": "note/pasted.png" }]',
      '</attached_images>',
      '',
      'User request:',
      'Read this image and analyse it',
    ].join(separator);
    writeJsonLines(join(homeDir, '.claude', 'projects', '-workspace-current', 'session.jsonl'), [
      {
        type: 'user',
        sessionId: 'claude-current',
        cwd: projectRoot,
        message: { role: 'user', content: stored },
      },
    ]);

    expect(
      await readNativeCliChatSession({
        homeDir,
        projectRoot,
        cli: 'claude',
        sessionId: 'claude-current',
      }),
    ).toEqual([{ role: 'user', text: 'Read this image and analyse it' }]);
  });

  test('hides an image-only context envelope and restores the prompt line breaks', async () => {
    const homeDir = temporaryHome();
    const projectRoot = '/workspace/current';
    const separator = '\u2028';
    const stored = [
      'The user attached the following image files from the SynapseNote editor.',
      '',
      '<attached_images>',
      '[{ "path": "note/pasted.png" }]',
      '</attached_images>',
      '',
      'User request:',
      'First line',
      'Second line',
    ].join(separator);
    writeJsonLines(join(homeDir, '.codex', 'sessions', 'current.jsonl'), [
      { type: 'session_meta', payload: { id: 'codex-current', cwd: projectRoot } },
      { type: 'event_msg', payload: { type: 'user_message', message: stored } },
    ]);

    expect(
      await readNativeCliChatSession({
        homeDir,
        projectRoot,
        cli: 'codex',
        sessionId: 'codex-current',
      }),
    ).toEqual([{ role: 'user', text: 'First line\nSecond line' }]);
  });

  test('refuses a same-id transcript outside the active project', async () => {
    const homeDir = temporaryHome();
    writeJsonLines(join(homeDir, '.codex', 'sessions', 'outside.jsonl'), [
      { type: 'session_meta', payload: { id: 'shared-id', cwd: '/workspace/other' } },
      { type: 'event_msg', payload: { type: 'user_message', message: 'Private prompt' } },
    ]);

    expect(
      await readNativeCliChatSession({
        homeDir,
        projectRoot: '/workspace/current',
        cli: 'codex',
        sessionId: 'shared-id',
      }),
    ).toEqual([]);
  });
});
