import { getLLMText } from '@/lib/get-llm-text';
import { source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  const pages = source.getPages();
  const scanned = await Promise.all(pages.map((page) => getLLMText(page)));

  return new Response(scanned.join('\n\n'));
}
