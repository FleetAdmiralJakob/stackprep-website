// POST /api/besuch: counts a visit through a link with a source, such as a LinkedIn post.
// The script only sends it when the page was opened with utm_source or from another site.
// Nothing about the visitor is stored, only a daily counter per source and campaign.
import { callConvex, isAllowedOrigin, isBodyTooLarge, rateLimitKey, readAttribution } from './_lib/waitlist.mjs';

const noContent = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request) {
  if (!isAllowedOrigin(request) || isBodyTooLarge(request)) return new Response(null, { status: 403 });

  let form;
  try {
    form = await request.formData();
  } catch {
    return noContent();
  }

  const { source, campaign } = readAttribution(form);
  if (!source) return noContent();

  try {
    await callConvex('/campaign/visit', { source, campaign, rateLimitKey: rateLimitKey(request) });
  } catch (error) {
    // A lost count is not worth an error for the visitor.
    console.error('[besuch] count failed', error instanceof Error ? error.message : error);
  }
  return noContent();
}
