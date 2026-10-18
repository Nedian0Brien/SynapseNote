import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '../vendor/morrow/src/core/flashcards';
import { createReviews } from './review';

afterEach(() => {
  vi.useRealTimers();
});

const card: Card = { id: 'c1', pageId: 'p', front: 'Capital of France', back: 'Paris' };

function memoryFile(initial: string | null = null) {
  const file = { text: initial, writes: 0 };
  return {
    file,
    store: {
      read: async () => file.text,
      write: async (text: string) => {
        file.text = text;
        file.writes++;
      },
    },
  };
}

describe('reviews', () => {
  it('reads morrow review files and schedules a grade with sm-2', async () => {
    const { store } = memoryFile(JSON.stringify({ version: 1, cards: { c1: { due: '2026-10-01', interval: 6, ease: 2.5, reps: 2, lapses: 0 } } }));
    const reviews = createReviews(store);
    await reviews.load();
    expect(reviews.log().c1?.interval).toBe(6);
    reviews.grade(card, 'good', new Date(2026, 9, 19));
    // the third good review waits interval × ease days
    expect(reviews.log().c1).toMatchObject({ interval: 15, reps: 3, due: '2026-11-03' });
  });

  it('saves after a pause, or at once when flushed', async () => {
    vi.useFakeTimers();
    const { file, store } = memoryFile();
    const reviews = createReviews(store);
    await reviews.load();
    reviews.grade(card, 'again', new Date(2026, 9, 19));
    expect(file.writes).toBe(0);
    await reviews.flush();
    expect(file.writes).toBe(1);
    expect(JSON.parse(file.text!).cards.c1).toMatchObject({ lapses: 1, interval: 1, due: '2026-10-20' });
    reviews.grade(card, 'good', new Date(2026, 9, 20));
    await vi.advanceTimersByTimeAsync(800);
    expect(file.writes).toBe(2);
    await reviews.flush();
    expect(file.writes).toBe(2);
  });

  it('starts empty when the file is missing or unreadable', async () => {
    const reviews = createReviews(memoryFile('not json').store);
    await reviews.load();
    expect(reviews.log()).toEqual({});
  });
});
