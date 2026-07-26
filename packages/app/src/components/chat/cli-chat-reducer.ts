import type {
  ChatActivity,
  ChatEvent,
  ChatTimelineEntry,
  CliChatSelectionContext,
} from './cli-chat-types';

export interface CliChatState {
  readonly timeline: readonly ChatTimelineEntry[];
  readonly sessionId: string | null;
  readonly running: boolean;
  readonly nextId: number;
}

export type CliChatAction =
  | {
      readonly type: 'send';
      readonly text: string;
      readonly selectionContext?: CliChatSelectionContext;
    }
  | { readonly type: 'events'; readonly events: readonly ChatEvent[] }
  | { readonly type: 'interrupt' };

export const initialCliChatState: CliChatState = {
  timeline: [],
  sessionId: null,
  running: false,
  nextId: 1,
};

export function createInitialCliChatState(sessionId: string | null): CliChatState {
  return { ...initialCliChatState, sessionId };
}

function withoutTrailingStatus(
  timeline: readonly ChatTimelineEntry[],
): readonly ChatTimelineEntry[] {
  const last = timeline.at(-1);
  return last?.type === 'activity' && last.kind === 'status' ? timeline.slice(0, -1) : timeline;
}

function findToolActivity(timeline: readonly ChatTimelineEntry[], sourceId: string): number {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index];
    if (entry?.type === 'activity' && entry.kind === 'tool' && entry.sourceId === sourceId) {
      return index;
    }
  }
  return -1;
}

export function cliChatReducer(state: CliChatState, action: CliChatAction): CliChatState {
  if (action.type === 'send') {
    return {
      ...state,
      timeline: [
        ...withoutTrailingStatus(state.timeline),
        {
          id: `message-${state.nextId}`,
          type: 'message',
          role: 'user',
          text: action.text,
          ...(action.selectionContext === undefined
            ? {}
            : { selectionContext: action.selectionContext }),
        },
      ],
      running: true,
      nextId: state.nextId + 1,
    };
  }
  if (action.type === 'interrupt') {
    const timeline = withoutTrailingStatus(state.timeline);
    return {
      ...state,
      running: false,
      timeline: [
        ...timeline,
        { id: `activity-${state.nextId}`, type: 'activity', kind: 'status', label: 'Stopped' },
      ],
      nextId: state.nextId + 1,
    };
  }

  let next = state;
  for (const event of action.events) {
    if (event.type === 'session') {
      next = { ...next, sessionId: event.sessionId };
      continue;
    }
    if (event.type === 'assistant_message') {
      const timeline = withoutTrailingStatus(next.timeline);
      next = {
        ...next,
        timeline: [
          ...timeline,
          {
            id: `message-${next.nextId}`,
            type: 'message',
            role: 'assistant',
            text: event.text,
          },
        ],
        nextId: next.nextId + 1,
      };
      continue;
    }
    if (event.type === 'assistant_delta') {
      const timeline = withoutTrailingStatus(next.timeline);
      const last = timeline.at(-1);
      if (last?.type === 'message' && last.role === 'assistant') {
        next = {
          ...next,
          timeline: [...timeline.slice(0, -1), { ...last, text: last.text + event.text }],
        };
      } else {
        next = {
          ...next,
          timeline: [
            ...timeline,
            {
              id: `message-${next.nextId}`,
              type: 'message',
              role: 'assistant',
              text: event.text,
            },
          ],
          nextId: next.nextId + 1,
        };
      }
      continue;
    }
    if (event.type === 'status') {
      const timeline = withoutTrailingStatus(next.timeline);
      next = {
        ...next,
        timeline: [
          ...timeline,
          {
            id: `activity-${next.nextId}`,
            type: 'activity',
            kind: 'status',
            label: event.label,
          },
        ],
        nextId: next.nextId + 1,
      };
      continue;
    }
    if (event.type === 'tool') {
      const timeline = withoutTrailingStatus(next.timeline);
      const existingIndex =
        event.sourceId === undefined ? -1 : findToolActivity(timeline, event.sourceId);
      if (existingIndex >= 0) {
        const existing = timeline[existingIndex] as ChatActivity;
        next = {
          ...next,
          timeline: timeline.map((entry, index) =>
            index === existingIndex
              ? {
                  ...existing,
                  ...(event.category === undefined ? {} : { category: event.category }),
                  ...(event.name === undefined ? {} : { label: event.name }),
                  ...(event.detail === undefined ? {} : { detail: event.detail }),
                  ...(event.summary === undefined ? {} : { summary: event.summary }),
                  ...(event.fullDetail === undefined ? {} : { fullDetail: event.fullDetail }),
                }
              : entry,
          ),
        };
        continue;
      }
      next = {
        ...next,
        timeline: [
          ...timeline,
          {
            id: `activity-${next.nextId}`,
            type: 'activity',
            kind: 'tool',
            ...(event.sourceId === undefined ? {} : { sourceId: event.sourceId }),
            ...(event.category === undefined ? {} : { category: event.category }),
            label: event.name ?? 'Tool',
            ...(event.detail === undefined ? {} : { detail: event.detail }),
            ...(event.summary === undefined ? {} : { summary: event.summary }),
            ...(event.fullDetail === undefined ? {} : { fullDetail: event.fullDetail }),
          },
        ],
        nextId: next.nextId + 1,
      };
      continue;
    }
    if (event.type === 'error') {
      const timeline = withoutTrailingStatus(next.timeline);
      next = {
        ...next,
        timeline: [
          ...timeline,
          {
            id: `activity-${next.nextId}`,
            type: 'activity',
            kind: 'error',
            label: event.message,
          },
        ],
        nextId: next.nextId + 1,
      };
      continue;
    }
    if (event.type === 'command_exit') {
      // A normal structured `done` or a user interrupt already ended the turn;
      // ignore the shell-level fail-safe in those cases. It is authoritative
      // only when the UI is still waiting for a completion event.
      if (!next.running) continue;
      const timeline = withoutTrailingStatus(next.timeline);
      next = {
        ...next,
        running: false,
        timeline:
          event.exitCode === 0
            ? timeline
            : [
                ...timeline,
                {
                  id: `activity-${next.nextId}`,
                  type: 'activity',
                  kind: 'error',
                  label: `The CLI exited before completing (code ${event.exitCode}).`,
                },
              ],
        nextId: event.exitCode === 0 ? next.nextId : next.nextId + 1,
      };
      continue;
    }
    next = {
      ...next,
      running: false,
      timeline: withoutTrailingStatus(next.timeline),
    };
  }
  return next;
}
