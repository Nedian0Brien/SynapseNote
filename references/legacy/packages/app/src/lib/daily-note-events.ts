const OPEN_TODAY_DAILY_NOTE_EVENT = 'synapsenote:open-today-daily-note';

export function emitOpenTodayDailyNote(): void {
  window.dispatchEvent(new Event(OPEN_TODAY_DAILY_NOTE_EVENT));
}

export function subscribeToOpenTodayDailyNote(onOpen: () => void): () => void {
  window.addEventListener(OPEN_TODAY_DAILY_NOTE_EVENT, onOpen);
  return () => window.removeEventListener(OPEN_TODAY_DAILY_NOTE_EVENT, onOpen);
}
