import { CreatePageSuccessSchema } from '@nedian0brien/synapsenote-core';
import { parseServerResponse, parseSuccessOrWarn } from '@/lib/parse-server-response';

export const DAILY_NOTES_FOLDER = 'daily';
export const DAILY_NOTE_TEMPLATE = 'daily';

export interface DailyNoteResult {
  docName: string;
  created: boolean;
}

type FetchLike = typeof fetch;

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Format the date in the browser's local timezone. Daily notes belong to the
 * day the user is living in, not the server's UTC day.
 */
export function formatLocalDailyNoteDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${padDatePart(now.getMonth() + 1)}-${padDatePart(now.getDate())}`;
}

export function dailyNoteDocName(now: Date = new Date()): string {
  return `${DAILY_NOTES_FOLDER}/${formatLocalDailyNoteDate(now)}`;
}

function hasDailyTemplate(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const folder = (body as { folder?: unknown }).folder;
  if (typeof folder !== 'object' || folder === null) return false;
  const templates = (folder as { templates_available?: unknown }).templates_available;
  return (
    Array.isArray(templates) &&
    templates.some(
      (template) =>
        typeof template === 'object' &&
        template !== null &&
        (template as { name?: unknown }).name === DAILY_NOTE_TEMPLATE,
    )
  );
}

async function resolvesDailyTemplate(fetchImpl: FetchLike): Promise<boolean> {
  try {
    const response = await fetchImpl(
      `/api/folder-config?path=${encodeURIComponent(DAILY_NOTES_FOLDER)}`,
    );
    if (!response.ok) return false;
    return hasDailyTemplate(await response.json());
  } catch {
    // Template discovery is an enhancement, not a prerequisite for opening
    // today's note. The create request below remains the authoritative action.
    return false;
  }
}

async function requestCreateDailyNote(
  fetchImpl: FetchLike,
  path: string,
  date: string,
  useTemplate: boolean,
): Promise<Response> {
  const body: { path: string; template?: string; templateDate?: string } = { path };
  if (useTemplate) {
    body.template = DAILY_NOTE_TEMPLATE;
    body.templateDate = date;
  }
  return fetchImpl('/api/create-page', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Create today's daily note or converge on the existing note when another
 * click/window won the create race. A disappearing template retries once as a
 * blank note; all other failures remain visible to the caller.
 */
export async function openOrCreateDailyNote(
  now: Date = new Date(),
  fetchImpl: FetchLike = fetch,
): Promise<DailyNoteResult> {
  const date = formatLocalDailyNoteDate(now);
  const docName = `${DAILY_NOTES_FOLDER}/${date}`;
  const path = `${docName}.md`;
  const useTemplate = await resolvesDailyTemplate(fetchImpl);
  let response = await requestCreateDailyNote(fetchImpl, path, date, useTemplate);

  // Folder templates can be edited between discovery and creation. When the
  // server rejects that stale template selection, preserve the core daily-note
  // action by retrying the same atomic create without a template.
  if (useTemplate && response.status === 400) {
    response = await requestCreateDailyNote(fetchImpl, path, date, false);
  }

  if (response.status === 409) {
    return { docName, created: false };
  }

  const parsed = await parseServerResponse(response, "Failed to open today's daily note");
  if (!parsed.ok) throw new Error(parsed.title);

  const success = parseSuccessOrWarn(CreatePageSuccessSchema, parsed.body, 'create-daily-note', {
    docName,
  });
  return { docName: success.docName, created: true };
}
