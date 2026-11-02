# StackPrep website

Landing page for StackPrep: AP1/AP2 exam prep for IT apprentices (Fachinformatiker:innen) and computer science students in Germany. The page itself is in German, the target audience's language.

Static site: plain HTML, one stylesheet, one small script. No build step, no dependencies, no third-party requests.

```
index.html            landing page
impressum.html        legal stub (fill in the [placeholders])
datenschutz.html      privacy draft (fill in, then have it checked)
assets/css/styles.css
assets/js/main.js     waitlist form, progressive enhancement
assets/img/           logo mark and favicon
assets/fonts/         self-hosted fonts (see below)
_headers              security headers for Netlify / Cloudflare Pages
.well-known/security.txt
robots.txt
brand/                logo files and LinkedIn banners (not linked from the site)
```

## Before going live

1. **Fonts.** Done: `assets/fonts/Sora-Variable.woff2` (Sora v17, latin subset, weights 100–800, covers ä ö ü ß „“ €), licensed under the SIL Open Font License (`assets/fonts/Sora-OFL.txt`). It is self-hosted on purpose: embedding Google Fonts from Google's servers sends visitors' IP addresses to Google, which German courts have ruled a GDPR violation (LG München I, 3 O 17493/20). Until the files are there, the page falls back to system fonts.
2. **Placeholders.** Search for `[` in `impressum.html`, `datenschutz.html` and `.well-known/security.txt`.
3. **Waitlist backend.** The form posts `multipart/form-data` to `/api/waitlist`. See the checklist below.
4. **Headers.** Make sure your host sends the headers from `_headers`. Check with <https://securityheaders.com> and <https://observatory.mozilla.org> after deploying.

## Security model

- **Strict CSP**: `default-src 'none'`, everything else `'self'`. No inline scripts, no inline styles, no `eval`, no external origins. The same policy is also set as a `<meta>` tag as a fallback; the HTTP header is the one that counts (only it can set `frame-ancestors`).
- **No third parties**: no CDN, analytics, fonts or embeds. Nothing to compromise upstream and no cookie banner needed.
- **Clickjacking**: `frame-ancestors 'none'` plus `X-Frame-Options: DENY`.
- **HSTS**: two years with subdomains. Add `; preload` and submit to hstspreload.org only once every subdomain serves HTTPS.
- **Form script** writes only `textContent`, so nothing from the server or user input can inject markup. Without JavaScript the form still posts normally with native browser validation.
- **Honeypot** field `website` catches simple bots.

## Waitlist backend checklist

The front end alone is not enough. The `/api/waitlist` endpoint must:

- Accept only `POST`, and reject requests whose `Origin` header is not your own domain (CSRF protection; the site uses no cookies).
- Validate every field on the server: `email` (max. 254 chars, valid format), `alter = 16plus`, `einwilligung = ja`. Drop the request silently with `200` if `website` is not empty.
- Rate-limit by IP (e.g. 5 requests per 10 minutes).
- Use **double opt-in**: store the entry as unconfirmed, send a confirmation link with a random, single-use, expiring token, and only count it after the click. In Germany this is required for marketing e-mails (§ 7 UWG) and is the proof of consent under the GDPR. Store the consent time and text version.
- Respond with JSON `200` on success and a `4xx` on validation errors. Never echo input back into HTML.
- Send its own security headers and `Cache-Control: no-store`.

## Same headers for other hosts

**nginx**

```nginx
add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; manifest-src 'self'; base-uri 'none'; frame-ancestors 'none'; upgrade-insecure-requests" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), interest-cohort=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Resource-Policy "same-origin" always;
server_tokens off;
```

## Local preview

```bash
python3 -m http.server 8080
```

The local server does not send the security headers; only the `<meta>` CSP applies there.
