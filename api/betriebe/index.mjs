// POST /api/betriebe: the form for training companies on the landing page.
import {
  APPRENTICE_COUNTS,
  COMPANY_CONSENT_TEXT_VERSION,
  callConvex,
  isAllowedOrigin,
  isBodyTooLarge,
  isValidCompanyName,
  isValidEmail,
  jsonResponse,
  normalizeCompanyName,
  normalizeEmail,
  pageResponse,
  rateLimitKey,
  readAttribution,
} from '../_lib/waitlist.mjs';

const MAX_PROFESSIONS_LENGTH = 300;

// Answers for browsers without JavaScript, which post the form directly.
const pages = {
  success: () => ({ title: 'Danke für eure Anfrage', message: 'Wir melden uns in den nächsten Tagen per E-Mail bei euch.' }),
  invalid: () => ({ title: 'Das hat nicht geklappt', message: 'Bitte füllt Firmenname, E-Mail-Adresse und Anzahl der Azubis aus und bestätigt das Häkchen.' }),
  limited: () => ({ title: 'Zu viele Versuche', message: 'Bitte wartet ein paar Minuten und versucht es dann noch einmal.' }),
  error: () => ({ title: 'Das hat nicht geklappt', message: 'Die Anfrage hat nicht geklappt. Bitte versucht es später noch einmal oder schreibt uns an info@stackprep.de.' }),
};

const statusCodes = { success: 200, invalid: 400, forbidden: 403, limited: 429, error: 502 };

export async function POST(request) {
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const respond = (state) => {
    const status = statusCodes[state];
    if (wantsJson) return jsonResponse(status, { ok: state === 'success', state });
    return pageResponse(status, (pages[state] ?? pages.error)());
  };

  if (!isAllowedOrigin(request)) return respond('forbidden');
  if (isBodyTooLarge(request)) return respond('invalid');

  let form;
  try {
    form = await request.formData();
  } catch {
    return respond('invalid');
  }

  // Honeypot: bots get the same answer as people, but nothing is stored.
  if (form.get('website')) return respond('success');

  const companyName = normalizeCompanyName(form.get('firma'));
  const email = normalizeEmail(form.get('email'));
  const apprenticeCount = form.get('azubis');
  // Free text and optional, so an empty field means "not given".
  const professions = typeof form.get('berufe') === 'string' ? form.get('berufe').trim().replace(/\s+/g, ' ') : '';
  if (
    !isValidCompanyName(companyName) ||
    !isValidEmail(email) ||
    !APPRENTICE_COUNTS.has(apprenticeCount) ||
    professions.length > MAX_PROFESSIONS_LENGTH ||
    form.get('einwilligung') !== 'ja'
  ) {
    return respond('invalid');
  }

  try {
    const result = await callConvex('/company/inquiry', {
      companyName,
      email,
      apprenticeCount,
      professions: professions || undefined,
      consentTextVersion: COMPANY_CONSENT_TEXT_VERSION,
      rateLimitKey: rateLimitKey(request),
      ...readAttribution(form),
    });
    if (result.status === 'rate_limited') return respond('limited');
    return respond('success');
  } catch (error) {
    console.error('[betriebe] inquiry failed', error instanceof Error ? error.message : error);
    return respond('error');
  }
}
