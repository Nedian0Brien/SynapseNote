import { NextResponse } from 'next/server';
import { SPLASH_DOWNLOAD_URL } from '@/lib/share-splash';
import { attribution, captureServerEvent, isPrefetchRequest, resolveDistinctId } from '@/lib/track';

/**
 * `GET /d/<encoded>/download` — the splash Download CTA target.
 *
 * 302s to the unchanged GitHub Releases asset. The DMG itself is untouched.
 */
export async function GET(
  request: Request,
  _context: { params: Promise<{ encoded: string }> },
): Promise<NextResponse> {
  const response = NextResponse.redirect(SPLASH_DOWNLOAD_URL, 302);

  // A prefetch is not a download — redirect it, don't count it. `utm_content`
  // is server-authoritative here (this route IS the share-splash CTA), so it
  // wins over any `?utm_content=` on the request.
  if (!isPrefetchRequest(request)) {
    captureServerEvent({
      event: 'dmg_downloaded',
      distinctId: resolveDistinctId(request),
      properties: { channel: 'stable', ...attribution(request), utm_content: 'share-splash' },
    });
  }

  return response;
}
