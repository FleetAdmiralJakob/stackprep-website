// Shared code for the waitlist endpoints. Entries are stored in Convex; this
// server only validates, hashes and (once configured) sends the confirmation e-mail.
import { createHash, createHmac, randomBytes } from 'node:crypto';

// Bump this whenever the checkbox texts in index.html change, so every stored
// consent can be matched to the text the person actually agreed to.
export const CONSENT_TEXT_VERSION = '2026-11-04';
// The same for the checkbox of the company form in index.html.
export const COMPANY_CONSENT_TEXT_VERSION = '2026-11-03';

const MAX_BODY_BYTES = 8 * 1024;
const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_COMPANY_NAME_LENGTH = 120;
const CAMPAIGN_VALUE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,39}$/;

// The values of the profession fields in index.html; Convex accepts the same list.
export const PROFESSIONS = new Set(['fi_ae', 'fi_si', 'fi_dpa', 'fi_dv', 'itse', 'kits', 'kdm', 'studium', 'andere']);
export const APPRENTICE_COUNTS = new Set(['1-5', '6-20', '21-50', '50+']);

const readEnv = (name) => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const requireEnv = (name) => {
  const value = readEnv(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

export const siteUrl = () => (readEnv('SITE_URL') ?? 'https://stackprep.de').replace(/\/+$/, '');

// The site uses no cookies, so checking Origin is enough to stop cross-site posts.
export const isAllowedOrigin = (request) => {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const allowed = new Set([siteUrl()]);
  const { hostname, protocol } = new URL(siteUrl());
  if (!hostname.startsWith('www.')) allowed.add(`${protocol}//www.${hostname}`);
  return allowed.has(origin);
};

export const isBodyTooLarge = (request) =>
  Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES;

export const normalizeEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

export const isValidEmail = (email) => email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);

export const normalizeCompanyName = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');

export const isValidCompanyName = (name) => name.length >= 2 && name.length <= MAX_COMPANY_NAME_LENGTH;

const normalizeCampaignValue = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return CAMPAIGN_VALUE_PATTERN.test(normalized) ? normalized : undefined;
};

// Where a visitor came from: the hidden fields the script fills from utm_source,
// utm_campaign or the referrer. Anything malformed is dropped, never rejected.
export const readAttribution = (form) => ({
  source: normalizeCampaignValue(form.get('quelle')),
  campaign: normalizeCampaignValue(form.get('kampagne')),
});

export const createToken = () => randomBytes(32).toString('base64url');

export const isWellFormedToken = (token) => typeof token === 'string' && TOKEN_PATTERN.test(token);

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

// Only a keyed hash of the IP reaches the database, never the address itself.
export const rateLimitKey = (request) => {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || request.headers.get('x-real-ip') || 'unknown';
  return createHmac('sha256', requireEnv('WAITLIST_API_SECRET')).update(ip).digest('hex');
};

export const callConvex = async (path, body) => {
  const baseUrl = requireEnv('CONVEX_SITE_URL').replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('WAITLIST_API_SECRET')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Convex ${path} answered ${response.status}`);
  return response.json();
};

export const isConfirmationEmailEnabled = () => Boolean(readEnv('RESEND_API_KEY') && readEnv('WAITLIST_FROM_EMAIL'));

export const sendConfirmationEmail = async (email, token) => {
  const link = `${siteUrl()}/api/waitlist/confirm?token=${token}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: requireEnv('WAITLIST_FROM_EMAIL'),
      to: [email],
      subject: 'Bitte bestätige deine Anmeldung bei stackprep',
      text: [
        'Hallo,',
        '',
        'du hast dich für die Warteliste von stackprep eingetragen. Bitte bestätige deine Anmeldung über diesen Link:',
        '',
        link,
        '',
        'Der Link ist 48 Stunden gültig. Wenn du dich nicht eingetragen hast, kannst du diese E-Mail einfach ignorieren.',
        '',
        'Dein stackprep-Team',
      ].join('\n'),
    }),
  });
  if (!response.ok) throw new Error(`Resend answered ${response.status}`);
};

const securityHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });

const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

// Plain page in the site's look for the confirmation link and for browsers without JavaScript.
// Every text passed in is a fixed string from this code, never user input.
export const pageResponse = (status, { title, message, form }) => {
  const formHtml = form
    ? `
      <form class="waitlist" action="${escapeHtml(form.action)}" method="post">
        <input type="hidden" name="token" value="${escapeHtml(form.token)}">
        <button class="pill-button" type="submit">${escapeHtml(form.label)} <span class="pill-button__arrow" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg></span></button>
      </form>`
    : `
      <p><a href="/">Zur Startseite</a></p>`;

  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(title)} · stackprep</title>
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <script src="/assets/js/theme.js"></script>
  <link rel="stylesheet" href="/assets/css/styles.css">
</head>
<body>
  <header class="site-header">
    <div class="container site-header__inner">
      <a class="brand" href="/" aria-label="stackprep, zur Startseite">
        <img class="brand__mark" src="/assets/img/logo-mark.svg" alt="" width="36" height="36">
        <span class="brand__word"><span class="brand__stack">stack</span><span class="brand__prep">prep</span></span>
      </a>
    </div>
  </header>

  <main class="legal">
    <div class="container">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>${formHtml}
    </div>
  </main>

  <footer class="site-footer">
    <div class="container site-footer__inner">
      <p>© 2026 stackprep</p>
      <ul>
        <li><a href="/impressum.html">Impressum</a></li>
        <li><a href="/datenschutz.html">Datenschutz</a></li>
      </ul>
    </div>
  </footer>
</body>
</html>
`;

  return new Response(html, {
    status,
    headers: { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  });
};
