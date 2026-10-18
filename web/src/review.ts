// flashcard progress for the open vault, kept in .morrow/review.json as morrow's src/app/review.ts keeps it, with
// the same core functions; it also saves on demand, so progress is not lost when the app quits right after a grade
import { readReviewLog, schedule, writeReviewLog } from '../vendor/morrow/src/core/flashcards';
import type { Card, Grade, ReviewLog } from '../vendor/morrow/src/core/flashcards';

export interface ReviewFile {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

const SAVE_DELAY_MS = 800;

export function createReviews(file: ReviewFile) {
  let log: ReviewLog = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Promise<void> | null = null;

  const save = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = file.write(writeReviewLog(log)).finally(() => {
      pending = null;
    });
    return pending;
  };

  return {
    async load(): Promise<void> {
      try {
        const text = await file.read();
        log = readReviewLog(text ? (JSON.parse(text) as unknown) : null);
      } catch {
        log = {};
      }
    },
    log: (): ReviewLog => log,
    grade(card: Card, grade: Grade, now = new Date()): void {
      log = { ...log, [card.id]: schedule(log[card.id], grade, now) };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void save(), SAVE_DELAY_MS);
    },
    // writes a grade still waiting for its delay, and waits for a write already under way
    async flush(): Promise<void> {
      if (timer) await save();
      else if (pending) await pending;
    },
  };
}

export type Reviews = ReturnType<typeof createReviews>;
