// /api/waitlist/confirm: the link from the confirmation e-mail.
// GET only shows a button and POST confirms, because mail scanners open links
// on their own and would otherwise confirm addresses nobody clicked.
import { callConvex, hashToken, isAllowedOrigin, isBodyTooLarge, isWellFormedToken, pageResponse } from '../_lib/waitlist.mjs';

const invalidPage = {
  title: 'Link ungültig',
  message: 'Dieser Bestätigungslink ist abgelaufen oder wurde schon benutzt. Trag dich einfach noch einmal auf der Startseite ein.',
};

export function GET(request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!isWellFormedToken(token)) return pageResponse(400, invalidPage);

  return pageResponse(200, {
    title: 'Anmeldung bestätigen',
    message: 'Ein Klick noch, dann bist du auf der Warteliste von StackPrep.',
    form: { action: '/api/waitlist/confirm', token, label: 'Anmeldung bestätigen' },
  });
}

export async function POST(request) {
  if (!isAllowedOrigin(request) || isBodyTooLarge(request)) return pageResponse(403, invalidPage);

  let token;
  try {
    token = (await request.formData()).get('token');
  } catch {
    return pageResponse(400, invalidPage);
  }
  if (!isWellFormedToken(token)) return pageResponse(400, invalidPage);

  try {
    const result = await callConvex('/waitlist/confirm', { confirmationTokenHash: hashToken(token) });
    if (result.status !== 'confirmed') return pageResponse(400, invalidPage);

    return pageResponse(200, {
      title: 'Du bist dabei',
      message: 'Danke, deine Anmeldung ist bestätigt. Wir melden uns, sobald du mit StackPrep loslegen kannst.',
    });
  } catch (error) {
    console.error('[waitlist] confirm failed', error instanceof Error ? error.message : error);
    return pageResponse(502, {
      title: 'Das hat nicht geklappt',
      message: 'Wir konnten deine Anmeldung gerade nicht bestätigen. Bitte öffne den Link später noch einmal.',
    });
  }
}
